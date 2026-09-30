// The order flow against a REAL MySQL, checking the two order-flow sweepers
// wake and sleep at the right moments (realtime/sweepGates.js):
//
//   customer orders -> admin accepts, or auto-accept after the window
//   -> shop alarm (shop-alert sweeper live) -> shop confirms
//   -> rider search / offer (rider sweeper live) -> rider accepts -> both idle
//
// Every step runs through the real code that performs it. Each sweeper's
// gate is closed first, as it would be after a quiet night, so a step that
// failed to wake its sweeper would leave a closed gate here — the stall the
// gates must never cause. hasLiveShopAlerts / hasLiveDispatch are the checks a
// sleeping sweeper relies on; they are asserted against the real rows at each
// step. Pushes, sockets and customer notifications are mocked; the database
// is not.
//
// See tests/helpers/realMysql.js for the RUN_DB_TESTS gate.

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const mockedModule = (modulePath) => {
  const actual = jest.requireActual(modulePath);
  return Object.fromEntries(
    Object.entries(actual).map(([key, value]) => [
      key,
      typeof value === 'function' ? jest.fn().mockResolvedValue(null) : value,
    ])
  );
};

jest.mock('../../src/realtime/socket', () => mockedModule('../../src/realtime/socket'));
jest.mock('../../src/realtime/orderEvents', () => mockedModule('../../src/realtime/orderEvents'));
jest.mock('../../src/utils/notificationService', () => mockedModule('../../src/utils/notificationService'));
jest.mock('../../src/utils/expoPush', () => mockedModule('../../src/utils/expoPush'));
jest.mock('../../src/utils/fcmAlarmPush', () => mockedModule('../../src/utils/fcmAlarmPush'));
jest.mock('../../src/utils/adminNotifications', () => mockedModule('../../src/utils/adminNotifications'));

const {
  DB_TESTS_ENABLED,
  describeWithMysql,
  assertMysqlReady,
  pool,
  sleep,
  FIXTURE_TAG,
  createUser,
  createOrderRow,
} = require('../helpers/realMysql');
const gates = require('../../src/realtime/sweepGates');
const areaScope = require('../../src/utils/areaScope');
const adminRoutes = require('../../src/routes/adminRoutes');
const { acceptPendingOrder } = require('../../src/realtime/orderAutoAccept');
const { confirmShopOrder, rejectShopOrder, resendShopOrder } = require('../../src/services/shopOrderActions');
const { hasLiveShopAlerts, tick: shopAlertTick } = require('../../src/realtime/shopAlertSweeper');
const { tick: riderTick } = require('../../src/realtime/riderOfferSweeper');
const {
  hasLiveDispatch,
  createOffer,
  acceptOffer,
} = require('../../src/services/riderAssignment');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const superToken = jwt.sign(
  { id: 'super', role: 'admin', adminRole: 'super_admin', areaId: null },
  process.env.JWT_SECRET || 'secret'
);

// As after a quiet night: the last check found nothing.
const putToSleep = (gate) => gate.close(gate.checkpoint());

const waitFor = async (check, what) => {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
};

const assignmentStatusOf = async (orderId) => {
  const [[row]] = await pool.query('SELECT rider_assignment_status FROM orders WHERE id = ?', [orderId]);
  return row.rider_assignment_status;
};

describeWithMysql('order flow wakes and idles the sweepers', () => {
  let areaId;
  let customer;
  let shopId;
  let rider;

  const createShopOrder = async () => {
    const orderId = await createOrderRow(customer, { status: 'Pending', areaId });
    await pool.query(
      `INSERT INTO order_items (area_id, order_id, product_id, shop_id, item_type, product_name,
                                quantity, unit_price, line_total, shop_unit_price, shop_line_total)
       VALUES (?, ?, 0, ?, 'product', ?, 1, 100, 100, 80, 80)`,
      [areaId, orderId, shopId, `${FIXTURE_TAG} dosa`]
    );
    const [[order]] = await pool.query('SELECT order_number FROM orders WHERE id = ?', [orderId]);
    return { orderId, orderNumber: order.order_number };
  };

  beforeAll(async () => {
    await assertMysqlReady();
    areaScope._resetCachesForTests();
    const [area] = await pool.query(
      'INSERT INTO areas (code, name, active) VALUES (?, ?, 1)',
      [`${FIXTURE_TAG}SW`.slice(0, 16), `${FIXTURE_TAG} sweepers`]
    );
    areaId = area.insertId;
    customer = await createUser('Sweeper customer');
    const owner = await createUser('Sweeper shop owner');
    const [shop] = await pool.query(
      'INSERT INTO shops (name, area_id, owner_user_id, active, is_open) VALUES (?, ?, ?, 1, 1)',
      [`${FIXTURE_TAG} shop`, areaId, owner]
    );
    shopId = shop.insertId;
    // Offline, so the rider search waits instead of offering on its own.
    const riderUser = await createUser('Sweeper rider');
    const [riderRow] = await pool.query(
      'INSERT INTO riders (user_id, display_name, area_id, active, is_online) VALUES (?, ?, ?, 1, 0)',
      [riderUser, `${FIXTURE_TAG} rider`, areaId]
    );
    rider = { id: riderRow.insertId, user_id: riderUser };
  });

  afterAll(async () => {
    await pool.query('DELETE FROM orders WHERE area_id = ?', [areaId]); // items and offers cascade
    await pool.query('DELETE FROM riders WHERE id = ?', [rider.id]);
    await pool.query('DELETE FROM shops WHERE id = ?', [shopId]);
    await pool.query('DELETE FROM users WHERE name LIKE ?', [`${FIXTURE_TAG} %`]);
    await pool.query('DELETE FROM areas WHERE id = ?', [areaId]);
  });

  it('auto-accept -> shop alarm -> shop confirms -> rider offer -> rider accepts', async () => {
    const { orderId, orderNumber } = await createShopOrder();
    putToSleep(gates.shopAlerts);
    putToSleep(gates.riderDispatch);
    expect(await hasLiveShopAlerts()).toBe(false); // Pending: shops not told yet

    // Auto-accept (the admin didn't act in time): the shop is alarmed, and
    // the shop-alert sweeper must now run its retries.
    await acceptPendingOrder(orderId, orderNumber);
    expect(gates.shopAlerts.isClosed()).toBe(false);
    expect(await hasLiveShopAlerts()).toBe(true);
    // No rider work yet — a shop order waits for the shop.
    expect(gates.riderDispatch.isClosed()).toBe(true);
    expect(await hasLiveDispatch()).toBe(false);

    // The shop confirms: its alarm work is over, the rider search starts.
    expect(await confirmShopOrder(shopId, orderId)).toMatchObject({ ok: true });
    await waitFor(async () => (await assignmentStatusOf(orderId)) === 'searching', 'the rider search');
    expect(await hasLiveShopAlerts()).toBe(false);
    expect(gates.riderDispatch.isClosed()).toBe(false);
    expect(await hasLiveDispatch()).toBe(true); // waiting for a rider

    // An offer goes out (the sweeper's rescan does this once a rider is online).
    putToSleep(gates.riderDispatch);
    const { offer } = await createOffer(orderId, rider);
    expect(offer).toBeTruthy();
    expect(gates.riderDispatch.isClosed()).toBe(false);
    expect(await hasLiveDispatch()).toBe(true);

    // The rider accepts: nothing left for either sweeper.
    expect(await acceptOffer(offer.id, rider.id)).toMatchObject({ ok: true });
    expect(await hasLiveDispatch()).toBe(false);
    expect(await hasLiveShopAlerts()).toBe(false);
  });

  it('an admin accept wakes the shop alarm sweeper the same way', async () => {
    const { orderId } = await createShopOrder();
    putToSleep(gates.shopAlerts);

    const res = await request(app)
      .patch(`/api/admin/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${superToken}`)
      .set('X-Area-Id', String(areaId))
      .send({ status: 'Accepted' });
    expect(res.statusCode).toBe(200);
    expect(gates.shopAlerts.isClosed()).toBe(false);
    expect(await hasLiveShopAlerts()).toBe(true);

    expect(await confirmShopOrder(shopId, orderId)).toMatchObject({ ok: true });
    await waitFor(async () => (await assignmentStatusOf(orderId)) === 'searching', 'the rider search');
  });

  it('resending a rejected order to its shop wakes the shop alarm sweeper', async () => {
    const { orderId, orderNumber } = await createShopOrder();
    // A second shop line keeps the order alive when this shop rejects.
    const owner2 = await createUser('Second shop owner');
    const [shop2] = await pool.query(
      'INSERT INTO shops (name, area_id, owner_user_id, active, is_open) VALUES (?, ?, ?, 1, 1)',
      [`${FIXTURE_TAG} shop 2`, areaId, owner2]
    );
    await pool.query(
      `INSERT INTO order_items (area_id, order_id, product_id, shop_id, item_type, product_name,
                                quantity, unit_price, line_total)
       VALUES (?, ?, 0, ?, 'product', ?, 1, 50, 50)`,
      [areaId, orderId, shop2.insertId, `${FIXTURE_TAG} tea`]
    );
    try {
      await acceptPendingOrder(orderId, orderNumber);
      expect(await rejectShopOrder(shopId, orderId)).toMatchObject({ ok: true });
      expect(await confirmShopOrder(shop2.insertId, orderId)).toMatchObject({ ok: true });
      await waitFor(async () => (await assignmentStatusOf(orderId)) === 'searching', 'the rider search');
      expect(await hasLiveShopAlerts()).toBe(false); // every shop has answered

      putToSleep(gates.shopAlerts);
      expect(await resendShopOrder(shopId, orderId)).toMatchObject({ ok: true });
      expect(gates.shopAlerts.isClosed()).toBe(false);
      expect(await hasLiveShopAlerts()).toBe(true);
    } finally {
      await pool.query('DELETE FROM orders WHERE id = ?', [orderId]);
      await pool.query('DELETE FROM shops WHERE id = ?', [shop2.insertId]);
    }
  });

  it('a house-only order wakes the rider sweeper straight from accept', async () => {
    const orderId = await createOrderRow(customer, { status: 'Pending', areaId });
    await pool.query(
      `INSERT INTO order_items (area_id, order_id, product_id, item_type, product_name, quantity, unit_price, line_total)
       VALUES (?, ?, 0, 'product', ?, 1, 40, 40)`,
      [areaId, orderId, `${FIXTURE_TAG} water`]
    );
    const [[order]] = await pool.query('SELECT order_number FROM orders WHERE id = ?', [orderId]);
    putToSleep(gates.riderDispatch);

    await acceptPendingOrder(orderId, order.order_number);
    await waitFor(async () => (await assignmentStatusOf(orderId)) === 'searching', 'the rider search');
    expect(gates.riderDispatch.isClosed()).toBe(false);
    expect(await hasLiveDispatch()).toBe(true);
  });

  it('a sleeping sweeper sends no query at all; an open one checks once before sleeping', async () => {
    // Nothing of this file's is live any more once the orders are finished.
    await pool.query("UPDATE orders SET status = 'Delivered', rider_assignment_status = 'none' WHERE area_id = ?", [areaId]);
    await pool.query("UPDATE rider_order_offers SET status = 'cancelled' WHERE status = 'pending' AND rider_id = ?", [rider.id]);

    const spy = jest.spyOn(pool, 'query');
    try {
      putToSleep(gates.shopAlerts);
      putToSleep(gates.riderDispatch);
      await shopAlertTick();
      await riderTick();
      expect(spy).not.toHaveBeenCalled();

      // Woken with nothing live: one check each, then asleep again.
      gates.shopAlerts.wake();
      gates.riderDispatch.wake();
      await shopAlertTick();
      await riderTick();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(gates.shopAlerts.isClosed()).toBe(true);
      expect(gates.riderDispatch.isClosed()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});

afterAll(async () => {
  if (DB_TESTS_ENABLED) await pool.end();
});
