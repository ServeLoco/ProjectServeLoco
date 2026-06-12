import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Button from '../../components/Button';
import './OrderConfirmationScreen.css';

const CheckIcon = () => (
  <svg className="oc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

export default function OrderConfirmationScreen() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Prevent going back to checkout
  useEffect(() => {
    window.history.pushState(null, null, window.location.pathname);
    const handlePopState = () => {
      navigate('/', { replace: true });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [navigate]);

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
        <Button onClick={() => navigate(`/order/${id}`, { replace: true })}>
          Track Order
        </Button>
        <Button variant="outline" onClick={() => navigate('/', { replace: true })}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
