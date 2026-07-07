import { useEffect, useRef } from 'react';
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import Button from '../../components/Button';
import { formatPrice } from '../../utils/formatters';
import './OrderConfirmationScreen.css';

const CheckIcon = () => (
  <svg className="oc-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M5 12.5l4.5 4.5L19 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TicketIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22 10V6c0-1.11-.9-2-2-2H4c-1.1 0-1.99.89-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z" />
  </svg>
);

const REDIRECT_MS = 3000;

// Maps an order object (whatever shape the caller passed) into the display
// fields used by the confirmation UI. Returns null when nothing useful can be
// derived so the order-details card simply hides itself.
const extractOrderDetails = (order) => {
  if (!order || typeof order !== 'object') return null;

  const total =
    order.total_amount ??
    order.totalAmount ??
    order.total ??
    order.grandTotal ??
    order.bill?.grandTotal ??
    order.bill?.total ??
    null;

  const deliveryType = order.delivery_type ?? order.deliveryType ?? null;
  const paymentMethod = order.payment_method ?? order.paymentMethod ?? null;
  const address =
    (typeof order.address === 'string' && order.address.trim()) ||
    order.addressText ||
    order.delivery_address ||
    order.customer?.address ||
    null;
  const eta = order.eta || order.deliveryEta || order.bill?.eta || null;

  if (total === null && !deliveryType && !paymentMethod && !address && !eta) {
    return null;
  }

  return { total, deliveryType, paymentMethod, address, eta };
};

const formatDeliveryType = (deliveryType) => {
  if (!deliveryType) return null;
  const v = String(deliveryType).toLowerCase();
  if (v === 'fast' || v === 'express') return 'Express Delivery';
  if (v === 'standard') return 'Standard Delivery';
  return deliveryType;
};

const formatPaymentMethod = (method) => {
  if (!method) return null;
  const v = String(method).toLowerCase();
  if (v === 'cod' || v === 'cash') return 'Cash on Delivery';
  if (v === 'upi') return 'UPI';
  return method;
};

export default function OrderConfirmationScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const stateOrder = location.state?.order || null;
  // Prefer an explicit orderId from navigation state, fall back to the URL
  // param, then to anything the embedded order object can supply.
  const orderId =
    location.state?.orderId ||
    stateOrder?.order_id ||
    stateOrder?.orderId ||
    stateOrder?.id ||
    id ||
    null;

  const couponDropped =
    location.state?.couponDropped ||
    stateOrder?.couponDropped ||
    null;

  const orderDetails = extractOrderDetails(stateOrder);
  const redirectTimerRef = useRef(null);

  // Only require an orderId so direct access and page refresh keep the user
  // on the confirmation page. Optional order data is used for the summary card
  // but is not required.
  const hasValidState = Boolean(orderId);

  const clearRedirectTimer = () => {
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!hasValidState) return undefined;
    redirectTimerRef.current = setTimeout(() => {
      redirectTimerRef.current = null;
      navigate(`/order/${orderId}`, { replace: true, state: { confirmation: true } });
    }, REDIRECT_MS);
    return clearRedirectTimer;
    // orderId and navigate are stable; intentionally not in the dep array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasValidState, orderId]);

  // Guard: block direct URL access and missing IDs.
  if (!hasValidState) {
    return <Navigate to="/" replace />;
  }

  const handleTrackOrder = () => {
    clearRedirectTimer();
    navigate(`/order/${orderId}`, { replace: true, state: { confirmation: true } });
  };

  const handleBackToHome = () => {
    clearRedirectTimer();
    navigate('/', { replace: true });
  };

  const orderLabel =
    stateOrder?.orderNumber ||
    stateOrder?.order_number ||
    orderId;

  const deliveryLabel = formatDeliveryType(orderDetails?.deliveryType);
  const paymentLabel = formatPaymentMethod(orderDetails?.paymentMethod);
  const showOrderCard =
    orderDetails !== null &&
    (orderDetails.total !== null ||
      deliveryLabel ||
      paymentLabel ||
      orderDetails.eta ||
      orderDetails.address);

  return (
    <div className="screen-container order-confirmation-screen">
      <div className="oc-icon-wrapper">
        <div className="oc-ripple" aria-hidden="true" />
        <div className="oc-ripple oc-ripple-delay" aria-hidden="true" />
        <div className="oc-icon-circle">
          <CheckIcon />
        </div>
      </div>

      <div className="oc-title">Order Placed!</div>

      <div className="oc-desc">
        Thank you for your order. Your order ID is{' '}
        <span className="oc-order-id">#{orderLabel}</span>.
        We&apos;ll start preparing it right away!
      </div>

      {couponDropped && (
        <div className="oc-coupon-banner" role="status">
          <div className="oc-coupon-icon">
            <TicketIcon />
          </div>
          <div className="oc-coupon-text">
            <div className="oc-coupon-title">Coupon unlocked!</div>
            {couponDropped.code && (
              <div className="oc-coupon-code">{couponDropped.code}</div>
            )}
            {couponDropped.description && (
              <div className="oc-coupon-desc">{couponDropped.description}</div>
            )}
          </div>
        </div>
      )}

      {showOrderCard && (
        <div className="oc-card" aria-label="Order summary">
          {orderDetails.total !== null && (
            <>
              <div className="oc-row">
                <span className="oc-label">Total Amount</span>
                <span className="oc-value">{formatPrice(orderDetails.total)}</span>
              </div>
              <div className="oc-divider" />
            </>
          )}

          {paymentLabel && (
            <>
              <div className="oc-row">
                <span className="oc-label">Payment</span>
                <span className="oc-value">{paymentLabel}</span>
              </div>
              <div className="oc-divider" />
            </>
          )}

          {deliveryLabel && (
            <>
              <div className="oc-row">
                <span className="oc-label">Delivery</span>
                <span className="oc-value">{deliveryLabel}</span>
              </div>
              <div className="oc-divider" />
            </>
          )}

          {orderDetails.eta && (
            <>
              <div className="oc-row">
                <span className="oc-label">Estimated Arrival</span>
                <span className="oc-value">{orderDetails.eta}</span>
              </div>
              <div className="oc-divider" />
            </>
          )}

          {orderDetails.address && (
            <div className="oc-col">
              <span className="oc-label">Delivery Address</span>
              <span className="oc-address">{orderDetails.address}</span>
            </div>
          )}
        </div>
      )}

      <div className="oc-redirect" aria-live="polite">
        <span>Opening order details…</span>
        <div className="oc-progress-track">
          <div className="oc-progress-fill" />
        </div>
      </div>

      <div className="oc-actions">
        <Button onClick={handleTrackOrder}>Track Order</Button>
        <Button variant="outline" onClick={handleBackToHome}>
          Back to Home
        </Button>
      </div>
    </div>
  );
}
