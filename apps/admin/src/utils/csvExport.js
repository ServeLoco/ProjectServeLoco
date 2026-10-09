import { readList } from './apiResponse.js';

export function escapeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv(headers, rows) {
  return '\uFEFF' + [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
}

export function downloadCsvContent(filename, content) {
  const blob = new Blob([content.startsWith('\uFEFF') ? content : `\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Give the browser time to consume the download before releasing the URL.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export function downloadCsv(filename, headers, rows) {
  downloadCsvContent(filename, buildCsv(headers, rows));
}

export async function collectExportRows(fetchPage, keys = []) {
  const rows = [];
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const response = await fetchPage(page);
    const pageRows = readList(response, keys);
    totalPages = Math.max(1, Number(response.pagination?.totalPages) || 1);
    // Never turn a failed/inconsistent later page into a successful partial CSV.
    if (pageRows.length === 0 && (page > 1 || page < totalPages)) {
      throw new Error('Orders changed during export. Please try exporting again.');
    }
    rows.push(...pageRows);
  }
  return rows;
}
