// SQL fixture for legacy shop-action side-effect tests. Billing itself is
// exercised with real state and transactions in orderBilling tests.
function shopDecisionConnection({ orderId = 50, shopId = 1, areaId = 7, status = 'Preparing', missing = false, rejected = false } = {}) {
  const item = { id: 1, order_id: orderId, shop_id: shopId, line_total: 100, unit_price: 100,
    quantity: 1, shop_confirmed_at: null, shop_rejected_at: rejected ? new Date() : null, shop_billable: rejected ? 0 : 1 };
  const order = { id: orderId, area_id: areaId, status, customer_id: 1, subtotal: 100, total: 100 };
  return { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    query: jest.fn(async (sql) => {
      if (sql.startsWith('SELECT COUNT(*)')) return [[{ cnt: item.shop_confirmed_at == null && item.shop_rejected_at == null ? 1 : 0 }]];
      if (sql.startsWith('SELECT billing_revision')) return [[{ billing_revision: 1, updated_at: new Date() }]];
      if (sql.startsWith('SELECT * FROM orders')) return [[order]];
      if (sql.includes('SELECT * FROM order_items')) return [missing ? [] : [item]];
      if (sql.startsWith('UPDATE order_items')) {
        if (sql.includes('shop_rejected_at = COALESCE')) { item.shop_rejected_at = new Date(); item.shop_billable = 0; }
        else if (sql.includes('shop_confirmed_at = COALESCE')) { item.shop_confirmed_at = new Date(); item.shop_billable = 1; }
        else { item.shop_rejected_at = null; item.shop_confirmed_at = null; item.shop_billable = 0; }
      }
      return [{ affectedRows: 1 }];
    }),
  };
}
module.exports = { shopDecisionConnection };
