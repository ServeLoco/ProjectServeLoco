export const formatPrice = (price) => {
  if (isNaN(price) || price === null) return '₹0';
  return `₹${Number(price).toLocaleString('en-IN')}`;
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const timeAgo = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const seconds = Math.floor((new Date() - date) / 1000);
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' years ago';
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' months ago';
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' days ago';
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' hours ago';
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' minutes ago';
  return 'Just now';
};

export const getStatusLabel = (status) => {
  const map = {
    'Pending': 'Order Placed',
    'Accepted': 'Confirmed',
    'Preparing': 'Preparing',
    'Ready': 'Ready',
    'Out for Delivery': 'Out for Delivery',
    'Delivered': 'Delivered',
    'Cancelled': 'Cancelled'
  };
  return map[status] || status;
};

export const getStatusColor = (status) => {
  switch(status) {
    case 'Pending': return 'var(--warning)';
    case 'Accepted': return 'var(--info)';
    case 'Preparing':
    case 'Ready':
    case 'Out for Delivery': return 'var(--saffron)';
    case 'Delivered': return 'var(--success)';
    case 'Cancelled': return 'var(--error)';
    default: return 'var(--text-secondary)';
  }
};
