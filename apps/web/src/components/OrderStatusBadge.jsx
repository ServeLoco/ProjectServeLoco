import { getStatusLabel, getStatusColor } from '../utils/formatters';
import './OrderStatusBadge.css';

export default function OrderStatusBadge({ status }) {
  const color = getStatusColor(status);
  const label = getStatusLabel(status);

  // Derive a lighter background by using transparency over the hex/variable
  // Since we use CSS vars that are hex, we'll just apply a style trick or use predefined backgrounds.
  // For simplicity, we can set color and background color dynamically.

  const getBgColor = (s) => {
    switch(s) {
      case 'Pending': return 'var(--warning-light)';
      case 'Accepted': return 'var(--info-light)';
      case 'Preparing':
      case 'Ready':
      case 'Out for Delivery': return 'var(--saffron-light)';
      case 'Delivered': return 'var(--success-light)';
      case 'Cancelled': return 'var(--error-light)';
      default: return 'var(--bg-input)';
    }
  };

  return (
    <div 
      className="order-status-badge" 
      style={{ 
        color: color, 
        backgroundColor: getBgColor(status) 
      }}
    >
      {label}
    </div>
  );
}
