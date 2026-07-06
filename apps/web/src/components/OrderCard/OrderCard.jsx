import React, { Fragment } from 'react';
import OrderStatusBadge from '../OrderStatusBadge';
import { formatPrice, formatDate } from '../../utils/formatters';
import './OrderCard.css';

// Mini progress stepper — kept in sync with the customer app's five-stage flow.
const PROGRESS_STEPS = [
  { key: 'placed', label: 'Placed' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'preparing', label: 'Preparing' },
  { key: 'out_for_delivery', label: 'Out for Delivery' },
  { key: 'delivered', label: 'Delivered' },
];

const STATUS_TO_STEP = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  out_for_delivery: 3,
  delivered: 4,
};

function getStepIndex(status) {
  if (!status) return 0;
  return STATUS_TO_STEP[status.toLowerCase()] ?? 0;
}

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

/**
 * OrderCard
 * Compact summary card for the orders list. Renders a status badge, date,
 * first item preview, total, and a five-step horizontal progress tracker.
 * Cancelled orders replace the stepper with a red banner. When
 * `order.canCancel === true`, an inline Cancel button is shown.
 *
 * Props:
 *   order    - order object from the API (status lowercase, items[], total, canCancel, ...)
 *   onCancel - optional (orderId) => void; shown only when order.canCancel === true
 *   onClick  - optional () => void; fires when the card body is clicked/pressed
 */
export default function OrderCard({ order, onCancel, onClick }) {
  if (!order) return null;

  const status = (order.status || '').toLowerCase();
  const isCancelled = status === 'cancelled';
  const currentStep = isCancelled ? -1 : getStepIndex(status);

  const items = Array.isArray(order.items) ? order.items : [];
  const firstItem = items.length > 0 ? items[0]?.product_name || 'Item' : null;
  const moreCount = items.length > 1 ? items.length - 1 : 0;

  const handleCardClick = () => {
    if (typeof onClick === 'function') onClick();
  };

  const handleCardKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick();
    }
  };

  const handleCancelClick = (e) => {
    e.stopPropagation();
    if (typeof onCancel === 'function') onCancel(order.id);
  };

  return (
    <div
      className="order-card"
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="order-card-header">
        <div className="order-card-meta">
          <div className="order-id">Order #{order.order_number || order.id}</div>
          <div className="order-date">{formatDate(order.created_at)}</div>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="order-card-body">
        <div className="order-items-preview">
          {firstItem ? (
            <>
              <span className="order-first-item">{firstItem}</span>
              {moreCount > 0 && (
                <span className="order-more"> +{moreCount} more</span>
              )}
            </>
          ) : (
            <span>{order.item_count || 1} Items</span>
          )}
        </div>
        <div className="order-amount">
          {formatPrice(order.total || order.total_amount || 0)}
        </div>
      </div>

      {isCancelled ? (
        <div className="order-cancelled-banner" role="status">
          <CloseIcon />
          <span>Order Cancelled</span>
        </div>
      ) : (
        <div className="order-progress" aria-label="Order progress">
          {PROGRESS_STEPS.map((step, idx) => {
            const isDone = idx <= currentStep;
            const isCurrent = idx === currentStep;
            const isLast = idx === PROGRESS_STEPS.length - 1;
            const lineFilled = idx < currentStep;
            return (
              <Fragment key={step.key}>
                <div
                  className={`order-progress-step${isDone ? ' done' : ''}${isCurrent ? ' current' : ''}`}
                >
                  <div className="order-progress-marker">
                    {isCurrent ? (
                      <span className="order-progress-dot" />
                    ) : isDone ? (
                      <CheckIcon />
                    ) : (
                      <span className="order-progress-dot" />
                    )}
                  </div>
                  <div className="order-progress-label">{step.label}</div>
                </div>
                {!isLast && (
                  <div
                    className={`order-progress-line${lineFilled ? ' filled' : ''}`}
                    aria-hidden="true"
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      )}

      {order.canCancel === true && !isCancelled && (
        <button
          type="button"
          className="order-cancel-btn"
          onClick={handleCancelClick}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
