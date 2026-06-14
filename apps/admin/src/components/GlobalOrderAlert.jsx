import React, { useEffect, useState, useRef, useCallback } from 'react';
import { subscribeAdminOrderEvents } from '../api';
import { apiClient } from '../api/client';
import './GlobalOrderAlert.css';

const MAX_VISIBLE = 5;
const SOUND_LOOP_INTERVAL_MS = 8000;

function formatPlacedAt(iso) {
  if (!iso) return 'Just now';
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'Just now';
  const diffSec = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec} sec ago`;
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  return then.toLocaleString();
}

function formatCurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₹0';
  return `₹${n}`;
}

export default function GlobalOrderAlert() {
  const [modals, setModals] = useState([]);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const audioCtxRef = useRef(null);
  const soundLoopRef = useRef(null);

  // ── Audio ────────────────────────────────────────────────────────────
  const playAlertSound = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') { await ctx.resume(); }

      const playTone = (freq, startTime, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.5, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        osc.start(startTime);
        osc.stop(startTime + duration);
      };

      const now = ctx.currentTime;
      playTone(523.25, now, 0.2);
      playTone(659.25, now + 0.15, 0.4);
    } catch (err) {
      console.warn('Could not play alert sound', err);
    }
  }, []);

  // Loop the sound every 8s while any modal is open
  useEffect(() => {
    if (modals.length === 0) {
      if (soundLoopRef.current) {
        clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
      return undefined;
    }
    // Play once immediately on first arrival
    playAlertSound();
    soundLoopRef.current = setInterval(() => {
      playAlertSound();
    }, SOUND_LOOP_INTERVAL_MS);
    return () => {
      if (soundLoopRef.current) {
        clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
    };
  }, [modals.length, playAlertSound]);

  // ── Subscribe to new-order events ────────────────────────────────────
  useEffect(() => {
    const handleEvent = ({ eventName, payload }) => {
      if (eventName !== 'admin.order.created') return;
      const orderId = payload?.orderId;
      if (!orderId) return;

      const id = `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setModals(prev => {
        // De-dupe: if a modal for this order is already showing, do not add another
        if (prev.some(m => m.payload?.orderId === orderId)) return prev;
        return [...prev, { id, payload, addedAt: Date.now() }];
      });
    };

    const unsubscribe = subscribeAdminOrderEvents(handleEvent);
    return () => unsubscribe();
  }, []);

  // ── Esc to close the top modal ───────────────────────────────────────
  useEffect(() => {
    if (modals.length === 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setModals(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modals.length]);

  // ── Actions ──────────────────────────────────────────────────────────
  const removeModal = useCallback((id) => {
    setModals(prev => prev.filter(m => m.id !== id));
    setBusy(prev => {
      const { [id]: _gone, ...rest } = prev;
      return rest;
    });
    setErrors(prev => {
      const { [id]: _gone, ...rest } = prev;
      return rest;
    });
  }, []);

  const closeDrawerAndNavigate = useCallback(() => {
    try { window.dispatchEvent(new CustomEvent('admin:close-order-drawer')); } catch (_) { /* noop */ }
  }, []);

  const handleAccept = useCallback(async (id, orderId) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    setErrors(prev => ({ ...prev, [id]: null }));
    try {
      await apiClient(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status: 'Accepted' },
      });
      closeDrawerAndNavigate();
      removeModal(id);
    } catch (err) {
      setErrors(prev => ({ ...prev, [id]: err?.message || 'Failed to accept order' }));
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }, [closeDrawerAndNavigate, removeModal]);

  const handleCancel = useCallback(async (id, orderId) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    setErrors(prev => ({ ...prev, [id]: null }));
    try {
      await apiClient(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: { status: 'Cancelled', cancel_reason: 'Cancelled by admin' },
      });
      closeDrawerAndNavigate();
      removeModal(id);
    } catch (err) {
      setErrors(prev => ({ ...prev, [id]: err?.message || 'Failed to cancel order' }));
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }, [closeDrawerAndNavigate, removeModal]);

  if (modals.length === 0) return null;

  const visible = modals.slice(0, MAX_VISIBLE);
  const hiddenCount = modals.length - visible.length;

  return (
    <div className="order-alert-overlay" role="presentation">
      <div
        className="order-alert-stack"
        data-count={modals.length}
        role="region"
        aria-label="New order alerts"
      >
        {visible.map((modal, index) => {
          const { id, payload } = modal;
          const orderId = payload?.orderId;
          const orderNumber = payload?.orderNumber || '—';
          const customerName = payload?.customerName || 'Customer';
          const address = payload?.address || '';
          const paymentMethod = payload?.paymentMethod || 'Cash';
          const total = payload?.total;
          const createdAt = payload?.createdAt;
          const isBusy = Boolean(busy[id]);
          const error = errors[id];
          const isPaymentUpi = paymentMethod === 'UPI';

          return (
            <div
              key={id}
              className="order-alert-modal"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`order-alert-title-${id}`}
              style={{ '--stack-index': index }}
            >
              <div className="order-alert-header">
                <div className="order-alert-bell">
                  <span aria-hidden="true">🔔</span>
                </div>
                <div className="order-alert-header-text">
                  <strong id={`order-alert-title-${id}`}>New Order Received!</strong>
                  <span className="order-alert-order-number">#{orderNumber}</span>
                </div>
                <button
                  type="button"
                  className="order-alert-close"
                  onClick={() => removeModal(id)}
                  disabled={isBusy}
                  aria-label="Dismiss alert"
                >
                  ✕
                </button>
              </div>

              <div className="order-alert-body">
                <div className="order-alert-row">
                  <span className="order-alert-label">Customer</span>
                  <span className="order-alert-value order-alert-customer" title={customerName}>
                    {customerName}
                  </span>
                </div>

                {address ? (
                  <div className="order-alert-row">
                    <span className="order-alert-label">Address</span>
                    <span className="order-alert-value order-alert-address" title={address}>
                      {address}
                    </span>
                  </div>
                ) : null}

                <div className="order-alert-row">
                  <span className="order-alert-label">Payment</span>
                  <span className={`order-alert-payment ${isPaymentUpi ? 'upi' : 'cash'}`}>
                    {paymentMethod}
                  </span>
                </div>

                <div className="order-alert-row">
                  <span className="order-alert-label">Total</span>
                  <span className="order-alert-value order-alert-total">
                    {formatCurrency(total)}
                  </span>
                </div>

                <div className="order-alert-meta">
                  Placed {formatPlacedAt(createdAt)}
                </div>

                {error ? (
                  <div className="order-alert-error" role="alert">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="order-alert-actions">
                <button
                  type="button"
                  className="order-alert-btn order-alert-btn-cancel"
                  onClick={() => handleCancel(id, orderId)}
                  disabled={isBusy}
                >
                  {isBusy ? '…' : 'Cancel'}
                </button>
                <button
                  type="button"
                  className="order-alert-btn order-alert-btn-accept"
                  onClick={() => handleAccept(id, orderId)}
                  disabled={isBusy}
                >
                  {isBusy ? <span className="order-alert-spinner" aria-hidden="true" /> : 'Accept'}
                </button>
              </div>
            </div>
          );
        })}

        {hiddenCount > 0 ? (
          <div className="order-alert-more" aria-live="polite">
            +{hiddenCount} more new order{hiddenCount === 1 ? '' : 's'}
          </div>
        ) : null}
      </div>
    </div>
  );
}
