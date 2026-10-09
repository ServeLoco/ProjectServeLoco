import { useEffect, useMemo, useRef, useState } from 'react';
import AdminIcon from './AdminIcon';
import { buildOrderInvoiceHtml } from '../utils/orderInvoice';
import './InvoicePreview.css';

export default function InvoicePreview({ order, onClose }) {
  const dialogRef = useRef(null);
  const frameRef = useRef(null);
  const [ready, setReady] = useState(false);
  const html = useMemo(() => buildOrderInvoiceHtml(order), [order]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
    return () => dialog.close();
  }, []);

  return (
    <dialog ref={dialogRef} className="invoice-preview" onCancel={onClose} aria-labelledby="invoice-preview-title">
      <header className="invoice-preview-toolbar">
        <div>
          <h2 id="invoice-preview-title">Invoice <span>#{order.order_number}</span></h2>
          <p>VillKro · Ready to print or save as PDF</p>
        </div>
        <div className="invoice-preview-actions">
          <button className="btn-primary" disabled={!ready} onClick={() => {
            frameRef.current?.contentWindow?.focus();
            frameRef.current?.contentWindow?.print();
          }}><AdminIcon name="download" size={16} /> Print / Save PDF</button>
          <button className="btn-secondary" onClick={onClose} autoFocus aria-label="Close invoice">Close</button>
        </div>
      </header>
      <iframe ref={frameRef} title={`VillKro invoice #${order.order_number}`} srcDoc={html} tabIndex={-1} onLoad={() => setReady(true)} />
    </dialog>
  );
}
