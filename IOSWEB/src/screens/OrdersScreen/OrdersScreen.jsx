import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/ordersApi';
import { subscribeOrderEvents } from '../../api/realtimeClient';
import BottomNav from '../../components/BottomNav';
import OrderStatusBadge from '../../components/OrderStatusBadge';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import SkeletonCard from '../../components/SkeletonCard';
import { formatPrice, formatDate } from '../../utils/formatters';
import './OrdersScreen.css';

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{width: 64, height: 64, fill: 'var(--text-tertiary)'}}>
    <path d="M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2l-1.5 1.5L6 2 4.5 3.5 3 2v20z"/>
  </svg>
);

export default function OrdersScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrders = async () => {
      setLoading(true);
      try {
        const res = await ordersApi.getOrders();
        const payload = res.data || res;
        setOrders(payload.orders || (Array.isArray(payload) ? payload : []));
      } catch (err) {
        setError(err.message || 'Failed to load orders');
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();

    let cancelled = false;
    const unsubOrders = subscribeOrderEvents(({ eventName, payload }) => {
      if (!payload || !payload.orderId) return;
      if (cancelled) return;
      if (
        eventName === 'order.status.updated' ||
        eventName === 'order.payment.updated' ||
        eventName === 'order.updated' ||
        eventName === 'order.cancelled' ||
        eventName === 'order.created'
      ) {
        // Refetch the list so the updated row carries every server-side field
        // instead of a 2-key partial merge.
        fetchOrders();
      }
    });

    return () => {
      cancelled = true;
      unsubOrders();
    };
  }, []);

  return (
    <div className="screen-container orders-screen">
      <div className="orders-header">
        <div className="orders-title">My Orders</div>
      </div>

      <div className="orders-content">
        {error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : orders.length === 0 ? (
          <EmptyState 
            icon={<ReceiptIcon />}
            title="No Orders Yet" 
            message="You haven't placed any orders. Start exploring our menu!" 
          />
        ) : (
          orders.map(order => (
            <div 
              key={order.id} 
              className="order-card"
              onClick={() => navigate(`/order/${order.id}`)}
            >
              <div className="order-card-header">
                <div>
                  <div className="order-id">Order #{order.order_number || order.id}</div>
                  <div className="order-date">{formatDate(order.created_at)}</div>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>
              <div className="order-items-preview">
                {order.items ? order.items.map(i => `${i.quantity}x ${i.product_name}`).join(', ') : `${order.item_count || 1} Items`}
              </div>
              <div className="order-amount">
                {formatPrice(order.total || order.total_amount || 0)}
              </div>
            </div>
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
