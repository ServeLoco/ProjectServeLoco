import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOrderInvoiceHtml } from '../src/utils/orderInvoice.js';

const order = {
  order_number: 'VK-123', customer_name: 'Test Customer', phone: '9000000000',
  address: 'Sample address', status: 'Delivered', payment_method: 'Cash', payment_status: 'Success',
  subtotal: 500, delivery_charge: 30, night_charge: 10, rain_charge: 5, fast_delivery_charge: 20,
  discount_amount: 100, deal_discount_amount: 40, free_delivery_waiver_amount: 30, total: 465,
  items: [{ product_name: 'Milk', variant_label: '1 litre', quantity: 2, unit_price: 250, line_total: 500 }],
};

test('VillKro invoice shows payment, billable items, discounts and the server total', () => {
  const html = buildOrderInvoiceHtml(order);
  assert.match(html, /VillKro Invoice/);
  assert.doesNotMatch(html, /ServeLoco/);
  for (const label of ['Milk', '1 litre', 'Coupon discount', 'Deal savings', 'Delivery waiver', 'Fast delivery']) {
    assert.ok(html.includes(label));
  }
  assert.match(html, /<span class="badge">Paid<\/span>/);
  assert.match(html, /Order total<\/span><strong>₹465\.00/);
  assert.match(html, /Coupon discount<\/span><strong>−₹30\.00/);
  assert.equal((html.match(/−₹30\.00/g) || []).length, 2);
});

test('invoice excludes rejected and nonbillable items and escapes all customer text', () => {
  const html = buildOrderInvoiceHtml({ ...order, customer_name: '<script>alert(1)</script>',
    note: '<img src=x onerror=alert(1)>', items: [
      ...order.items,
      { product_name: 'Rejected product', shop_rejected_at: '2026-10-07' },
      { product_name: 'Unaccepted product', shop_billable: 0 },
    ] });
  assert.doesNotMatch(html, /Rejected product|Unaccepted product|<script>|<img/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;img/);
});
