const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const money = (value) => {
  const amount = Number(value);
  return `₹${(Number.isFinite(amount) ? amount : 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function buildOrderInvoiceHtml(order) {
  const items = (order.items || []).filter(item => item.shop_rejected_at == null && Number(item.shop_billable ?? 1) === 1);
  const discount = Number(order.discount_amount) || 0;
  const dealDiscount = Number(order.deal_discount_amount) || 0;
  const waiver = Number(order.free_delivery_waiver_amount) || 0;
  const couponDiscount = Math.max(0, discount - dealDiscount - waiver);
  const paid = ['Paid', 'Success'].includes(order.payment_status);
  const summaryRow = (label, amount, saving = false) => `<div class="summary-row${saving ? ' saving' : ''}"><span>${escapeHtml(label)}</span><strong>${saving ? '−' : ''}${money(amount)}</strong></div>`;
  const itemRows = items.map((item, index) => `<tr>
    <td class="item-index">${index + 1}</td>
    <td><strong>${escapeHtml(item.product_name)}</strong>${item.variant_label ? `<small>${escapeHtml(item.variant_label)}</small>` : ''}</td>
    <td class="number">${escapeHtml(item.quantity)}</td>
    <td class="number">${money(item.unit_price)}</td>
    <td class="number item-total">${money(item.line_total)}</td>
  </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VillKro Invoice - ${escapeHtml(order.order_number)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #edf2ee; color: #182c23; font: 14px/1.6 Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .invoice { max-width: 850px; margin: 32px auto; padding: 48px; background: white; border-top: 8px solid #147d59; }
  .header { display: flex; justify-content: space-between; gap: 24px; padding-bottom: 28px; border-bottom: 1px solid #dce6df; }
  .brand { color: #147d59; font-size: 38px; font-weight: 800; letter-spacing: -1.8px; line-height: 1.1; }
  .brand span { color: #1b3328; }
  .tagline { margin-top: 10px; color: #67786f; font-size: 12px; }
  .eyebrow { margin: 0 0 8px; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #687a6f; }
  .document-meta { text-align: right; }
  h1 { margin: 0; font-size: 24px; font-weight: 500; letter-spacing: -0.6px; }
  .order-number { margin: 4px 0; font-weight: 700; font-size: 15px; overflow-wrap: anywhere; }
  .date { color: #687a6f; font-size: 12px; }
  .customer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 32px; margin: 30px 0; }
  .customer-name { margin: 0 0 5px; font-size: 18px; font-weight: 700; }
  .customer-detail { color: #53675c; white-space: pre-wrap; overflow-wrap: anywhere; }
  .payment-card { padding: 18px 20px; background: #f3f7f4; border: 1px solid #dce6df; border-radius: 12px; }
  .payment-row { display: flex; justify-content: space-between; gap: 15px; margin-top: 7px; font-size: 12px; }
  .payment-row span { color: #687a6f; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; color: #116443; border: 1px solid #bfd6c8; background: #e8f2ec; font-size: 11px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th { padding: 12px 8px; background: #f3f7f4; border-top: 1px solid #dce6df; border-bottom: 1px solid #dce6df; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; text-align: left; color: #53675c; }
  td { padding: 16px 8px; border-bottom: 1px solid #e7ede8; vertical-align: top; overflow-wrap: anywhere; }
  td strong { font-size: 13px; }
  td small { display: block; margin-top: 3px; color: #687a6f; font-size: 11px; }
  .item-index { width: 5%; color: #839389; font-size: 11px; }
  .number { text-align: right; font-variant-numeric: tabular-nums; }
  .item-total { font-weight: 700; }
  .bottom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 28px; }
  .note { color: #687a6f; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .summary-row { display: flex; justify-content: space-between; gap: 15px; padding: 5px 0; font-size: 12px; }
  .summary-row span { color: #687a6f; }
  .summary-row strong { white-space: nowrap; font-weight: 500; font-variant-numeric: tabular-nums; }
  .saving, .saving span { color: #147d59; }
  .grand-total { display: flex; justify-content: space-between; gap: 12px; padding: 18px; margin-top: 14px; border: 1px solid #147d59; border-radius: 12px; background: #edf7f0; color: #116443; }
  .grand-total span { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; align-self: center; }
  .grand-total strong { font-size: 25px; letter-spacing: -0.8px; white-space: nowrap; }
  .footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #dce6df; margin-top: 36px; padding-top: 20px; color: #687a6f; font-size: 10px; }
  .footer strong { color: #147d59; font-size: 12px; }
  @page { size: A4; margin: 15mm; }
  @media print {
    body { background: white; font-size: 12px; }
    .invoice { margin: 0; max-width: none; padding: 24px 0 0; }
    thead { display: table-header-group; }
    tr, .payment-card, .summary, .footer { break-inside: avoid; }
    .bottom-grid { break-inside: avoid; }
  }
  @media screen and (max-width: 600px) {
    .invoice { margin: 0; padding: 24px; }
    .header { gap: 12px; }
    .brand { font-size: 30px; }
    .customer-grid, .bottom-grid { grid-template-columns: 1fr; gap: 20px; }
    .footer { flex-direction: column; gap: 8px; }
    td, th { padding: 10px 4px; font-size: 11px; }
  }
</style></head><body><main class="invoice">
  <header class="header">
    <div><div class="brand">Vill<span>Kro</span></div><div class="tagline">Groceries &amp; food, delivered.</div></div>
    <div class="document-meta"><p class="eyebrow">Order invoice</p><h1>Invoice</h1><div class="order-number">#${escapeHtml(order.order_number)}</div><div class="date">${escapeHtml(formatDate(order.created_at))}</div></div>
  </header>
  <section class="customer-grid">
    <div><p class="eyebrow">Customer &amp; delivery</p><p class="customer-name">${escapeHtml(order.customer_name)}</p><div class="customer-detail">${escapeHtml(order.phone)}</div><div class="customer-detail">${escapeHtml(order.address)}</div></div>
    <div class="payment-card"><p class="eyebrow">Payment &amp; fulfillment</p><span class="badge">${escapeHtml(paid ? 'Paid' : order.payment_status || 'Pending')}</span><div class="payment-row"><span>Payment method</span><strong>${escapeHtml(order.payment_method || '—')}</strong></div><div class="payment-row"><span>Order status</span><strong>${escapeHtml(order.status || '—')}</strong></div></div>
  </section>
  <table aria-label="Invoice items"><colgroup><col style="width:5%"><col style="width:43%"><col style="width:10%"><col style="width:20%"><col style="width:22%"></colgroup><thead><tr><th>#</th><th>Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead><tbody>${itemRows || '<tr><td colspan="5">No billable items.</td></tr>'}</tbody></table>
  <section class="bottom-grid">
    <div>${order.note ? `<p class="eyebrow">Order note</p><div class="note">${escapeHtml(order.note)}</div>` : '<p class="eyebrow">Made for your everyday</p><div class="note">Your local favourites, delivered with care.</div>'}${discount > 0 ? `<p class="eyebrow" style="margin-top:24px">Your savings</p><strong style="color:#147d59;font-size:22px">${money(discount)}</strong><div class="note">Applied to this order${order.coupon_code ? ` · ${escapeHtml(order.coupon_code)}` : ''}</div>` : ''}</div>
    <div class="summary">
      ${summaryRow('Items subtotal', order.subtotal)}
      ${summaryRow('Delivery', order.delivery_charge)}
      ${Number(order.night_charge) > 0 ? summaryRow('Night delivery', order.night_charge) : ''}
      ${Number(order.rain_charge) > 0 ? summaryRow('Rain charge', order.rain_charge) : ''}
      ${Number(order.fast_delivery_charge) > 0 ? summaryRow('Fast delivery', order.fast_delivery_charge) : ''}
      ${couponDiscount > 0 ? summaryRow('Coupon discount', couponDiscount, true) : ''}
      ${dealDiscount > 0 ? summaryRow('Deal savings', dealDiscount, true) : ''}
      ${waiver > 0 ? summaryRow('Delivery waiver', waiver, true) : ''}
      <div class="grand-total"><span>Order total</span><strong>${money(order.total)}</strong></div>
    </div>
  </section>
  <footer class="footer"><div><strong>Thank you for choosing VillKro.</strong><br>Your next favourite is just an order away.</div><div>VillKro · Order invoice<br>#${escapeHtml(order.order_number)}</div></footer>
</main></body></html>`;
}
