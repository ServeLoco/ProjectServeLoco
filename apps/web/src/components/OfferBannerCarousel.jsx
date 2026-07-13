import { useState, useEffect, useRef } from 'react';
import './OfferBannerCarousel.css';

import { getResolvedImageUrl } from '../utils/imageUtils';

const AUTO_ADVANCE_MS = 4000;
const RESUME_AFTER_TOUCH_MS = 6000;
const SWIPE_COMMIT_FRACTION = 0.18;

// Transform-based slider instead of native scroll: iOS Safari cancels
// programmatic smooth scrollTo() inside a scroll-snap-mandatory container,
// which left the auto-advance stuck on the first banner.
export default function OfferBannerCarousel({ offers = [] }) {
  const count = offers.length;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [instant, setInstant] = useState(false);

  const containerRef = useRef(null);
  const indexRef = useRef(0);
  const dragRef = useRef(null);
  const pauseUntil = useRef(0);

  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  // Reset when the offers list changes size (render-phase adjust)
  const [prevCount, setPrevCount] = useState(count);
  if (prevCount !== count) {
    setPrevCount(count);
    setInstant(true);
    setCurrentIndex(0);
  }

  // Auto-advance; the track ends with a clone of the first slide so the
  // wrap-around keeps sliding forward instead of rewinding across the track.
  useEffect(() => {
    if (count <= 1) return undefined;
    const interval = setInterval(() => {
      if (dragRef.current || Date.now() < pauseUntil.current) return;
      const cur = indexRef.current;
      if (cur >= count) {
        // transitionend was missed (e.g. backgrounded tab) — snap home first
        setInstant(true);
        setCurrentIndex(0);
      } else {
        setCurrentIndex(cur + 1);
      }
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(interval);
  }, [count]);

  // Re-enable the transition one frame after an instant snap
  useEffect(() => {
    if (!instant) return undefined;
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setInstant(false))
    );
    return () => cancelAnimationFrame(id);
  }, [instant]);

  const handleTransitionEnd = (e) => {
    if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
    // Landed on the clone of slide 0 — snap back to the real one, invisibly
    if (count > 1 && indexRef.current >= count) {
      setInstant(true);
      setCurrentIndex(0);
    }
  };

  const handlePointerDown = (e) => {
    if (count <= 1) return;
    pauseUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      width: containerRef.current?.offsetWidth || 1,
    };
    setDragging(true);
    containerRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    let delta = e.clientX - drag.startX;
    const atStart = indexRef.current <= 0 && delta > 0;
    const atEnd = indexRef.current >= count - 1 && delta < 0;
    if (atStart || atEnd) delta /= 3; // rubber-band at the edges
    setDragOffset(delta);
  };

  const handlePointerUp = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setDragOffset(0);
    pauseUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > drag.width * SWIPE_COMMIT_FRACTION) {
      const direction = delta < 0 ? 1 : -1;
      setCurrentIndex((idx) => {
        const base = idx >= count ? 0 : idx;
        return Math.max(0, Math.min(count - 1, base + direction));
      });
    }
  };

  const handlePointerCancel = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    setDragOffset(0);
    pauseUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
  };

  if (count === 0) return null;

  const slides = count > 1 ? [...offers, offers[0]] : offers;
  const activeDot = currentIndex % count;

  return (
    <div
      className="offer-banner-container"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <div
        className={`offer-banner-track${dragging || instant ? ' no-transition' : ''}`}
        style={{ transform: `translateX(calc(${-currentIndex * 100}% + ${dragOffset}px))` }}
        onTransitionEnd={handleTransitionEnd}
      >
        {slides.map((offer, idx) => (
          <div key={`${offer.id || 'offer'}-${idx}`} className="offer-slide">
            <img
              src={getResolvedImageUrl(offer)}
              alt="Offer"
              className="offer-img"
              draggable={false}
            />
          </div>
        ))}
      </div>
      {count > 1 && (
        <div className="offer-dots">
          {offers.map((_, idx) => (
            <button
              key={idx}
              type="button"
              aria-label={`Go to banner ${idx + 1}`}
              className={`offer-dot ${idx === activeDot ? 'active' : ''}`}
              onClick={() => {
                pauseUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
                setCurrentIndex(idx);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
