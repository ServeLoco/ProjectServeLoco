import React, { useEffect, useState, useRef, useCallback } from 'react';
import { subscribeAdminOrderEvents, subscribeRealtime } from '../api';
import { apiClient } from '../api/client';
import { broadcastAdminOrderStatus } from '../utils/realtimeOrder';
import './GlobalOrderAlert.css';

const SOUND_LOOP_INTERVAL_MS = 8000;
const AUTO_ACCEPT_SECONDS = 120;

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

// Countdown for the head of the queue only. Resets when activeId changes.
function useHeadCountdown(activeId, paused) {
  const [seconds, setSeconds] = useState(AUTO_ACCEPT_SECONDS);
  useEffect(() => {
    if (paused && !activeId) {
      setSeconds(AUTO_ACCEPT_SECONDS);
      return undefined;
    }
    if (paused) return undefined;
    setSeconds(AUTO_ACCEPT_SECONDS);
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      const remaining = Math.max(0, AUTO_ACCEPT_SECONDS - elapsed);
      setSeconds(remaining);
      if (remaining <= 0) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [activeId, paused]);
  return seconds;
}

export default function GlobalOrderAlert() {
  const [modals, setModals] = useState([]);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [autoAcknowledged, setAutoAcknowledged] = useState({});
  const audioCtxRef = useRef(null);
  const soundLoopRef = useRef(null);
  const prevQueueLengthRef = useRef(0);

  // Always show the first (oldest) pending alert — one full card at a time.
  const current = modals.length > 0 ? modals[0] : null;
  const currentId = current ? current.id : null;
  const currentBusy = current ? Boolean(busy[current.id]) : false;
  const currentAutoAccepted = current ? Boolean(autoAcknowledged[current.payload?.orderId]) : false;
  const countdownPaused = !current || currentBusy || currentAutoAccepted;
  const secondsLeft = useHeadCountdown(currentId, countdownPaused);

  const playAlertSound = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }

      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') { await ctx.resume(); }
      if (ctx.state !== 'running') return;

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

  useEffect(() => {
    const unlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      } else {
        try {
          if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
          audioCtxRef.current.resume().catch(() => {});
        } catch (_) { /* noop */ }
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
        audioCtxRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (modals.length === 0) {
      if (soundLoopRef.current) {
        clearInterval(soundLoopRef.current);
        soundLoopRef.current = null;
      }
      prevQueueLengthRef.current = 0;
      return undefined;
    }
    const grew = modals.length > prevQueueLengthRef.current;
    prevQueueLengthRef.current = modals.length;
    if (grew) playAlertSound();
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

  useEffect(() => {
    const handleEvent = ({ eventName, payload }) => {
      if (eventName !== 'admin.order.created') return;
      const orderId = payload?.orderId;
      if (!orderId) return;

      const id = `${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setModals(prev => {
        if (prev.some(m => m.payload?.orderId === orderId)) return prev;
        return [...prev, { id, payload, addedAt: Date.now() }];
      });
    };

    const unsubscribe = subscribeAdminOrderEvents(handleEvent);
    return unsubscribe;
  }, []);

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

  useEffect(() => {
    const off = subscribeRealtime('admin.order.auto_accepted', (payload) => {
      const oid = payload?.orderId ?? payload?.order_id ?? payload?.id;
      if (oid == null) return;
      setAutoAcknowledged((prev) => ({ ...prev, [oid]: true, [String(oid)]: true }));
      // Same-tab lists (Orders / Shops) refresh without F5.
      try {
        broadcastAdminOrderStatus({ orderId: oid, status: 'Accepted' });
      } catch (_) { /* noop */ }
      // Brief "auto-accepted" flash, then drop from queue.
      setTimeout(() => {
        setModals((prev) => prev.filter((m) => Number(m.payload?.orderId) !== Number(oid)));
        setAutoAcknowledged((prev) => {
          const next = { ...prev };
          delete next[oid];
          delete next[String(oid)];
          return next;
        });
      }, 2500);
    });
    return off;
  }, []);

  // Esc = skip current (dismiss from queue) and show next
  useEffect(() => {
    if (modals.length === 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const head = modals[0];
        if (head && !busy[head.id]) {
          removeModal(head.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modals, busy, removeModal]);

  const closeDrawerAndNavigate = useCallback(() => {
    try { window.dispatchEvent(new CustomEvent('admin:close-order-drawer')); } catch (_) { /* noop */ }
  }, []);

  const submitStatus = useCallback(async (id, orderId, status, reason) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    setErrors(prev => ({ ...prev, [id]: null }));
    try {
      await apiClient(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: reason ? { status, cancel_reason: reason } : { status },
      });
      // Same-tab realtime: Shops panel drops cancelled order without F5.
      broadcastAdminOrderStatus({ orderId, status, cancelReason: reason });
      closeDrawerAndNavigate();
      removeModal(id);
    } catch (err) {
      setErrors(prev => ({ ...prev, [id]: err?.message || `Failed to ${status === 'Accepted' ? 'accept' : 'cancel'} order` }));
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }, [closeDrawerAndNavigate, removeModal]);

  const handleAccept = useCallback((id, orderId) => submitStatus(id, orderId, 'Accepted'), [submitStatus]);
  const handleCancel = useCallback((id, orderId) => {
    const reason = window.prompt(
      'Reason for cancellation (shown to the customer). Leave blank for default:',
      ''
    );
    if (reason === null) return;
    submitStatus(id, orderId, 'Cancelled', reason.trim() || null);
  }, [submitStatus]);

  const handleSkip = useCallback(() => {
    const head = modals[0];
    if (head && !busy[head.id]) removeModal(head.id);
  }, [modals, busy, removeModal]);

  // Promote a queued order to the front (swap with head)
  const bringToFront = useCallback((id) => {
    setModals((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  }, []);

  if (modals.length === 0) return null;

  const total = modals.length;
  const waiting = modals.slice(1);
  const countdownCeil = Math.ceil(secondsLeft);
  const ringPct = (secondsLeft / AUTO_ACCEPT_SECONDS) * 100;

  const { id, payload } = current;
  const orderId = payload?.orderId;
  const orderNumber = payload?.orderNumber || '—';
  const customerName = payload?.customerName || 'Customer';
  const address = payload?.address || '';
  const customerPhone = payload?.customerPhone || '';
  const paymentMethod = payload?.paymentMethod || 'Cash';
  const totalAmount = payload?.total;
  const createdAt = payload?.createdAt;
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const isBusy = Boolean(busy[id]);
  const error = errors[id];
  const isPaymentUpi = paymentMethod === 'UPI';
  const wasAutoAccepted = Boolean(
    autoAcknowledged[orderId] || autoAcknowledged[String(orderId)]
  );

  return (
    <div className="order-alert-overlay" role="presentation">
      <div className="order-alert-stack" data-count={total} role="region" aria-label="New order alerts">
        {/* Queue strip — compact chips only, never full cards */}
        {total > 1 ? (
          <div className="order-alert-queue-bar" aria-label={`${total} orders in queue`}>
            <div className="order-alert-queue-meta">
              <span className="order-alert-queue-count">{total}</span>
              <span className="order-alert-queue-label">
                new order{total === 1 ? '' : 's'} · showing 1 of {total}
              </span>
            </div>
            <div className="order-alert-queue-chips">
              {modals.map((m, i) => {
                const num = m.payload?.orderNumber || m.payload?.orderId || i + 1;
                const isHead = i === 0;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`order-alert-chip${isHead ? ' is-active' : ''}`}
                    onClick={() => { if (!isHead) bringToFront(m.id); }}
                    title={isHead ? `Current: #${num}` : `Switch to #${num}`}
                    disabled={isBusy}
                  >
                    <span className="order-alert-chip-idx">{i + 1}</span>
                    <span className="order-alert-chip-num">#{num}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Single active full modal */}
        <div
          key={id}
          className={`order-alert-modal active${wasAutoAccepted ? ' auto-accepted' : ''}`}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`order-alert-title-${id}`}
          style={{ '--ring-pct': `${ringPct}%` }}
        >
          <div className="order-alert-header">
            <div className="order-alert-bell">
              <span aria-hidden="true">{wasAutoAccepted ? '⚡' : '🔔'}</span>
            </div>
            <div className="order-alert-header-text">
              <strong id={`order-alert-title-${id}`}>
                {wasAutoAccepted
                  ? `Order #${orderNumber} auto-accepted`
                  : 'New Order Received!'}
              </strong>
              <span className="order-alert-order-number">
                #{orderNumber}
                {total > 1 ? ` · Order 1 of ${total}` : ''}
              </span>
            </div>
            {!wasAutoAccepted ? (
              <div className="order-alert-countdown" aria-live="polite">
                <div className="order-alert-countdown-ring">
                  <svg viewBox="0 0 36 36" aria-hidden="true">
                    <circle cx="18" cy="18" r="16" className="order-alert-countdown-track" />
                    <circle cx="18" cy="18" r="16" className="order-alert-countdown-fill" />
                  </svg>
                  <span className="order-alert-countdown-text">{countdownCeil}s</span>
                </div>
              </div>
            ) : null}
            {total > 1 ? (
              <button
                type="button"
                className="order-alert-close"
                onClick={handleSkip}
                disabled={isBusy}
                aria-label="Skip to next order"
                title="Skip (Esc)"
              >
                ▶
              </button>
            ) : null}
          </div>

          <div className="order-alert-body">
            <div className="order-alert-row">
              <span className="order-alert-label">Customer</span>
              <span className="order-alert-value order-alert-customer" title={customerName}>
                {customerName}
              </span>
            </div>

            {customerPhone ? (
              <div className="order-alert-row">
                <span className="order-alert-label">Phone</span>
                <span className="order-alert-value">{customerPhone}</span>
              </div>
            ) : null}

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

            {items.length > 0 ? (
              <div className="order-alert-row order-alert-items">
                <span className="order-alert-label">Items</span>
                <span
                  className="order-alert-value order-alert-items-list"
                  title={items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                >
                  {items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}
                </span>
              </div>
            ) : null}

            <div className="order-alert-row">
              <span className="order-alert-label">Total</span>
              <span className="order-alert-value order-alert-total">
                {formatCurrency(totalAmount)}
              </span>
            </div>

            <div className="order-alert-meta">
              Placed {formatPlacedAt(createdAt)}
            </div>

            {wasAutoAccepted ? (
              <div className="order-alert-info" role="status">
                Auto-accepted after {AUTO_ACCEPT_SECONDS}s with no admin action. You can still cancel below.
              </div>
            ) : null}

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

          {waiting.length > 0 ? (
            <div className="order-alert-footer">
              <button
                type="button"
                className="order-alert-skip"
                onClick={handleSkip}
                disabled={isBusy}
              >
                Skip · next in queue ({waiting.length} waiting) ▶
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
