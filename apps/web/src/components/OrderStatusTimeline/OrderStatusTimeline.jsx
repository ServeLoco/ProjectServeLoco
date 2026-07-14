import { formatCancelReasonForCustomer } from '../../utils/cancelReason';
import './OrderStatusTimeline.css';

const STATUS_STEPS = [
  { id: 'Pending', label: 'Order Placed' },
  { id: 'Accepted', label: 'Order Accepted' },
  { id: 'Preparing', label: 'Preparing / Packing' },
  { id: 'Out for Delivery', label: 'Out for Delivery' },
  { id: 'Delivered', label: 'Delivered' },
];

const normalizeStatus = (status) => {
  if (!status) return 'Pending';
  if (status === 'OutForDelivery' || status === 'Out_For_Delivery') return 'Out for Delivery';
  if (status === 'OutForDelivery') return 'Out for Delivery';
  return status;
};

/**
 * OrderStatusTimeline
 * Vertical progress tracker mirroring the customer app.
 *
 * Props:
 *   status - current order status string
 *   cancelled - bool (renders a cancelled state)
 */
export default function OrderStatusTimeline({ status, cancelled = false, cancelReason = null }) {
  const current = normalizeStatus(status);
  const currentIndex = STATUS_STEPS.findIndex(step => step.id === current);

  if (cancelled || current === 'Cancelled') {
    return (
      <div className="order-timeline cancelled">
        <div className="timeline-cancelled-badge">Order Cancelled</div>
        <div className="timeline-cancelled-text">
          {formatCancelReasonForCustomer(cancelReason)}
          {' '}
          If you were charged, a refund will be processed shortly.
        </div>
      </div>
    );
  }

  return (
    <div className="order-timeline">
      {STATUS_STEPS.map((step, idx) => {
        const isDone = idx <= currentIndex;
        const isCurrent = idx === currentIndex;
        return (
          <div
            key={step.id}
            className={`timeline-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}
          >
            <div className="timeline-marker">
              {isDone ? (
                <svg viewBox="0 0 24 24" className="timeline-check">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              ) : (
                <span className="timeline-dot" />
              )}
              {idx < STATUS_STEPS.length - 1 && (
                <span className={`timeline-line ${idx < currentIndex ? 'filled' : ''}`} />
              )}
            </div>
            <div className="timeline-label">{step.label}</div>
          </div>
        );
      })}
    </div>
  );
}