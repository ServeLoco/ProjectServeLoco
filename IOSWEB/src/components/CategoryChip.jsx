import React from 'react';
import './CategoryChip.css';

export default function CategoryChip({ label, active, onClick }) {
  return (
    <button 
      className={`category-chip ${active ? 'active' : ''}`} 
      onClick={onClick}
    >
      {label}
    </button>
  );
}
