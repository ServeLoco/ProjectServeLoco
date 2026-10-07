// Business insights for the Profit & Payouts report: daily trend, busiest
// hours, new vs returning customers, and losses (cancels, shop rejections,
// discounts). Every money figure uses the same basis as getProfitSummary —
// Delivered orders only, shop cost from the shop_line_total snapshot with
// rejected / unbillable / unpriced lines excluded — so the trend adds up to
// the Net Profit card exactly. The one deliberate exception is the losses
// block, which looks at every order placed in the period: a cancelled order
// or a shop rejection is a loss whatever the order's final status.
const config = require('../config/env');
const { roundMoney, toMoney } = require('../utils/money');

// Longer ranges switch the trend from one bar per day to one per month.
const MAX_DAILY_BUCKETS = 62;
const TOP_LIST_LIMIT = 8;

const BILLABLE_SHOP_COST = 'oi.shop_rejected_at IS NULL AND oi.shop_billable = 1 AND oi.shop_line_total IS NOT NULL';

const count = (value) => Number(value) || 0;
const percent = (part, whole) => (whole > 0 ? roundMoney((part / whole) * 100) : 0);

const pad2 = (n) => String(n).padStart(2, '0');
const nextDay = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
};
const nextMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad2(m + 1)}`;
};
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

const emptyBucket = (key) => ({ key, deliveredOrders: 0, appSales: 0, customerPaid: 0, shopCost: 0, netProfit: 0 });

// Turns the per-day rows into a gap-free series. 'all' has no fixed range,
// so it spans the first to the last day that had a delivered order.
function buildTrend(resolved, orderRows, costRows) {
  const byDay = new Map();
  for (const row of orderRows) {
    byDay.set(row.biz_day, {
      ...emptyBucket(row.biz_day),
      deliveredOrders: count(row.delivered_orders),
      appSales: toMoney(row.app_sales),
      customerPaid: toMoney(row.customer_paid),
    });
  }
  for (const row of costRows) {
    const bucket = byDay.get(row.biz_day) || emptyBucket(row.biz_day);
    bucket.shopCost = toMoney(row.shop_cost);
    byDay.set(row.biz_day, bucket);
  }

  const days = [...byDay.keys()].sort();
  const from = resolved.from || days[0];
  const to = resolved.to || days[days.length - 1];
  if (!from || !to) return { granularity: 'day', points: [] };

  const granularity = daysBetween(from, to) > MAX_DAILY_BUCKETS ? 'month' : 'day';
  const points = [];
  if (granularity === 'day') {
    for (let day = from; day <= to; day = nextDay(day)) {
      points.push(byDay.get(day) || emptyBucket(day));
    }
  } else {
    const byMonth = new Map();
    for (const bucket of byDay.values()) {
      const month = bucket.key.slice(0, 7);
      const total = byMonth.get(month) || emptyBucket(month);
      total.deliveredOrders += bucket.deliveredOrders;
      total.appSales = roundMoney(total.appSales + bucket.appSales);
      total.customerPaid = roundMoney(total.customerPaid + bucket.customerPaid);
      total.shopCost = roundMoney(total.shopCost + bucket.shopCost);
      byMonth.set(month, total);
    }
    for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) {
      points.push(byMonth.get(month) || emptyBucket(month));
    }
  }
  for (const point of points) point.netProfit = roundMoney(point.customerPaid - point.shopCost);
  return { granularity, points };
}

function buildHours(rows) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, deliveredOrders: 0, customerPaid: 0 }));
  for (const row of rows) {
    const hour = count(row.hour_of_day);
    if (hour < 0 || hour > 23) continue;
    hours[hour] = { hour, deliveredOrders: count(row.delivered_orders), customerPaid: toMoney(row.customer_paid) };
  }
  // Ties go to the earlier hour so the answer is stable.
  const busiest = hours.reduce((best, h) => (h.deliveredOrders > best.deliveredOrders ? h : best), hours[0]);
  return { hours, busiestHour: busiest.deliveredOrders > 0 ? busiest.hour : null };
}

function buildCustomers(row) {
  const customers = count(row.customers);
  const newCustomers = count(row.new_customers);
  const orders = count(row.order_count);
  const newCustomerOrders = count(row.new_customer_orders);
  const customerPaid = toMoney(row.customer_paid);
  const newCustomerPaid = toMoney(row.new_customer_paid);
  const repeatCustomers = count(row.repeat_customers);
  return {
    customers,
    newCustomers,
    returningCustomers: customers - newCustomers,
    newCustomerOrders,
    returningCustomerOrders: orders - newCustomerOrders,
    newCustomerPaid,
    returningCustomerPaid: roundMoney(customerPaid - newCustomerPaid),
    repeatCustomers,
    repeatRate: percent(repeatCustomers, customers),
    ordersPerCustomer: customers > 0 ? roundMoney(orders / customers) : 0,
    spendPerCustomer: customers > 0 ? roundMoney(customerPaid / customers) : 0,
  };
}

function buildLosses({ placedRow, reasonRows, shopRows, discountRow, couponRows }) {
  const placedOrders = count(placedRow.placed_orders);
  const cancelledOrders = count(placedRow.cancelled_orders);

  let shopLines = 0;
  let rejectedLines = 0;
  let rejectedValue = 0;
  const shops = shopRows.map((row) => {
    const lines = count(row.item_lines);
    const rejected = count(row.rejected_lines);
    const value = toMoney(row.rejected_value);
    shopLines += lines;
    rejectedLines += rejected;
    rejectedValue = roundMoney(rejectedValue + value);
    return {
      shopId: row.shop_id,
      shopName: row.shop_name || 'Deleted Shop',
      area_id: row.area_id,
      lines,
      rejectedLines: rejected,
      rejectedValue: value,
      rejectRate: percent(rejected, lines),
    };
  });
  const rejectionsByShop = shops
    .filter((shop) => shop.rejectedLines > 0)
    .sort((a, b) => b.rejectedLines - a.rejectedLines || b.rejectedValue - a.rejectedValue)
    .slice(0, TOP_LIST_LIMIT);

  const discount = toMoney(discountRow.discount);
  const dealDiscount = toMoney(discountRow.deal_discount);
  const freeDeliveryWaiver = toMoney(discountRow.free_delivery_waiver);
  const appSales = toMoney(discountRow.app_sales);

  return {
    placedOrders,
    cancelledOrders,
    cancelledValue: toMoney(placedRow.cancelled_value),
    cancelRate: percent(cancelledOrders, placedOrders),
    cancelReasons: reasonRows.map((row) => ({ reason: row.reason, orders: count(row.order_count), value: toMoney(row.value) })),
    shopLines,
    rejectedLines,
    rejectedValue,
    rejectRate: percent(rejectedLines, shopLines),
    rejectionsByShop,
    discount,
    // discount_amount = deal saving + coupon item discount + free-delivery waiver (orderBilling.js).
    dealDiscount,
    freeDeliveryWaiver,
    couponItemDiscount: roundMoney(discount - dealDiscount - freeDeliveryWaiver),
    discountedOrders: count(discountRow.discounted_orders),
    deliveredOrders: count(discountRow.delivered_orders),
    discountedOrdersPaid: toMoney(discountRow.discounted_orders_paid),
    discountShareOfSales: percent(discount, appSales),
    topCoupons: couponRows.map((row) => ({
      code: row.coupon_code,
      title: row.coupon_title || null,
      orders: count(row.order_count),
      cost: toMoney(row.cost),
      customerPaid: toMoney(row.customer_paid),
    })),
  };
}

// dateFilter comes from buildPeriodDateFilter(resolved, areaId), the same
// clause the summary uses. Business-day/hour bucketing converts created_at
// with the same session -> business timezone pair as that clause.
async function buildProfitInsights(pool, resolved, areaId, dateFilter) {
  const { clause, params } = dateFilter;
  const tz = [config.MYSQL_SESSION_TZ_SQL, resolved.timezone];
  const bizDay = "DATE_FORMAT(CONVERT_TZ(o.created_at, ?, ?), '%Y-%m-%d')";

  // A customer is new when they had no delivered order before this period
  // (in this area, or anywhere for the all-areas view). For "all time"
  // everyone is new by definition.
  let isNew = '1';
  const isNewParams = [];
  if (resolved.key !== 'all') {
    const sameArea = areaId !== 'all' ? ' AND p.area_id = ?' : '';
    isNew = `CASE WHEN EXISTS (SELECT 1 FROM orders p WHERE p.customer_id = o.customer_id
      AND p.status = 'Delivered' AND DATE(CONVERT_TZ(p.created_at, ?, ?)) < ?${sameArea}) THEN 0 ELSE 1 END`;
    isNewParams.push(...tz, resolved.from);
    if (sameArea) isNewParams.push(areaId);
  }

  const [
    [dayRows], [dayCostRows], [hourRows], [[customerRow]],
    [[placedRow]], [reasonRows], [shopRows], [[discountRow]], [couponRows],
  ] = await Promise.all([
    pool.query(`
      SELECT ${bizDay} AS biz_day, COUNT(*) AS delivered_orders,
        COALESCE(SUM(o.subtotal), 0) AS app_sales, COALESCE(SUM(o.total), 0) AS customer_paid
      FROM orders o
      WHERE o.status = 'Delivered' AND ${clause}
      GROUP BY biz_day
    `, [...tz, ...params]),
    pool.query(`
      SELECT ${bizDay} AS biz_day, COALESCE(SUM(oi.shop_line_total), 0) AS shop_cost
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status = 'Delivered' AND ${clause} AND ${BILLABLE_SHOP_COST}
      GROUP BY biz_day
    `, [...tz, ...params]),
    pool.query(`
      SELECT HOUR(CONVERT_TZ(o.created_at, ?, ?)) AS hour_of_day, COUNT(*) AS delivered_orders,
        COALESCE(SUM(o.total), 0) AS customer_paid
      FROM orders o
      WHERE o.status = 'Delivered' AND ${clause}
      GROUP BY hour_of_day
    `, [...tz, ...params]),
    pool.query(`
      SELECT COUNT(*) AS customers,
        COALESCE(SUM(c.is_new), 0) AS new_customers,
        COALESCE(SUM(CASE WHEN c.order_count >= 2 THEN 1 ELSE 0 END), 0) AS repeat_customers,
        COALESCE(SUM(c.order_count), 0) AS order_count,
        COALESCE(SUM(CASE WHEN c.is_new = 1 THEN c.order_count ELSE 0 END), 0) AS new_customer_orders,
        COALESCE(SUM(c.paid), 0) AS customer_paid,
        COALESCE(SUM(CASE WHEN c.is_new = 1 THEN c.paid ELSE 0 END), 0) AS new_customer_paid
      FROM (
        SELECT o.customer_id, COUNT(*) AS order_count, SUM(o.total) AS paid, ${isNew} AS is_new
        FROM orders o
        WHERE o.status = 'Delivered' AND ${clause}
        GROUP BY o.customer_id
      ) c
    `, [...isNewParams, ...params]),
    pool.query(`
      SELECT COUNT(*) AS placed_orders,
        COALESCE(SUM(CASE WHEN o.status = 'Cancelled' THEN 1 ELSE 0 END), 0) AS cancelled_orders,
        COALESCE(SUM(CASE WHEN o.status = 'Cancelled' THEN o.total ELSE 0 END), 0) AS cancelled_value
      FROM orders o
      WHERE ${clause}
    `, params),
    pool.query(`
      SELECT COALESCE(NULLIF(TRIM(o.cancel_reason), ''), 'No reason given') AS reason,
        COUNT(*) AS order_count, COALESCE(SUM(o.total), 0) AS value
      FROM orders o
      WHERE o.status = 'Cancelled' AND ${clause}
      GROUP BY reason
      ORDER BY order_count DESC, reason
      LIMIT ${TOP_LIST_LIMIT}
    `, params),
    pool.query(`
      SELECT oi.shop_id, s.name AS shop_name, oi.area_id AS area_id,
        COUNT(*) AS item_lines,
        COALESCE(SUM(CASE WHEN oi.shop_rejected_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS rejected_lines,
        COALESCE(SUM(CASE WHEN oi.shop_rejected_at IS NOT NULL THEN oi.line_total ELSE 0 END), 0) AS rejected_value
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      LEFT JOIN shops s ON s.id = oi.shop_id
      WHERE oi.shop_id IS NOT NULL AND ${clause}
      GROUP BY oi.shop_id, s.name, oi.area_id
    `, params),
    pool.query(`
      SELECT COUNT(*) AS delivered_orders,
        COUNT(CASE WHEN o.discount_amount > 0 THEN 1 END) AS discounted_orders,
        COALESCE(SUM(o.discount_amount), 0) AS discount,
        COALESCE(SUM(o.deal_discount_amount), 0) AS deal_discount,
        COALESCE(SUM(o.free_delivery_waiver_amount), 0) AS free_delivery_waiver,
        COALESCE(SUM(CASE WHEN o.discount_amount > 0 THEN o.total ELSE 0 END), 0) AS discounted_orders_paid,
        COALESCE(SUM(o.subtotal), 0) AS app_sales
      FROM orders o
      WHERE o.status = 'Delivered' AND ${clause}
    `, params),
    pool.query(`
      SELECT o.coupon_code, MAX(o.coupon_title) AS coupon_title, COUNT(*) AS order_count,
        COALESCE(SUM(o.discount_amount - o.deal_discount_amount), 0) AS cost,
        COALESCE(SUM(o.total), 0) AS customer_paid
      FROM orders o
      WHERE o.status = 'Delivered' AND o.coupon_code IS NOT NULL AND o.coupon_code <> '' AND ${clause}
      GROUP BY o.coupon_code
      ORDER BY cost DESC, order_count DESC
      LIMIT ${TOP_LIST_LIMIT}
    `, params),
  ]);

  return {
    trend: buildTrend(resolved, dayRows, dayCostRows),
    ...buildHours(hourRows),
    customers: buildCustomers(customerRow),
    losses: buildLosses({ placedRow, reasonRows, shopRows, discountRow, couponRows }),
  };
}

module.exports = { buildProfitInsights, MAX_DAILY_BUCKETS };
