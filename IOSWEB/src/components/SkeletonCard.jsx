import React from 'react';
import './SkeletonCard.css';

export default function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-img"></div>
      <div className="skeleton skeleton-text"></div>
      <div className="skeleton skeleton-text short"></div>
    </div>
  );
}
