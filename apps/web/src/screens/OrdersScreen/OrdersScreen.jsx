import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/ordersApi';
import { subscribeOrderEvents } from '../../api/realtimeClient';
import BottomNav from '../../components/BottomNav';
import OrderCard from '../../components/OrderCard/OrderCard';
import EmptyState from '../../components/EmptyState';
import ErrorState from '../../components/ErrorState';
import SkeletonCard from '../../components/SkeletonCard';
import './OrdersScreen.css';

const ReceiptIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style={{width: 64, height: 64, fill: 'var(--text-tertiary)'}}>
    <path d="M18 17H6v-2h12v2zm0-4H6v-2h12v2zm0-4H6V7h12v2zM3 22l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2l-1.5 1.5L6 2 4.5 3.5 3 2v20z"/>
  </svg>
);

// Status groups used for both the hero counts and the filter chips.
// Keep these two definitions in sync with the spec.
const ACTIVE_STATUSES = new Set(['placed', 'accepted', 'preparing', 'out_for_delivery']);

const FILTER_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
];

const EMPTY_MESSAGES = {
  all: {
    title: 'No Orders Yet',
    message: "You haven't placed any orders. Start exploring our menu!",
  },
  active: {
    title: 'No Active Orders',
    message: "You don't have any orders in progress right now.",
  },
  delivered: {
    title: 'No Delivered Orders',
    message: "Orders that have been delivered will show up here.",
  },
  cancelled: {
    title: 'No Cancelled Orders',
    message: "Cancelled orders will show up here for your reference.",
  },
};

function matchesFilter(orderStatus, filterKey) {
  if (filterKey === 'all') return true;
  if (filterKey === 'active') return ACTIVE_STATUSES.has(orderStatus);
  return orderStatus === filterKey;
}

export default function OrdersScreen() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ordersApi.getOrders();
      const payload = res.data || res;
      setOrders(payload.orders || (Array.isArray(payload) ? payload : []));
      setError(null);
    } catch (err) {
      setError(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
  }, [fetchOrders]);

  const handleCancel = async (orderId) => {
    if (!window.confirm('Are you sure you want to cancel this order? This action cannot be undone.')) {
      return;
    }
    try {
      await ordersApi.cancelOrder(orderId);
      await fetchOrders();
    } catch (err) {
      window.alert(err.message || 'Failed to cancel order');
    }
  };

  // Hero counts are always computed from the full unfiltered list, regardless
  // of which chip is active.
  const summary = useMemo(() => {
    let active = 0;
    let delivered = 0;
    let cancelledCount = 0;
    orders.forEach((o) => {
      const status = (o.status || '').toLowerCase();
      if (status === 'delivered') delivered += 1;
      else if (status === 'cancelled') cancelledCount += 1;
      else if (ACTIVE_STATUSES.has(status)) active += 1;
    });
    return {
      total: orders.length,
      active,
      delivered,
      cancelled: cancelledCount,
    };
  }, [orders]);

  const displayOrders = useMemo(
    () => orders.filter((o) => matchesFilter((o.status || '').toLowerCase(), activeFilter)),
    [orders, activeFilter]
  );

  return (
    <div className="screen-container orders-screen">
      <div className="orders-header">
        <div className="orders-title">My Orders</div>
      </div>

      {!loading && !error && orders.length > 0 && (
        <div className="orders-summary" aria-label="Order summary">
          <div className="orders-summary-stat orders-summary-stat--total">
            <div className="orders-summary-value">{summary.total}</div>
            <div className="orders-summary-label">Total</div>
          </div>
          <div className="orders-summary-stat orders-summary-stat--active">
            <div className="orders-summary-value">{summary.active}</div>
            <div className="orders-summary-label">Active</div>
          </div>
          <div className="orders-summary-stat orders-summary-stat--delivered">
            <div className="orders-summary-value">{summary.delivered}</div>
            <div className="orders-summary-label">Delivered</div>
          </div>
          <div className="orders-summary-stat orders-summary-stat--cancelled">
            <div className="orders-summary-value">{summary.cancelled}</div>
            <div className="orders-summary-label">Cancelled</div>
          </div>
        </div>
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="orders-filters" role="tablist" aria-label="Filter orders by status">
          {FILTER_CHIPS.map((chip) => {
            const isActive = activeFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`orders-filter-chip${isActive ? ' orders-filter-chip--active' : ''}`}
                onClick={() => setActiveFilter(chip.key)}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      )}

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
            title={EMPTY_MESSAGES.all.title}
            message={EMPTY_MESSAGES.all.message}
          />
        ) : displayOrders.length === 0 ? (
          <EmptyState
            icon={<ReceiptIcon />}
            title={EMPTY_MESSAGES[activeFilter].title}
            message={EMPTY_MESSAGES[activeFilter].message}
          />
        ) : (
          displayOrders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onCancel={handleCancel}
              onClick={() => navigate(`/order/${order.id}`)}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
