import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../../api/notificationsApi';
import { useNotificationStore } from '../../stores/notificationStore';
import { subscribeRealtime } from '../../api/realtimeClient';
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

const PackageIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 8.5 12 4 3 8.5v7L12 20l9-4.5v-7zM5.3 9.94 12 6.61l6.7 3.33L12 13.27 5.3 9.94zM5 12.27l6 3v4.96l-6-3v-4.96zm8 7.96v-4.96l6-3v4.96l-6 3z" />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
  </svg>
);

const WarningIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
);

const TagIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M21.41 11.58 12.41 2.58A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7c0 .53.21 1.04.59 1.41l9 9c.78.78 2.05.78 2.83 0l7-7c.78-.78.78-2.04-.01-2.83zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z" />
  </svg>
);

const MegaphoneIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 11v2h4l5 5V6L7 11H3zm13.5 1c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z" />
  </svg>
);

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

// Map notification.type -> { icon component, colour modifier }.
// Fallback uses the generic bell with grey styling.
const TYPE_CONFIG = {
  order: { Icon: PackageIcon, color: 'blue' },
  success: { Icon: CheckIcon, color: 'green' },
  info: { Icon: InfoIcon, color: 'blue' },
  warning: { Icon: WarningIcon, color: 'amber' },
  offer: { Icon: TagIcon, color: 'purple' },
  admin: { Icon: MegaphoneIcon, color: 'red' },
};

const DATE_GROUP_LABELS = {
  today: 'Today',
  yesterday: 'Yesterday',
  earlier: 'Earlier',
};

const GROUP_ORDER = ['today', 'yesterday', 'earlier'];

function isSameCalendarDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getDateGroupKey(createdAt, now = new Date()) {
  if (!createdAt) return 'earlier';
  const date = new Date(createdAt);
  if (isNaN(date.getTime())) return 'earlier';
  if (isSameCalendarDay(date, now)) return 'today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameCalendarDay(date, yesterday)) return 'yesterday';
  return 'earlier';
}

export default function NotificationsScreen() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const fetchNotifications = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const res = await notificationsApi.list();
      const payload = res.data || res;
      if (!silent) setLoading(false);
      setNotifications(payload.notifications || (Array.isArray(payload) ? payload : []));
      setError(null);
    } catch (err) {
      if (!silent) setLoading(false);
      setError(err.message || 'Failed to load notifications');
    }
  }, []);

  // Initial load.
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime: refresh the list when a new notification arrives.
  useEffect(() => {
    const unsubscribe = subscribeRealtime('notification.created', () => {
      fetchNotifications({ silent: true });
    });
    return unsubscribe;
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      useNotificationStore.getState().setUnreadCount(0);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, is_read: true }))
      );
    } catch (err) {
      console.warn('Failed to mark all notifications read', err);
    }
  };

  const handleNotificationClick = async (notif) => {
    const isRead = notif.read ?? notif.is_read ?? false;
    if (isRead) return;
    // Optimistically update local UI so the dot clears immediately.
    setNotifications((prev) =>
      prev.map((n) => (n.id === notif.id ? { ...n, read: true, is_read: true } : n))
    );
    try {
      await notificationsApi.markRead(notif.id);
      useNotificationStore.getState().decrementUnread();
    } catch (err) {
      console.warn('Failed to mark notification read', err);
    }
  };

  const handleDismiss = async (id, event) => {
    event.stopPropagation();
    // Optimistically remove from local UI first.
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await notificationsApi.deleteNotification(id);
    } catch (err) {
      console.warn('Failed to delete notification', err);
    }
  };

  const groupedNotifications = useMemo(() => {
    const groups = new Map();
    notifications.forEach((notif) => {
      const createdAt = notif.createdAt || notif.created_at;
      const key = getDateGroupKey(createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(notif);
    });
    return GROUP_ORDER.filter((key) => groups.has(key)).map((key) => ({
      key,
      label: DATE_GROUP_LABELS[key],
      items: groups.get(key),
    }));
  }, [notifications]);

  return (
    <div className="screen-container notifications-screen">
      <div className="notif-header">
        <div className="notif-header-left">
          <button
            type="button"
            className="notif-back-btn"
            onClick={() => navigate(-1)}
            aria-label="Back"
          >
            <BackIcon />
          </button>
          <div className="notif-title">Notifications</div>
        </div>
        <button
          type="button"
          className="notif-mark-read"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          aria-label="Mark all notifications as read"
        >
          Mark all read
        </button>
      </div>

      <div className="notif-content">
        {error ? (
          <ErrorState message={error} onRetry={() => window.location.reload()} />
        ) : loading ? (
          <div className="notif-skeleton-wrap">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={
              <BellIcon
                style={{ width: 64, height: 64, fill: 'var(--text-tertiary)' }}
              />
            }
            title="No Notifications"
            message="You're all caught up! We'll notify you when there's an update on your orders."
          />
        ) : (
          <div className="notif-list">
            {groupedNotifications.map((group) => (
              <div key={group.key} className="notif-group">
                <div className="notif-group-label">{group.label}</div>
                {group.items.map((notif) => {
                  const isRead = notif.read ?? notif.is_read ?? false;
                  const message = notif.body || notif.message || '';
                  const createdAt = notif.createdAt || notif.created_at;
                  const typeKey = (notif.type || '').toLowerCase();
                  const config = TYPE_CONFIG[typeKey] || {
                    Icon: BellIcon,
                    color: 'grey',
                  };
                  const TypeIcon = config.Icon;
                  return (
                    <div
                      key={notif.id}
                      className={`notif-item notif-item--${config.color}${
                        !isRead ? ' unread' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(notif)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleNotificationClick(notif);
                        }
                      }}
                    >
                      <div
                        className={`notif-icon-wrapper notif-icon-wrapper--${config.color}`}
                      >
                        <TypeIcon />
                      </div>
                      <div className="notif-body">
                        <div className="notif-item-title">{notif.title}</div>
                        {message && (
                          <div className="notif-item-desc">{message}</div>
                        )}
                        <div className="notif-item-time">{timeAgo(createdAt)}</div>
                      </div>
                      {!isRead && (
                        <span
                          className="notif-unread-dot"
                          aria-label="Unread"
                        />
                      )}
                      <button
                        type="button"
                        className="notif-dismiss-btn"
                        onClick={(e) => handleDismiss(notif.id, e)}
                        aria-label="Dismiss notification"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
