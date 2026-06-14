import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/ordersApi';
import { subscribeOrderEvents } from '../../api/realtimeClient';
import OrderStatusBadge from '../../components/OrderStatusBadge';
import ErrorState from '../../components/ErrorState';
import SkeletonCard from '../../components/SkeletonCard';
import { formatPrice, formatDate } from '../../utils/formatters';
import './OrderDetailScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

export default function OrderDetailScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      try {
        const res = await ordersApi.getOrder(id);
        const payload = res.data || res;
        setOrder(payload.order || payload);
      } catch (err) {
        setError(err.message || 'Failed to load order details');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();

    let cancelled = false;
    const unsubOrders = subscribeOrderEvents(({ eventName, payload }) => {
      if (!payload || String(payload.orderId) !== String(id)) return;
      if (cancelled) return;
      if (
        eventName === 'order.status.updated' ||
        eventName === 'order.payment.updated' ||
        eventName === 'order.updated' ||
        eventName === 'order.cancelled'
      ) {
        // Refetch so the UI shows all server-side fields, not just the two
        // fields the partial payload happens to carry.
        fetchOrder();
      }
    });

    return () => {
      cancelled = true;
      unsubOrders();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="screen-container">
        <div className="od-header">
          <button className="od-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="od-title">Order Details</div>
        </div>
        <div className="od-content">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="screen-container">
        <div className="od-header">
          <button className="od-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="od-title">Order Details</div>
        </div>
        <ErrorState message={error || 'Order not found'} />
      </div>
    );
  }

  return (
    <div className="screen-container order-detail-screen">
      <div className="od-header">
        <button className="od-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
        <div className="od-title">Order #{order.order_number || order.id}</div>
      </div>

      <div className="od-content">
        <div className="od-section">
          <div className="od-row">
            <span>Status</span>
            <OrderStatusBadge status={order.status} />
          </div>
          <div className="od-row">
            <span>Date</span>
            <span className="od-row bold">{formatDate(order.created_at)}</span>
          </div>
          <div className="od-row">
            <span>Payment Method</span>
            <span className="od-row bold">{order.payment_method?.toUpperCase()}</span>
          </div>
          <div className="od-row">
            <span>Delivery Speed</span>
            <span className="od-row bold">{order.delivery_type === 'fast' ? 'Express' : 'Standard'}</span>
          </div>
        </div>

        <div className="od-section">
          <div className="od-section-title">Delivery Address</div>
          <div className="od-row" style={{ whiteSpace: 'pre-wrap' }}>
            {order.address || order.delivery_address || 'No address provided'}
          </div>
        </div>

        <div className="od-section">
          <div className="od-section-title">Items</div>
          <div className="od-items-list">
            {order.items?.map((item, idx) => (
              <div key={idx} className="od-item">
                <div className="od-item-name">{item.product_name}</div>
                <div className="od-item-qty">{item.quantity}x</div>
                <div className="od-item-price">{formatPrice((item.unit_price || item.price || 0) * item.quantity)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="od-section">
          <div className="od-section-title">Bill Summary</div>
          <div className="od-row">
            <span>Item Total</span>
            <span>{formatPrice(order.subtotal || 0)}</span>
          </div>
          <div className="od-row">
            <span>Delivery Charge</span>
            <span>{order.delivery_charge ? formatPrice(order.delivery_charge) : 'FREE'}</span>
          </div>
          {order.night_charge > 0 && (
            <div className="od-row">
              <span>Night Charge</span>
              <span>{formatPrice(order.night_charge)}</span>
            </div>
          )}
          {order.discount > 0 && (
            <div className="od-row">
              <span>Discount</span>
              <span className="text-success">-{formatPrice(order.discount)}</span>
            </div>
          )}
          <div className="od-row bold" style={{ borderTop: '1px dashed var(--border)', paddingTop: '8px', marginTop: '4px' }}>
            <span>Grand Total</span>
            <span>{formatPrice(order.total || order.total_amount || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
