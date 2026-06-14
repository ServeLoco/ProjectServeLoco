import React, { useState, useEffect, useRef } from 'react';
import './OfferBannerCarousel.css';

import { getResolvedImageUrl } from '../utils/imageUtils';

export default function OfferBannerCarousel({ offers = [] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!offers || offers.length <= 1) return;
    
    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        const next = (prev + 1) % offers.length;
        if (scrollRef.current) {
          const width = scrollRef.current.offsetWidth;
          scrollRef.current.scrollTo({ left: width * next, behavior: 'smooth' });
        }
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [offers]);

  const handleScroll = (e) => {
    if (!scrollRef.current) return;
    const scrollLeft = e.target.scrollLeft;
    const width = scrollRef.current.offsetWidth;
    const index = Math.round(scrollLeft / width);
    if (index !== currentIndex) {
      setCurrentIndex(index);
    }
  };

  if (!offers || offers.length === 0) return null;

  return (
    <div className="offer-banner-container">
      <div 
        className="offer-banner-scroller hide-scrollbar" 
        ref={scrollRef}
        onScroll={handleScroll}
      >
        {offers.map((offer, idx) => (
          <div key={offer.id || idx} className="offer-slide">
            <img 
              src={getResolvedImageUrl(offer)} 
              alt="Offer" 
              className="offer-img" 
            />
          </div>
        ))}
      </div>
      {offers.length > 1 && (
        <div className="offer-dots">
          {offers.map((_, idx) => (
            <div key={idx} className={`offer-dot ${idx === currentIndex ? 'active' : ''}`} />
          ))}
        </div>
      )}
    </div>
  );
}
