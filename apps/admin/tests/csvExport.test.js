import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { buildCsv, collectExportRows, downloadCsv } from '../src/utils/csvExport.js';

test('CSV retains order hashes, Unicode, quotes, commas and newlines safely', () => {
  const csv = buildCsv(['Order', 'Name', 'Note'], [['#VK-123', '₹ हिन्दी', 'A, "B"\nC']]);
  assert.equal(csv, '\uFEFF"Order","Name","Note"\r\n"#VK-123","₹ हिन्दी","A, ""B""\nC"');
  assert.equal(buildCsv(['Value'], [['=HYPERLINK("evil")'], ['+1'], ['@SUM(A1)']]),
    '\uFEFF"Value"\r\n"\'=HYPERLINK(""evil"")"\r\n"\'+1"\r\n"\'@SUM(A1)"');
});

test('CSV downloads use a mounted Blob link and delay URL cleanup', async () => {
  let blob;
  let mounted = false;
  let removed = false;
  let cleanup;
  let revoked;
  const link = { click() { assert.equal(mounted, true); }, remove() { removed = true; } };
  mock.method(URL, 'createObjectURL', value => { blob = value; return 'blob:export'; });
  mock.method(URL, 'revokeObjectURL', value => { revoked = value; });
  mock.method(globalThis, 'setTimeout', callback => { cleanup = callback; });
  const originalDocument = globalThis.document;
  globalThis.document = { createElement: () => link, body: { appendChild: () => { mounted = true; } } };
  try {
    downloadCsv('villkro.csv', ['Order'], [['#VK-123']]);
    assert.equal(link.href, 'blob:export');
    assert.equal(link.download, 'villkro.csv');
    assert.equal(blob.type, 'text/csv;charset=utf-8;');
    assert.ok((await blob.text()).includes('#VK-123'));
    assert.equal(removed, true);
    assert.equal(revoked, undefined);
    cleanup();
    assert.equal(revoked, 'blob:export');
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    mock.restoreAll();
  }
});

test('exports collect every API page instead of only the visible page', async () => {
  const pages = [];
  const rows = await collectExportRows(async page => {
    pages.push(page);
    return { data: [{ id: page }], pagination: { totalPages: 3 } };
  });
  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(rows, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('failed or unexpectedly empty later pages reject rather than download partial exports', async () => {
  await assert.rejects(collectExportRows(async page => {
    if (page === 2) throw new Error('Request failed');
    return { data: [{ id: 1 }], pagination: { totalPages: 2 } };
  }), /Request failed/);
  await assert.rejects(collectExportRows(async page => ({
    data: page === 1 ? [{ id: 1 }] : [], pagination: { totalPages: 2 },
  })), /changed during export/);
});
