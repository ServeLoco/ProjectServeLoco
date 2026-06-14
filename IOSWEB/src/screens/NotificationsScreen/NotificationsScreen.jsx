import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/notificationsApi';
import { useNotificationStore } from '../../stores/notificationStore';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import SkeletonCard from '../../components/SkeletonCard';
import { timeAgo } from '../../utils/formatters';
import './NotificationsScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

const BellIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchUnreadCount = useNotificationStore(state => state.fetchUnreadCount);

  useEffect(() => {
    const fetchNotifs = async () => {
      setLoading(true);
      try {
        const res = await notificationsApi.list();
        const payload = res.data || res;
        setNotifications(payload.notifications || (Array.isArray(payload) ? payload : []));
        // Automatically mark all as read when viewed. Swallow errors here
        // so a 401 (expired token) doesn't blow up the screen; the list
        // is still rendered, and the next request will refresh the count.
        try {
          await notificationsApi.markAllRead();
          fetchUnreadCount(); // reset store count to 0
        } catch (markErr) {
          console.warn('Failed to mark notifications as read', markErr);
        }
      } catch (err) {
        setError(err.message || 'Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };
    fetchNotifs();
  }, [fetchUnreadCount]);

  return (
    <div className="screen-container notifications-screen">
      <div className="notif-header">
        <div className="notif-header-left">
          <button className="notif-back-btn" onClick={() => navigate(-1)}><BackIcon /></button>
          <div className="notif-title">Notifications</div>
        </div>
      </div>

      <div className="notif-content">
        {error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : loading ? (
          <div style={{ padding: '16px' }}>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState 
            icon={<BellIcon style={{width: 64, height: 64, fill: 'var(--text-tertiary)'}} />}
            title="No Notifications" 
            message="You're all caught up! We'll notify you when there's an update on your orders." 
          />
        ) : (
          <div className="notif-list">
            {notifications.map(notif => {
              const isRead = notif.read ?? notif.is_read ?? false;
              const message = notif.body || notif.message || '';
              const createdAt = notif.createdAt || notif.created_at;
              return (
              <div key={notif.id} className={`notif-item ${!isRead ? 'unread' : ''}`}>
                <div className="notif-icon-wrapper">
                  <BellIcon />
                </div>
                <div className="notif-content">
                  <div className="notif-item-title">{notif.title}</div>
                  <div className="notif-item-desc">{message}</div>
                  <div className="notif-item-time">{timeAgo(createdAt)}</div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
