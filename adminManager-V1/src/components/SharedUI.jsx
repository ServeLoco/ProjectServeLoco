import React from 'react';

export function Loading() {
  return (
    <div className="global-spinner-wrap">
      <div className="global-spinner"></div>
      <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 500 }}>Loading data...</p>
    </div>
  );
}

export function ErrorState({ message }) {
  return (
    <div style={{
      padding: '1.25rem 1.5rem',
      backgroundColor: 'rgba(239, 68, 68, 0.05)',
      color: 'var(--danger-color)',
      borderLeft: '4px solid var(--danger-color)',
      borderRadius: '0 var(--radius-md) var(--radius-md) 0',
      margin: '1.5rem 0',
      fontSize: '0.925rem',
      fontWeight: 500
    }}>
      Error: {message}
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div style={{
      padding: '3rem 2rem',
      textAlign: 'center',
      color: 'var(--text-secondary)',
      fontSize: '0.95rem',
      fontWeight: 500
    }}>
      {message || 'No records or data available.'}
    </div>
  );
}

// Basic Table wrapper
export function Table({ columns, data }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--surface-color)', boxShadow: 'var(--shadow-sm)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.925rem' }}>
        <thead>
          <tr style={{ background: 'rgba(248, 250, 252, 0.6)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
            {columns.map((col, idx) => (
              <th key={idx} style={{ padding: '1rem 1.25rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ padding: 0 }}>
                <EmptyState />
              </td>
            </tr>
          ) : (
            data.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background var(--transition-fast)' }} className="table-row-hover">
                {columns.map((col, cIdx) => (
                  <td key={cIdx} style={{ padding: '1rem 1.25rem', color: 'var(--text-primary)' }}>
                    {row[col]}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
