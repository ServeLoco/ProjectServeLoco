import React from 'react';

const finiteValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const moneyLabel = (value) => '₹' + finiteValue(value).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const countLabel = (value) => finiteValue(value).toLocaleString('en-IN');

// Values are supplied by the report response. Scaling changes only bar geometry.
export function ReportBars({ rows, money = true }) {
  const values = rows.map(row => finiteValue(row.value));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const range = high - low;
  const zero = range ? -low / range * 100 : 0;
  const label = money ? moneyLabel : countLabel;
  return (
    <div className="report-bars">
      {rows.map((row, index) => {
        const value = values[index];
        const width = range ? Math.abs(value) / range * 100 : 0;
        const left = value < 0 ? zero - width : zero;
        return (
          <div className="report-bar-row" key={row.key || row.label}>
            <div className="report-bar-label"><span>{row.label}</span><strong>{label(value)}</strong></div>
            <div className="report-bar-track" aria-hidden="true">
              <span className="report-bar-zero" style={{ left: zero + '%' }} />
              <span className={'report-bar-fill ' + (value < 0 ? 'is-negative' : '')}
                style={{ left: left + '%', width: width + '%', '--chart-color': row.color,
                  '--chart-delay': index * 45 + 'ms' }} />
            </div>
          </div>
        );
      })}
      <p className="report-chart-caption">{money ? 'Amounts in INR' : 'Order counts'} · All bars use the same scale</p>
    </div>
  );
}

export function ReportDonut({ rows, money = false, centerLabel }) {
  // Donuts describe nonnegative composition only, never negative profit.
  const values = rows.map(row => finiteValue(row.value));
  if (values.some(value => value < 0)) {
    return <ReportBars rows={rows} money={money} />;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  const label = money ? moneyLabel : countLabel;
  const circumference = 2 * Math.PI * 66;
  let offset = 0;
  return (
    <div className="report-donut-layout">
      <div className="report-donut">
        <svg viewBox="0 0 164 164" role="img"
          aria-label={rows.map((row, index) => row.label + ': ' + label(values[index])).join(', ')}>
          <circle className="report-donut-track" cx="82" cy="82" r="66" fill="none" strokeWidth="15" />
          {rows.map((row, index) => {
            const length = total ? values[index] / total * circumference : 0;
            const start = offset;
            offset += length;
            return (
              <circle key={row.label} cx="82" cy="82" r="66" fill="none" strokeWidth="15"
                stroke={row.color} strokeDasharray={length + ' ' + circumference}
                strokeDashoffset={-start} transform="rotate(-90 82 82)" className="report-donut-segment">
                <title>{row.label + ': ' + label(values[index])}</title>
              </circle>
            );
          })}
        </svg>
        <div className="report-donut-center" aria-hidden="true">
          <strong>{label(total)}</strong><span>{centerLabel}</span>
        </div>
      </div>
      <ul className="report-chart-legend">
        {rows.map((row, index) => (
          <li key={row.label}>
            <span className="report-legend-dot" style={{ background: row.color }} aria-hidden="true" />
            <span className="report-legend-label">{row.label}<small>{total ? (values[index] / total * 100).toFixed(1) : '0.0'}% of shown total</small></span>
            <strong>{label(values[index])}</strong>
          </li>
        ))}
      </ul>
      {total === 0 && <p className="report-chart-empty">No activity for this period.</p>}
    </div>
  );
}
