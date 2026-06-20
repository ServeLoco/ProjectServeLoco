import React, { useEffect, useState, useRef, useCallback } from 'react';
import { subscribeAdminOrderEvents, subscribeRealtime } from '../api';
import { apiClient } from '../api/client';
import './GlobalOrderAlert.css';

const MAX_VISIBLE = 5;
const SOUND_LOOP_INTERVAL_MS = 8000;
const AUTO_ACCEPT_SECONDS = 10;

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

// Single countdown that ticks down from AUTO_ACCEPT_SECONDS for whichever
// order is currently at the head of the queue. Tracks the active order's id
// so the timer resets whenever a new order becomes active.
function useHeadCountdown(activeId, paused) {
  const [seconds, setSeconds] = useState(AUTO_ACCEPT_SECONDS);
  useEffect(() => {
    // If paused while a countdown was already running, freeze the displayed
    // value at 0 instead of snapping back to AUTO_ACCEPT_SECONDS. The latter
    // visually contradicts the "Auto-accepted" banner that just appeared
    // and confuses admins into thinking the auto-accept didn't actually fire.
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [autoAcknowledged, setAutoAcknowledged] = useState({});
  const audioCtxRef = useRef(null);
  const soundLoopRef = useRef(null);

  const current = modals.length > 0 ? modals[Math.min(activeIndex, modals.length - 1)] : null;
  const currentId = current ? current.id : null;
  const currentBusy = current ? Boolean(busy[current.id]) : false;
  const currentAutoAccepted = current ? Boolean(autoAcknowledged[current.payload?.orderId]) : false;
  const countdownPaused = !current || currentBusy || currentAutoAccepted;
  const secondsLeft = useHeadCountdown(currentId, countdownPaused);

  // ── Audio ────────────────────────────────────────────────────────────
  const playAlertSound = useCallback(async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContext();
      }

      const ctx = audioCtxRef.current;
      // AudioContexts created outside a user gesture start in 'suspended'
      // state. Browsers (Chrome/Safari/Firefox) will only resume from inside
      // a user-initiated event handler — the unlockAudio effect below wires
      // pointerdown/keydown to call this. If we're still suspended here it's
      // because the admin hasn't interacted with the page yet.
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

  // Unlock the AudioContext on the first user gesture. Without this, modern
  // browsers block AudioContext.resume() when called from a non-user-initiated
  // event (e.g. the socket.io `admin.order.created` callback). The very first
  // alert sound would then never play.
  useEffect(() => {
    const unlock = () => {
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {});
      } else {
        // Trigger context creation on the first gesture so a later call to
        // playAlertSound from a socket callback has a non-suspended context.
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

  // Loop the sound every 8s while a NEW alert is sitting on top. Track queue
  // growth so the loop only starts on actual arrivals (not on dismissals —
  // which shrink the queue and used to re-fire the sound every time the
  // admin dismissed one).
  const prevQueueLengthRef = useRef(0);
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

  // ── Subscribe to new-order events ────────────────────────────────────
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

  // ── Auto-acknowledgement: when server emits admin.order.auto_accepted ─
  useEffect(() => {
    const off = subscribeRealtime('admin.order.auto_accepted', (payload) => {
      if (!payload || !payload.orderId) return;
      setAutoAcknowledged(prev => ({ ...prev, [payload.orderId]: true }));
    });
    return off;
  }, []);

  // ── Clamp activeIndex when the queue shrinks ─────────────────────────
  useEffect(() => {
    if (activeIndex >= modals.length && modals.length > 0) {
      setActiveIndex(modals.length - 1);
    }
  }, [modals.length, activeIndex]);

  // ── Esc to skip to the next order ────────────────────────────────────
  useEffect(() => {
    if (modals.length === 0) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Skip = dismiss current alert (admin saw it) and show the next.
        const current = modals[activeIndex];
        if (current && !busy[current.id]) {
          removeModal(current.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modals.length, activeIndex, busy]);

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

  const submitStatus = useCallback(async (id, orderId, status, reason) => {
    setBusy(prev => ({ ...prev, [id]: true }));
    setErrors(prev => ({ ...prev, [id]: null }));
    try {
      await apiClient(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: reason ? { status, cancel_reason: reason } : { status },
      });
      closeDrawerAndNavigate();
      removeModal(id);
    } catch (err) {
      setErrors(prev => ({ ...prev, [id]: err?.message || `Failed to ${status === 'Accepted' ? 'accept' : 'cancel'} order` }));
      setBusy(prev => ({ ...prev, [id]: false }));
    }
  }, [closeDrawerAndNavigate, removeModal]);

  const handleAccept = useCallback((id, orderId) => submitStatus(id, orderId, 'Accepted'), [submitStatus]);
  const handleCancel = useCallback((id, orderId) => submitStatus(id, orderId, 'Cancelled', 'Cancelled by admin'), [submitStatus]);

  const handleSkip = useCallback(() => {
    const current = modals[activeIndex];
    if (current && !busy[current.id]) removeModal(current.id);
  }, [modals, activeIndex, busy, removeModal]);

  if (modals.length === 0) return null;

  const total = modals.length;
  const position = activeIndex + 1;
  const visible = modals.slice(0, MAX_VISIBLE);
  const hiddenCount = modals.length - visible.length;
  const countdownCeil = Math.ceil(secondsLeft);
  const ringPct = (secondsLeft / AUTO_ACCEPT_SECONDS) * 100;

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
          const totalAmount = payload?.total;
          const createdAt = payload?.createdAt;
          const isBusy = Boolean(busy[id]);
          const error = errors[id];
          const isPaymentUpi = paymentMethod === 'UPI';
          const isActive = index === activeIndex;
          const wasAutoAccepted = Boolean(autoAcknowledged[orderId]);

          return (
            <div
              key={id}
              className={`order-alert-modal${isActive ? ' active' : ' queued'}${wasAutoAccepted ? ' auto-accepted' : ''}`}
              role="alertdialog"
              aria-modal={isActive ? 'true' : 'false'}
              aria-labelledby={`order-alert-title-${id}`}
              style={{ '--stack-index': index, '--ring-pct': `${ringPct}%` }}
            >
              <div className="order-alert-header">
                <div className="order-alert-bell">
                  <span aria-hidden="true">{isActive ? '🔔' : '📦'}</span>
                </div>
                <div className="order-alert-header-text">
                  <strong id={`order-alert-title-${id}`}>
                    {wasAutoAccepted
                      ? `Order #${orderNumber} auto-accepted`
                      : isActive
                        ? 'New Order Received!'
                        : `Order #${orderNumber} queued`}
                  </strong>
                  <span className="order-alert-order-number">
                    #{orderNumber} · Order {index + 1} of {total}
                  </span>
                </div>
                {isActive ? (
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
                {isActive ? (
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
                    {formatCurrency(totalAmount)}
                  </span>
                </div>

                <div className="order-alert-meta">
                  Placed {formatPlacedAt(createdAt)}
                </div>

                {wasAutoAccepted ? (
                  <div className="order-alert-info" role="status">
                    Auto-accepted after 10s with no admin action. You can still cancel below.
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

              {total > 1 && isActive ? (
                <div className="order-alert-footer">
                  <button
                    type="button"
                    className="order-alert-skip"
                    onClick={handleSkip}
                    disabled={isBusy}
                  >
                    Skip to next ({position + 1}/{total}) ▶
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {hiddenCount > 0 ? (
          <div className="order-alert-more" aria-live="polite">
            +{hiddenCount} more new order{hiddenCount === 1 ? '' : 's'} in queue
          </div>
        ) : null}
      </div>
    </div>
  );
}
