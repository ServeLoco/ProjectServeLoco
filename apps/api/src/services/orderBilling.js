const { roundMoney, toMoney } = require('../utils/money');

const isBillableItem = (item) => item.shop_rejected_at == null && Number(item.shop_billable ?? 1) === 1;
const dealSaving = (item) => roundMoney(Math.max(0,
  (toMoney(item.unit_price) - toMoney(item.deal_price)) * (Number(item.deal_qty) || 0)));

// Preserve the promotion granted at checkout, including its effective rate
// after caps/flat discounts. Removing a line removes its share of the saving;
// acceptance restores it without consulting a changed/deleted live coupon.
function billingSnapshot(order, items) {
  if (order.billing_snapshot) {
    return typeof order.billing_snapshot === 'string' ? JSON.parse(order.billing_snapshot) : order.billing_snapshot;
  }
  const basis = roundMoney(items.reduce((sum, it) => sum + toMoney(it.line_total) - dealSaving(it), 0));
  return {
    couponBasis: basis,
    couponItemsDiscount: Math.max(0, roundMoney(toMoney(order.discount_amount)
      - toMoney(order.deal_discount_amount) - toMoney(order.free_delivery_waiver_amount))),
    deliveryWaiver: toMoney(order.free_delivery_waiver_amount),
    charges: Object.fromEntries(['delivery_charge', 'fast_delivery_charge', 'night_charge', 'rain_charge'].map(key => [key, toMoney(order[key])])),
  };
}

function calculateOrderBilling(order, items) {
  const snapshot = billingSnapshot(order, items);
  const included = items.filter(isBillableItem);
  const subtotal = roundMoney(included.reduce((sum, it) => sum + toMoney(it.line_total), 0));
  const dealDiscount = roundMoney(included.reduce((sum, it) => sum + dealSaving(it), 0));
  const basis = Math.max(0, roundMoney(subtotal - dealDiscount));
  const couponItemsDiscount = roundMoney(Math.min(basis, snapshot.couponBasis > 0
    ? snapshot.couponItemsDiscount * basis / snapshot.couponBasis : 0));
  const waiver = included.length ? snapshot.deliveryWaiver : 0;
  const discount = roundMoney(dealDiscount + couponItemsDiscount + waiver);
  const chargeLines = Object.fromEntries(Object.entries(snapshot.charges).map(([key, value]) => [key, included.length ? value : 0]));
  const charges = Object.values(chargeLines).reduce((sum, amount) => sum + amount, 0);
  return { ...chargeLines, subtotal, discount_amount: discount, deal_discount_amount: dealDiscount,
    free_delivery_waiver_amount: waiver,
    total: included.length ? roundMoney(Math.max(0, subtotal + charges - discount)) : 0,
    billing_snapshot: snapshot };
}

// Caller holds orders FOR UPDATE before touching its items. All decisions,
// edits, totals and redemption accounting use that same transaction/lock.
async function saveOrderBilling(connection, order, { priceEdit = false } = {}) {
  const [items] = await connection.query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id FOR UPDATE', [order.id]);
  if (priceEdit) {
    const snapshot = billingSnapshot(order, items);
    // Substitution preserves the granted coupon amount, like the existing
    // edit flow; its allocation basis follows the new full item prices.
    snapshot.couponBasis = roundMoney(items.reduce((sum, it) => sum + toMoney(it.line_total) - dealSaving(it), 0));
    order = { ...order, billing_snapshot: snapshot };
  }
  const bill = calculateOrderBilling(order, items);
  await connection.query(`UPDATE orders SET subtotal = ?, total = ?, discount_amount = ?,
    deal_discount_amount = ?, free_delivery_waiver_amount = ?, billing_snapshot = ?,
    delivery_charge = ?, fast_delivery_charge = ?, night_charge = ?, rain_charge = ?, billing_revision = billing_revision + 1 WHERE id = ?`,
  [bill.subtotal, bill.total, bill.discount_amount, bill.deal_discount_amount,
    bill.free_delivery_waiver_amount, JSON.stringify(bill.billing_snapshot),
    bill.delivery_charge, bill.fast_delivery_charge, bill.night_charge, bill.rain_charge, order.id]);
  if (order.coupon_id) {
    await connection.query('UPDATE coupon_redemptions SET discount_amount = ? WHERE order_id = ? AND coupon_id = ?',
      [roundMoney(bill.discount_amount - bill.deal_discount_amount), order.id, order.coupon_id]);
  }
  if (order.deal_coupon_id) {
    await connection.query('UPDATE coupon_redemptions SET discount_amount = ? WHERE order_id = ? AND coupon_id = ?',
      [bill.deal_discount_amount, order.id, order.deal_coupon_id]);
  }
  const [[saved]] = await connection.query('SELECT billing_revision, updated_at FROM orders WHERE id = ?', [order.id]);
  return { ...order, ...bill, ...saved, items };
}
module.exports = { isBillableItem, billingSnapshot, calculateOrderBilling, saveOrderBilling };
