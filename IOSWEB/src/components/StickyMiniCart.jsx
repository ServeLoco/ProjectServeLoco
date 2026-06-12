import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCartStore } from '../stores/cartStore';
import { formatPrice } from '../utils/formatters';
import './StickyMiniCart.css';

const CartIcon = () => (
  <svg className="cart-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49c.08-.14.12-.31.12-.48 0-.55-.45-1-1-1H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z" />
  </svg>
);

const ChevronRight = () => (
  <svg className="chevron-right" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

export default function StickyMiniCart() {
  const navigate = useNavigate();
  const totalItems = useCartStore((state) => state.getTotalItems());
  const displayTotal = useCartStore((state) => state.getDisplayTotal());

  if (totalItems === 0) return null;

  return (
    <div className="sticky-mini-cart" onClick={() => navigate('/cart')}>
      <div className="cart-left">
        <CartIcon />
        <span className="cart-count">{totalItems} {totalItems === 1 ? 'item' : 'items'}</span>
      </div>
      <div className="cart-right">
        <span>{formatPrice(displayTotal)}</span>
        <ChevronRight />
      </div>
    </div>
  );
}
