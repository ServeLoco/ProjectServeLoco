import React from 'react';
import './Button.css';

export default function Button({
  children,
  variant = 'primary', // primary, success, highlight, outline
  size = 'normal', // normal, small
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  style
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${size === 'small' ? 'btn-small' : ''} ${className}`}
      disabled={disabled}
      onClick={onClick}
      style={style}
    >
      {children}
    </button>
  );
}
