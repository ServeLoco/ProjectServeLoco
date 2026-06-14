import React from 'react';
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import Button from '../../components/Button';
import './OrderConfirmationScreen.css';

const CheckIcon = () => (
  <svg className="oc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

export default function OrderConfirmationScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // If the user lands here without a "confirmation" navigation flag (e.g. by
  // typing the URL or by hitting back), bounce them home instead of showing
  // a stale confirmation screen. Forward navigation from /checkout sets
  // location.state.confirmation = true via the replace below.
  if (!location.state?.confirmation) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="screen-container order-confirmation-screen">
      <div className="oc-icon-wrapper">
        <CheckIcon />
      </div>
      
      <div className="oc-title">Order Placed!</div>
      
      <div className="oc-desc">
        Thank you for your order. Your order ID is <span className="oc-order-id">#{id}</span>.
        We'll start preparing it right away!
      </div>
      
      <div className="oc-actions">
        <Button onClick={() => navigate(`/order/${id}`, { replace: true, state: { confirmation: true } })}>
          Track Order
        </Button>
        <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
