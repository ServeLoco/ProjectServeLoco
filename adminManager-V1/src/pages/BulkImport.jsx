import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductsApi } from '../api';
import './BulkImport.css';

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

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

// ── Main component ───────────────────────────────────────────────────────────
export default function BulkImport() {
  const navigate = useNavigate();
  const csvRef = useRef(null);
  const zipRef = useRef(null);

  const [step, setStep] = useState(1); // 1=upload 2=preview 3=done
  const [csvFile, setCsvFile] = useState(null);
  const [zipFile, setZipFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Preview data
  const [preview, setPreview] = useState(null); // { summary, rows, errors }

  // Result data
  const [result, setResult] = useState(null); // { created, updated, failed, errors }

  // Confirmation gate
  const [confirmPending, setConfirmPending] = useState(false);

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  const [dragOver, setDragOver] = useState(null); // 'csv' | 'zip' | null

  const handleDrop = (type) => (e) => {
    e.preventDefault();
    setDragOver(null);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (type === 'csv') setCsvFile(file);
    else setZipFile(file);
  };

  // ── Step 1 → Step 2 : Preview ─────────────────────────────────────────────
  const handlePreview = async (e) => {
    e.preventDefault();
    if (!csvFile || !zipFile) {
      setError('Please select both a CSV/XLSX file and a ZIP file.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', csvFile);
      fd.append('imagesZip', zipFile);
      const res = await ProductsApi.bulkPreview(fd);
      setPreview(res);
      setStep(2);
    } catch (err) {
      console.error('[BulkImport] preview error:', err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 → Step 3 : Commit ──────────────────────────────────────────────────
  const handleCommit = async () => {
    setConfirmPending(false);
    setError(null);
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append('csvFile', csvFile);
      fd.append('imagesZip', zipFile);
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

  // ── Download error report ──────────────────────────────────────────────────
  const downloadErrorReport = (errors) => {
    if (!errors || errors.length === 0) return;
    const header = 'Row,Errors\n';
    const rows = errors.map(e => `${e.row},"${(e.errors || [e.message || '']).join('; ')}"`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk-import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
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
    if (csvRef.current) csvRef.current.value = '';
    if (zipRef.current) zipRef.current.value = '';
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bi-container">
      <header className="bi-header">
        <div>
          <h1 className="bi-title">Bulk Import Products</h1>
          <p className="bi-subtitle">Upload a CSV/XLSX sheet + ZIP of AI-generated images to import products in bulk.</p>
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
                onChange={e => setCsvFile(e.target.files[0] || null)}
              />
              <div className="bi-dropzone-icon">📄</div>
              {csvFile
                ? <><strong className="bi-dropzone-filename">{csvFile.name}</strong><span className="bi-dropzone-change">Click to change</span></>
                : <><strong>Drop CSV / XLSX here</strong><span>or click to browse</span></>
              }
              <small className="bi-dropzone-hint">Required columns: name, price, category_id, unit, image_file</small>
            </div>

            {/* ZIP drop zone */}
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
                onChange={e => setZipFile(e.target.files[0] || null)}
              />
              <div className="bi-dropzone-icon">🗜️</div>
              {zipFile
                ? <><strong className="bi-dropzone-filename">{zipFile.name}</strong><span className="bi-dropzone-change">Click to change</span></>
                : <><strong>Drop Image ZIP here</strong><span>or click to browse</span></>
              }
              <small className="bi-dropzone-hint">Each image filename must match the image_file column exactly</small>
            </div>
          </div>

          <div className="bi-csv-guide">
            <h3 className="bi-guide-title">📋 CSV Column Reference</h3>
            <div className="bi-guide-cols">
              <div>
                <strong>Required</strong>
                <code>name, price, category_id, unit, image_file</code>
              </div>
              <div>
                <strong>Optional</strong>
                <code>description, available, featured, display_order, original_price, discount_label</code>
              </div>
            </div>
            <div className="bi-guide-note">
              💡 Image filenames must be lowercase with hyphens, e.g. <code>coca-cola-500ml.webp</code>
              &nbsp;— exactly matching the <code>image_file</code> column in the CSV.
            </div>
          </div>

          <div className="bi-upload-actions">
            <button type="submit" className="btn-primary bi-submit-btn" disabled={loading || !csvFile || !zipFile}>
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
            <StatCard label="Valid" value={preview.summary.valid} variant="success" />
            <StatCard label="Will Create" value={preview.summary.will_create} variant="create" />
            <StatCard label="Will Update" value={preview.summary.will_update} variant="update" />
            <StatCard label="Errors" value={preview.summary.error_count} variant={preview.summary.error_count > 0 ? 'danger' : ''} />
          </div>

          {preview.summary.error_count > 0 && (
            <div className="bi-validation-errors">
              <h3>❌ Validation Errors — Fix these before importing</h3>
              <div className="bi-error-list">
                {preview.errors.map((e, idx) => (
                  <div key={idx} className="bi-error-row">
                    <span className="bi-error-row-num">Row {e.row}</span>
                    <span className="bi-error-msgs">{(e.errors || []).join(' • ')}</span>
                  </div>
                ))}
              </div>
              <div className="bi-preview-actions">
                <button className="btn-secondary" onClick={resetForm}>← Fix &amp; Re-upload</button>
                <button className="btn-secondary" onClick={() => downloadErrorReport(preview.errors)}>⬇ Download Error Report</button>
              </div>
            </div>
          )}

          {preview.summary.error_count === 0 && (
            <>
              <div className="bi-preview-table-wrapper">
                <table className="bi-preview-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Price</th>
                      <th>Category ID</th>
                      <th>Unit</th>
                      <th>Image File</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, idx) => (
                      <tr key={idx} className={r.action === 'update' ? 'bi-row-update' : 'bi-row-create'}>
                        <td className="bi-row-num">{r.row}</td>
                        <td>{r.name}</td>
                        <td>₹{r.price}</td>
                        <td>{r.category_id}</td>
                        <td>{r.unit}</td>
                        <td className="bi-image-file">{r.image_file}</td>
                        <td>
                          <span className={`bi-action-badge ${r.action}`}>
                            {r.action === 'create' ? '✅ Create' : '🔄 Update'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bi-preview-actions">
                <button className="btn-secondary" onClick={resetForm} disabled={loading}>← Back</button>
                {!confirmPending ? (
                  <button
                    className="btn-primary bi-commit-btn"
                    onClick={() => setConfirmPending(true)}
                    disabled={loading}
                  >
                    {`✅ Import ${preview.summary.valid} Products`}
                  </button>
                ) : (
                  <div className="bi-confirm-bar">
                    <span>⚠️ This will write to the database and cannot be undone. Confirm?</span>
                    <button className="btn-secondary" onClick={() => setConfirmPending(false)} disabled={loading}>Cancel</button>
                    <button className="btn-primary" onClick={handleCommit} disabled={loading}>
                      {loading ? <><span className="bi-spinner" /> Importing…</> : 'Yes, Import Now'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
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
            <StatCard label="Failed" value={result.failed} variant={result.failed > 0 ? 'danger' : ''} />
          </div>
          {result.errors && result.errors.length > 0 && (
            <button className="btn-secondary" onClick={() => downloadErrorReport(result.errors)} style={{ marginBottom: '1rem' }}>
              ⬇ Download Error Report
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
