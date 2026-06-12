import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductsApi } from '../api';
import { getFileSizeError, MAX_BULK_CSV_BYTES, MAX_BULK_ZIP_BYTES } from '../utils/fileValidation';
import './BulkImport.css';

const GENERIC_ERROR = 'Something went wrong. Please try again later.'

// ── Step indicators ──────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['Upload Files', 'Preview', 'Done'];
  return (
    <div className="bi-steps">
      {steps.map((label, idx) => (
        <React.Fragment key={idx}>
          <div className={`bi-step ${step === idx + 1 ? 'active' : step > idx + 1 ? 'done' : ''}`}>
            <div className="bi-step-circle">{step > idx + 1 ? '✓' : idx + 1}</div>
            <span className="bi-step-label">{label}</span>
          </div>
          {idx < steps.length - 1 && <div className={`bi-step-line ${step > idx + 1 ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Summary stat card ────────────────────────────────────────────────────────
function StatCard({ label, value, variant }) {
  return (
    <div className={`bi-stat-card ${variant || ''}`}>
      <div className="bi-stat-value">{value}</div>
      <div className="bi-stat-label">{label}</div>
    </div>
  );
}

// ── Download helper ──────────────────────────────────────────────────────────
const downloadCsv = (content, filename) => {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ── Template columns ─────────────────────────────────────────────────────────
const TEMPLATE_CONTENT = [
  'mode,category,category_id,id,product_id,name,price,unit,image_file,description,available,featured,display_order,original_price,discount_label',
  'packed,Snacks,,,,Lays Magic Masala 52g,20,52g,lays-magic-masala-52g.webp,Classic masala flavour chips,TRUE,FALSE,0,,',
  'packed,Cold Drinks,,,,Coca Cola 500ml,40,500ml,coca-cola-500ml.webp,Chilled cola,TRUE,FALSE,0,45,10% OFF',
  'packed,Groceries,,,,Amul Butter 100g,55,100g,amul-butter-100g.webp,,TRUE,FALSE,0,,',
  'fast_food,Fast Food,,,,Veg Burger,80,1 Piece,veg-burger.webp,Crispy veg patty burger,TRUE,TRUE,1,,',
  'fast_food,Desserts,,,,Chocolate Brownie,60,1 Piece,choco-brownie.webp,Rich fudgy brownie,TRUE,FALSE,0,,',
  '# Update example: supply id/product_id to target a specific product; omit image_file to keep existing image',
  'packed,Snacks,,42,,Lays Magic Masala 52g,22,52g,,,TRUE,FALSE,0,,',
].join('\n');

// ── Main component ───────────────────────────────────────────────────────────
export default function BulkImport() {
  const navigate = useNavigate();
  const csvRef = useRef(null);
  const zipRef = useRef(null);

  const [step, setStep] = useState(1);
  const [csvFile, setCsvFile] = useState(null);
  const [zipFile, setZipFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Preview data — now includes skipped rows
  const [preview, setPreview] = useState(null);

  // Result data
  const [result, setResult] = useState(null);

  // Confirmation gate
  const [confirmPending, setConfirmPending] = useState(false);

  // Skipped rows panel visibility
  const [showSkipped, setShowSkipped] = useState(false);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(null);

  const setUploadFile = (type, file) => {
    if (!file) {
      if (type === 'csv') setCsvFile(null);
      else setZipFile(null);
      return;
    }

    const errorMessage = type === 'csv'
      ? getFileSizeError(file, MAX_BULK_CSV_BYTES, 'CSV/XLSX file')
      : getFileSizeError(file, MAX_BULK_ZIP_BYTES, 'Image ZIP');

    if (errorMessage) {
      setError(errorMessage);
      if (type === 'csv' && csvRef.current) csvRef.current.value = '';
      if (type === 'zip' && zipRef.current) zipRef.current.value = '';
      return;
    }

    setError(null);
    if (type === 'csv') setCsvFile(file);
    else setZipFile(file);
  };

  const handleDrop = (type) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    setUploadFile(type, file);
  };

  // ── Step 1 → Step 2 : Preview ─────────────────────────────────────────────
  const handlePreview = async (e) => {
    e.preventDefault();
    if (!csvFile) {
      setError('Please select a CSV/XLSX file.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', csvFile);
      if (zipFile) fd.append('imagesZip', zipFile); // ZIP is optional
      const res = await ProductsApi.bulkPreview(fd);
      setPreview(res);
      setShowSkipped(false);
      setStep(2);
    } catch (err) {
      console.error('[BulkImport] preview error:', err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 → Step 3 : Commit ─────────────────────────────────────────────
  const handleCommit = async () => {
    setConfirmPending(false);
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', csvFile);
      if (zipFile) fd.append('imagesZip', zipFile);
      const res = await ProductsApi.bulkImport(fd);
      setResult(res);
      setStep(3);
    } catch (err) {
      console.error('[BulkImport] commit error:', err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // ── Download skipped report ────────────────────────────────────────────────
  const downloadSkippedReport = (rows) => {
    if (!rows || rows.length === 0) return;
    const header = 'Row,Name,Category,Status,Reason\n';
    const content = rows.map(r =>
      `${r.row},"${(r.name || '').replace(/"/g, '""')}","${(r.category || '').replace(/"/g, '""')}",skipped,"${(r.reason || '').replace(/"/g, '""')}"`
    ).join('\n');
    downloadCsv(header + content, `bulk-import-skipped-${Date.now()}.csv`);
  };

  // ── Reset to step 1 ────────────────────────────────────────────────────────
  const resetForm = () => {
    setStep(1);
    setCsvFile(null);
    setZipFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setConfirmPending(false);
    setShowSkipped(false);
    if (csvRef.current) csvRef.current.value = '';
    if (zipRef.current) zipRef.current.value = '';
  };

  const validCount = preview?.summary?.valid ?? 0;
  const skippedCount = preview?.summary?.skipped ?? 0;
  const skippedRows = preview?.skipped ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bi-container">
      <header className="bi-header">
        <div>
          <h1 className="bi-title">Bulk Import Products</h1>
          <p className="bi-subtitle">Upload a CSV/XLSX sheet + optional ZIP of product images to import in bulk.</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/products')}>← Back to Products</button>
      </header>

      <StepIndicator step={step} />

      {error && (
        <div className="bi-error-banner" role="alert">
          ⚠️ {error}
          <button className="bi-error-dismiss" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── STEP 1: Upload ──────────────────────────────────────────────── */}
      {step === 1 && (
        <form className="bi-upload-form" onSubmit={handlePreview}>
          <div className="bi-upload-grid">
            {/* CSV/XLSX drop zone */}
            <div
              className={`bi-dropzone ${dragOver === 'csv' ? 'drag-over' : ''} ${csvFile ? 'has-file' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver('csv'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={handleDrop('csv')}
              onClick={() => csvRef.current?.click()}
            >
              <input
                ref={csvRef}
                type="file"
                hidden
                accept=".csv,.xlsx,.xls"
                onChange={e => setUploadFile('csv', e.target.files[0] || null)}
              />
              <div className="bi-dropzone-icon">📄</div>
              {csvFile
                ? <><strong className="bi-dropzone-filename">{csvFile.name}</strong><span className="bi-dropzone-change">Click to change</span></>
                : <><strong>Drop CSV / XLSX here</strong><span>or click to browse</span></>
              }
              <small className="bi-dropzone-hint">Required for creates: mode (or category_id), category (or category_id), name, price, unit, image_file</small>
            </div>

            {/* ZIP drop zone — optional */}
            <div
              className={`bi-dropzone ${dragOver === 'zip' ? 'drag-over' : ''} ${zipFile ? 'has-file' : ''}`}
              onDragOver={e => { e.preventDefault(); setDragOver('zip'); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={handleDrop('zip')}
              onClick={() => zipRef.current?.click()}
            >
              <input
                ref={zipRef}
                type="file"
                hidden
                accept=".zip"
                onChange={e => setUploadFile('zip', e.target.files[0] || null)}
              />
              <div className="bi-dropzone-icon">🗜️</div>
              {zipFile
                ? <><strong className="bi-dropzone-filename">{zipFile.name}</strong><span className="bi-dropzone-change">Click to change</span></>
                : <><strong>Drop Image ZIP here</strong><span>or click to browse (optional for update-only imports)</span></>
              }
              <small className="bi-dropzone-hint">Image filenames must match the image_file column exactly. Omit image_file on update rows to keep existing image.</small>
            </div>
          </div>

          <div className="bi-csv-guide">
            <h3 className="bi-guide-title">📋 CSV Column Reference</h3>
            <div className="bi-guide-cols">
              <div>
                <strong>Required (for create)</strong>
                <code>name, price, unit, image_file, category OR category_id</code>
              </div>
              <div>
                <strong>Optional</strong>
                <code>mode, id, product_id, description, available, featured, display_order, original_price, discount_label</code>
              </div>
            </div>
            <div className="bi-guide-note">
              💡 <strong>mode</strong> accepted values: <code>packed</code> · <code>packed items</code> · <code>fast</code> · <code>fast food</code> · <code>fast_food</code>
              <br />
              💡 For <strong>updates</strong>, supply <code>id</code> or <code>product_id</code> to target by ID, or use name+category to match. Omit <code>image_file</code> to keep the existing image.
            </div>
            <div style={{ marginTop: '0.75rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.85rem', padding: '0.35rem 0.85rem' }}
                onClick={() => downloadCsv(TEMPLATE_CONTENT, 'bulk-import-template.csv')}
              >
                ⬇ Download CSV Template
              </button>
            </div>
          </div>

          <div className="bi-upload-actions">
            <button type="submit" className="btn-primary bi-submit-btn" disabled={loading || !csvFile}>
              {loading ? <><span className="bi-spinner" /> Analysing…</> : '🔍 Preview Import'}
            </button>
          </div>
        </form>
      )}

      {/* ── STEP 2: Preview ─────────────────────────────────────────────── */}
      {step === 2 && preview && (
        <div className="bi-preview">
          <div className="bi-stat-row">
            <StatCard label="Total Rows" value={preview.summary.total} />
            <StatCard label="Valid" value={validCount} variant="success" />
            <StatCard label="Will Create" value={preview.summary.will_create} variant="create" />
            <StatCard label="Will Update" value={preview.summary.will_update} variant="update" />
            <StatCard label="Skipped" value={skippedCount} variant={skippedCount > 0 ? 'warn' : ''} />
          </div>

          {/* Valid rows table */}
          {validCount > 0 && (
            <div className="bi-preview-table-wrapper">
              <table className="bi-preview-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Price</th>
                    <th>Category</th>
                    <th>Unit</th>
                    <th>Image File</th>
                    <th>Action</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, idx) => (
                    <tr key={idx} className={r.action === 'update' ? 'bi-row-update' : 'bi-row-create'}>
                      <td className="bi-row-num">{r.row}</td>
                      <td>{r.name}</td>
                      <td>₹{r.price}</td>
                      <td>{r.category || r.category_id}</td>
                      <td>{r.unit}</td>
                      <td className="bi-image-file">{r.image_file || <em style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>keep existing</em>}</td>
                      <td>
                        <span className={`bi-action-badge ${r.action}`}>
                          {r.action === 'create' ? '✅ Create' : '🔄 Update'}
                        </span>
                      </td>
                      <td><span className="bi-action-badge valid">Valid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Skipped rows collapsible */}
          {skippedCount > 0 && (
            <div className="bi-skipped-section">
              <button
                className="bi-skipped-toggle"
                onClick={() => setShowSkipped(v => !v)}
              >
                ⚠️ {skippedCount} row{skippedCount !== 1 ? 's' : ''} skipped — {showSkipped ? 'Hide' : 'Show'} details
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ marginLeft: '1rem', fontSize: '0.8rem', padding: '0.2rem 0.6rem' }}
                  onClick={e => { e.stopPropagation(); downloadSkippedReport(skippedRows); }}
                >
                  ⬇ Download Report
                </button>
              </button>
              {showSkipped && (
                <div className="bi-error-list">
                  {skippedRows.map((r, idx) => (
                    <div key={idx} className="bi-error-row bi-row-skipped">
                      <span className="bi-error-row-num">Row {r.row}</span>
                      {r.name && <span className="bi-error-name">{r.name}</span>}
                      <span className="bi-error-msgs">{r.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bi-preview-actions">
            <button className="btn-secondary" onClick={resetForm} disabled={loading}>← Back</button>
            {validCount === 0 ? (
              <span style={{ color: 'var(--danger-color)', fontWeight: 600 }}>No valid rows — fix skipped rows and re-upload.</span>
            ) : !confirmPending ? (
              <button
                className="btn-primary bi-commit-btn"
                onClick={() => setConfirmPending(true)}
                disabled={loading}
              >
                {`✅ Import ${validCount} Products${skippedCount > 0 ? ` (${skippedCount} will be skipped)` : ''}`}
              </button>
            ) : (
              <div className="bi-confirm-bar">
                <span>⚠️ Import {preview.summary.will_create} creates + {preview.summary.will_update} updates? {skippedCount > 0 ? `${skippedCount} rows will be skipped.` : ''} Cannot be undone.</span>
                <button className="btn-secondary" onClick={() => setConfirmPending(false)} disabled={loading}>Cancel</button>
                <button className="btn-primary" onClick={handleCommit} disabled={loading}>
                  {loading ? <><span className="bi-spinner" /> Importing…</> : 'Yes, Import Now'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Done ────────────────────────────────────────────────── */}
      {step === 3 && result && (
        <div className="bi-result">
          <div className="bi-result-icon">🎉</div>
          <h2 className="bi-result-title">Import Complete!</h2>
          <div className="bi-stat-row">
            <StatCard label="Created" value={result.created} variant="create" />
            <StatCard label="Updated" value={result.updated} variant="update" />
            <StatCard label="Skipped" value={result.skipped ?? 0} variant={(result.skipped ?? 0) > 0 ? 'warn' : ''} />
            <StatCard label="Failed" value={result.failed} variant={result.failed > 0 ? 'danger' : ''} />
          </div>
          {result.skipped_rows && result.skipped_rows.length > 0 && (
            <button
              className="btn-secondary"
              onClick={() => downloadSkippedReport(result.skipped_rows)}
              style={{ marginBottom: '1rem' }}
            >
              ⬇ Download Skipped Report
            </button>
          )}
          <div className="bi-result-actions">
            <button className="btn-secondary" onClick={resetForm}>Import More</button>
            <button className="btn-primary" onClick={() => navigate('/products')}>Go to Products →</button>
          </div>
        </div>
      )}
    </div>
  );
}
