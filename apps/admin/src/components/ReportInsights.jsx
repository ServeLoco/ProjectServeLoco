import React, { useState } from 'react';
import AdminIcon from './AdminIcon';

// Every number shown here comes straight from /reports/profit/insights; this
// file only formats it and turns it into bar geometry.
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const money = (value) => '₹' + finite(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyShort = (value) => '₹' + Math.round(finite(value)).toLocaleString('en-IN');
const pct = (value) => finite(value).toFixed(1) + '%';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Keys are business-day 'YYYY-MM-DD' or month 'YYYY-MM' strings — format the
// parts directly so no browser timezone can move them.
const pointLabel = (key) => {
  const [y, m, d] = key.split('-');
  return d ? `${d} ${MONTHS[Number(m) - 1]}` : `${MONTHS[Number(m) - 1]} ${y}`;
};
const hourName = (hour) => `${hour % 12 || 12} ${hour < 12 ? 'am' : 'pm'}`;
const hourRange = (hour) => `${hourName(hour)} – ${hourName((hour + 1) % 24)}`;

function CardHeading({ eyebrow, title, icon, children }) {
  return (
    <>
      <div className="report-card-heading">
        <div><span className="report-card-eyebrow">{eyebrow}</span><h3>{title}</h3></div>
        <AdminIcon name={icon} />
      </div>
      <p className="report-card-description">{children}</p>
    </>
  );
}

function Tile({ tone, label, value, note }) {
  return (
    <div className={`insight-tile tone-${tone}`}>
      <span className="insight-tile-label">{label}</span>
      <strong className="insight-tile-value">{value}</strong>
      {note && <span className="insight-tile-note">{note}</span>}
    </div>
  );
}

// Each bar is the money customers paid that day, split into what goes to
// shops and what we keep. A loss day draws shop cost with the shortfall in red.
function TrendCard({ trend }) {
  const points = trend?.points || [];
  const [activeKey, setActiveKey] = useState(null);
  const scale = Math.max(1, ...points.map((p) => Math.max(p.customerPaid, p.shopCost)));
  const withOrders = points.filter((p) => p.deliveredOrders > 0);
  const best = withOrders.reduce((top, p) => (!top || p.netProfit > top.netProfit ? p : top), null);
  const active = points.find((p) => p.key === activeKey) || best;
  const totalProfit = points.reduce((sum, p) => sum + p.netProfit, 0);
  const unit = trend?.granularity === 'month' ? 'month' : 'day';
  const labelEvery = Math.max(1, Math.ceil(points.length / 10));

  return (
    <article className="report-visual-card insight-card-wide">
      <CardHeading eyebrow="Trend" title={unit === 'month' ? 'Sales & profit by month' : 'Sales & profit by day'} icon="analytics">
        Each bar is what customers paid (delivered orders), split into the shop payout and our net profit. Hover or tap a bar for details.
      </CardHeading>
      <div className="insight-tiles">
        <Tile tone="green" label={`Best ${unit}`} value={best ? moneyShort(best.netProfit) : '—'} note={best ? pointLabel(best.key) : 'No delivered orders'} />
        <Tile tone="blue" label={`Avg profit / ${unit}`} value={moneyShort(points.length ? totalProfit / points.length : 0)} note={`Across ${points.length} ${unit}${points.length === 1 ? '' : 's'}`} />
        <Tile tone="saffron" label={`${unit === 'month' ? 'Months' : 'Days'} with orders`} value={`${withOrders.length} / ${points.length}`} note={`${points.length - withOrders.length} with no delivered order`} />
      </div>
      {points.length === 0 ? (
        <p className="report-chart-empty insight-empty">No delivered orders in this period.</p>
      ) : (
        <>
          <div className="insight-columns" role="list" aria-label="Sales and profit trend">
            {points.map((p, index) => {
              const loss = p.netProfit < 0;
              const height = (Math.max(p.customerPaid, p.shopCost) / scale) * 100;
              const base = loss ? p.customerPaid : p.shopCost;
              const top = Math.abs(p.netProfit);
              const total = base + top || 1;
              return (
                <button type="button" role="listitem" key={p.key}
                  className={`insight-column ${active?.key === p.key ? 'is-active' : ''}`}
                  onMouseEnter={() => setActiveKey(p.key)} onFocus={() => setActiveKey(p.key)} onClick={() => setActiveKey(p.key)}
                  aria-label={`${pointLabel(p.key)}: ${p.deliveredOrders} orders, paid ${money(p.customerPaid)}, shop ${money(p.shopCost)}, profit ${money(p.netProfit)}`}>
                  <span className="insight-column-bar" style={{ height: `${height}%`, '--delay': `${Math.min(index, 40) * 12}ms` }}>
                    <span className={loss ? 'seg-loss' : 'seg-profit'} style={{ height: `${(top / total) * 100}%` }} />
                    <span className="seg-shop" style={{ height: `${(base / total) * 100}%` }} />
                  </span>
                  <span className="insight-column-label">{index % labelEvery === 0 ? pointLabel(p.key) : ''}</span>
                </button>
              );
            })}
          </div>
          <div className="insight-legend" aria-hidden="true">
            <span><i className="seg-profit" />Net profit</span>
            <span><i className="seg-shop" />Shop payout</span>
            <span><i className="seg-loss" />Loss</span>
            <span className="insight-legend-scale">Tallest bar = {moneyShort(scale)}</span>
          </div>
          {active && (
            <div className="insight-readout" aria-live="polite">
              <strong>{pointLabel(active.key)}</strong>
              <span>{active.deliveredOrders} order{active.deliveredOrders === 1 ? '' : 's'}</span>
              <span>Paid {money(active.customerPaid)}</span>
              <span>Shop {money(active.shopCost)}</span>
              <span className={active.netProfit < 0 ? 'is-loss' : 'is-profit'}>Profit {money(active.netProfit)}</span>
            </div>
          )}
        </>
      )}
    </article>
  );
}

function HoursCard({ hours, busiestHour }) {
  const list = hours || [];
  const top = Math.max(1, ...list.map((h) => h.deliveredOrders));
  const total = list.reduce((sum, h) => sum + h.deliveredOrders, 0);
  const busiest = busiestHour === null || busiestHour === undefined ? null : list[busiestHour];
  // The three hours with the most orders, as a share of the period's orders.
  const topThree = [...list].sort((a, b) => b.deliveredOrders - a.deliveredOrders || a.hour - b.hour).slice(0, 3).filter((h) => h.deliveredOrders > 0);
  const topThreeShare = total ? topThree.reduce((sum, h) => sum + h.deliveredOrders, 0) / total * 100 : 0;

  return (
    <article className="report-visual-card">
      <CardHeading eyebrow="Timing" title="Busiest hours" icon="calendar">
        Delivered orders by the hour they were placed. Plan riders and shop staff around the tall bars.
      </CardHeading>
      <div className="insight-tiles">
        <Tile tone="saffron" label="Busiest hour" value={busiest ? hourRange(busiest.hour) : '—'} note={busiest ? `${busiest.deliveredOrders} orders · ${moneyShort(busiest.customerPaid)}` : 'No delivered orders'} />
        <Tile tone="violet" label="Top 3 hours" value={pct(topThreeShare)} note="of all delivered orders" />
      </div>
      <div className="insight-hours" role="list" aria-label="Delivered orders by hour">
        {list.map((h) => (
          <div role="listitem" key={h.hour} className={`insight-hour ${h.hour === busiestHour ? 'is-peak' : ''}`}
            title={`${hourRange(h.hour)}: ${h.deliveredOrders} orders, ${money(h.customerPaid)}`}
            aria-label={`${hourRange(h.hour)}: ${h.deliveredOrders} orders`}>
            <span className="insight-hour-bar" style={{ height: `${(h.deliveredOrders / top) * 100}%` }} />
            <span className="insight-hour-label">{h.hour % 3 === 0 ? hourName(h.hour).replace(' ', '') : ''}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SplitBar({ left, right, leftLabel, rightLabel, format }) {
  const total = left + right;
  const leftShare = total ? (left / total) * 100 : 0;
  return (
    <div className="insight-split">
      <div className="insight-split-track" aria-hidden="true">
        <span className="tone-green" style={{ width: `${leftShare}%` }} />
        <span className="tone-blue" style={{ width: `${total ? 100 - leftShare : 0}%` }} />
      </div>
      <div className="insight-split-labels">
        <span><i className="tone-green" />{leftLabel} <strong>{format(left)}</strong></span>
        <span><i className="tone-blue" />{rightLabel} <strong>{format(right)}</strong></span>
      </div>
    </div>
  );
}

function CustomersCard({ customers }) {
  const c = customers || {};
  return (
    <article className="report-visual-card">
      <CardHeading eyebrow="Customers" title="New vs returning" icon="customers">
        New = no delivered order before this period (in this area; for All Time everyone is new). Repeat rate = customers with 2+ delivered orders in this period.
      </CardHeading>
      <div className="insight-tiles insight-tiles-4">
        <Tile tone="blue" label="Customers" value={finite(c.customers)} note={`${finite(c.ordersPerCustomer).toFixed(2)} orders each`} />
        <Tile tone="green" label="New" value={finite(c.newCustomers)} note={`${finite(c.returningCustomers)} returning`} />
        <Tile tone="saffron" label="Repeat rate" value={pct(c.repeatRate)} note={`${finite(c.repeatCustomers)} ordered 2+ times`} />
        <Tile tone="violet" label="Spend / customer" value={moneyShort(c.spendPerCustomer)} note="customer paid" />
      </div>
      <SplitBar left={finite(c.newCustomerOrders)} right={finite(c.returningCustomerOrders)}
        leftLabel="Orders from new" rightLabel="from returning" format={(v) => v} />
      <SplitBar left={finite(c.newCustomerPaid)} right={finite(c.returningCustomerPaid)}
        leftLabel="Paid by new" rightLabel="by returning" format={moneyShort} />
    </article>
  );
}

function RankList({ title, empty, rows }) {
  return (
    <div className="insight-rank">
      <h4>{title}</h4>
      {rows.length === 0 ? <p className="insight-rank-empty">{empty}</p> : (
        <ol>
          {rows.map((row) => (
            <li key={row.key}>
              <span className="insight-rank-name">{row.name}{row.sub && <small>{row.sub}</small>}</span>
              <strong className={row.tone ? `text-${row.tone}` : ''}>{row.value}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LossesCard({ losses }) {
  const l = losses || {};
  const shops = l.rejectionsByShop || [];
  const reasons = l.cancelReasons || [];
  const coupons = l.topCoupons || [];
  return (
    <article className="report-visual-card insight-card-wide">
      <CardHeading eyebrow="Leaks" title="Cancels, shop rejections & discounts" icon="warning">
        Cancels and rejections count every order placed in this period. Discounts count delivered orders, like Net Profit.
      </CardHeading>
      <div className="insight-tiles insight-tiles-4">
        <Tile tone="red" label="Cancel rate" value={pct(l.cancelRate)} note={`${finite(l.cancelledOrders)} of ${finite(l.placedOrders)} orders · ${moneyShort(l.cancelledValue)}`} />
        <Tile tone="amber" label="Shop reject rate" value={pct(l.rejectRate)} note={`${finite(l.rejectedLines)} of ${finite(l.shopLines)} items · ${moneyShort(l.rejectedValue)}`} />
        <Tile tone="violet" label="Discounts given" value={moneyShort(l.discount)} note={`${pct(l.discountShareOfSales)} of app sales`} />
        <Tile tone="blue" label="Orders with discount" value={`${finite(l.discountedOrders)} / ${finite(l.deliveredOrders)}`} note={`They paid ${moneyShort(l.discountedOrdersPaid)}`} />
      </div>
      <div className="insight-discount-parts">
        <span>Coupon on items <strong>{money(l.couponItemDiscount)}</strong></span>
        <span>Free delivery <strong>{money(l.freeDeliveryWaiver)}</strong></span>
        <span>Deals <strong>{money(l.dealDiscount)}</strong></span>
      </div>
      <div className="insight-rank-grid">
        <RankList title="Shops rejecting most" empty="No shop rejected an item."
          rows={shops.map((s) => ({
            key: `${s.shopId}-${s.area_id}`,
            name: s.shopName + (s.areaCode ? ` (${s.areaCode})` : ''),
            sub: `${s.rejectedLines} of ${s.lines} items · ${moneyShort(s.rejectedValue)}`,
            value: pct(s.rejectRate), tone: 'amber',
          }))} />
        <RankList title="Why orders were cancelled" empty="No cancelled orders."
          rows={reasons.map((r) => ({ key: r.reason, name: r.reason, sub: moneyShort(r.value), value: `${r.orders}`, tone: 'red' }))} />
        <RankList title="Coupons that cost most" empty="No coupon used on a delivered order."
          rows={coupons.map((c) => ({ key: c.code, name: c.code, sub: `${c.orders} order${c.orders === 1 ? '' : 's'} · paid ${moneyShort(c.customerPaid)}`, value: moneyShort(c.cost), tone: 'violet' }))} />
      </div>
    </article>
  );
}

export default function ReportInsights({ insights, loading, error }) {
  if (error) return <div className="error-container insight-error">{error}</div>;
  if (!insights) {
    return loading ? <div className="reports-loading insight-loading" role="status"><span className="global-spinner" />Loading business insights…</div> : null;
  }
  return (
    <section className="insight-section" aria-label="Business insights">
      <div className="insight-section-heading">
        <span className="reports-eyebrow">Business insights</span>
        <h2>What is driving the numbers</h2>
      </div>
      <div className="insight-grid">
        <TrendCard trend={insights.trend} />
        <HoursCard hours={insights.hours} busiestHour={insights.busiestHour} />
        <CustomersCard customers={insights.customers} />
        <LossesCard losses={insights.losses} />
      </div>
    </section>
  );
}
