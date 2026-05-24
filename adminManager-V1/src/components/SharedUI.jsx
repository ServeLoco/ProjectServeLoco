import React from 'react';

export function Loading() {
  return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
}

export function ErrorState({ message }) {
  return <div style={{ padding: '2rem', color: 'red', border: '1px solid red', margin: '1rem 0' }}>Error: {message}</div>;
}

export function EmptyState({ message }) {
  return <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>{message || 'No data available.'}</div>;
}

// Basic Table wrapper
export function Table({ columns, data }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
      <thead>
        <tr style={{ background: '#eee', textAlign: 'left' }}>
          {columns.map((col, idx) => <th key={idx} style={{ padding: '0.75rem', borderBottom: '1px solid #ccc' }}>{col}</th>)}
        </tr>
      </thead>
      <tbody>
        {data.length === 0 ? (
          <tr>
            <td colSpan={columns.length} style={{ textAlign: 'center', padding: '1rem' }}>
              <EmptyState />
            </td>
          </tr>
        ) : (
          data.map((row, idx) => (
            <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
              {columns.map((col, cIdx) => <td key={cIdx} style={{ padding: '0.75rem' }}>{row[col]}</td>)}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
