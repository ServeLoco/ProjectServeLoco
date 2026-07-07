import React, { useState, useEffect } from 'react';
import { couponsApi } from '../../api/couponsApi';
import { formatPrice } from '../../utils/formatters';
import './CouponSheet.css';

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="cs-close-icon">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="cs-check-icon">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

/**
 * CouponSheet
 * Bottom-sheet modal listing available coupons for the current cart.
 * Mirrors the customer app's CouponSheet (apply / remove / locked states).
 *
 * Props:
 *   open            - bool
 *   onClose         - callback
 *   subtotal        - number
 *   deliveryCharge  - number
 *   appliedCoupon   - currently applied coupon object | null
 *   onApply         - (coupon) => void
 *   onRemove        - () => void
 */
export default function CouponSheet({
  open,
  onClose,
  subtotal = 0,
  deliveryCharge = 0,
  appliedCoupon = null,
  onApply,
  onRemove,
}) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const fetchCoupons = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await couponsApi.getAvailable({
          subtotal,
          delivery_charge: deliveryCharge,
        });
        const payload = res.data || res;
        setCoupons(payload.data || payload.coupons || payload || []);
      } catch (err) {
        setError(err.message || 'Failed to load offers');
      } finally {
        setLoading(false);
      }
    };
    fetchCoupons();
  }, [open, subtotal, deliveryCharge]);

  if (!open) return null;

  const isApplied = (c) => appliedCoupon && (appliedCoupon.id === c.id || appliedCoupon.code === c.code);

  return (
    <div className="cs-overlay" onClick={onClose}>
      <div className="cs-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="cs-header">
          <div className="cs-title">Offers & Coupons</div>
          <button className="cs-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>

        <div className="cs-body">
          <div className="cs-code-row">
            <input
              className="cs-code-input"
              placeholder="Have a code? Enter here"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button
              className="cs-apply-btn"
              onClick={async () => {
                const trimmed = code.trim().toUpperCase();
                if (!trimmed) return;
                try {
                  const res = await couponsApi.validate({
                    code: trimmed,
                    subtotal,
                    delivery_charge: deliveryCharge,
                  });
                  const payload = res.data || res;
                  if (payload.coupon || payload.data?.coupon) {
                    onApply(payload.coupon || payload.data.coupon);
                    setCode('');
                  } else {
                    setError(payload.message || 'Invalid coupon code');
                  }
                } catch (err) {
                  setError(err.response?.data?.message || err.message || 'Invalid coupon code');
                }
              }}
            >
              Apply
            </button>
          </div>

          {error && <div className="cs-error">{error}</div>}

          {loading ? (
            <div className="cs-loading">Loading offers…</div>
          ) : (
            <div className="cs-list">
              {coupons.length === 0 && !error && (
                <div className="cs-empty">No offers available for this order.</div>
              )}
              {coupons.map((c) => {
                const applied = isApplied(c);
                const locked = c.locked || (c.minOrder && subtotal < c.minOrder);
                return (
                  <div
                    key={c.id}
                    className={`cs-card ${applied ? 'applied' : ''} ${locked ? 'locked' : ''}`}
                    onClick={() => {
                      if (locked) return;
                      if (applied) onRemove();
                      else onApply(c);
                    }}
                  >
                    <div className="cs-card-left">
                      <div className="cs-card-title">{c.title || c.code}</div>
                      <div className="cs-card-desc">
                        {c.description || (c.code ? `Code: ${c.code}` : '')}
                      </div>
                      {c.minOrder > 0 && (
                        <div className="cs-card-cond">
                          {subtotal >= c.minOrder
                            ? `Min order ${formatPrice(c.minOrder)} met`
                            : `Add ${formatPrice(c.minOrder - subtotal)} more`}
                        </div>
                      )}
                    </div>
                    <div className="cs-card-right">
                      {applied ? (
                        <span className="cs-applied-pill"><CheckIcon /> Applied</span>
                      ) : locked ? (
                        <span className="cs-locked-pill">Locked</span>
                      ) : (
                        <span className="cs-apply-pill">Apply</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}