import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import AdminNotificationsBell from './AdminNotificationsBell';
import './Header.css';

const PAGE_META = {
  '/': { title: 'Dashboard', subtitle: 'Overview & live stats' },
  '/orders': { title: 'Orders', subtitle: 'Manage customer orders' },
  '/products': { title: 'Products', subtitle: 'Catalogue management' },
  '/combos': { title: 'Combos', subtitle: 'Bundle management' },
  '/categories': { title: 'Categories', subtitle: 'Product categories' },
  '/offers': { title: 'Offers', subtitle: 'Promotions & discounts' },
  '/mobile-dashboard': { title: 'App Home', subtitle: 'Mobile app layout' },
  '/customers': { title: 'Customers', subtitle: 'User management' },
  '/notifications': { title: 'Notifications', subtitle: 'Push alerts' },
  '/settings': { title: 'Settings', subtitle: 'Store configuration' },
  '/images': { title: 'Images', subtitle: 'Media library' },
  '/reports': { title: 'Reports', subtitle: 'Sales & analytics' },
  '/health': { title: 'System Health', subtitle: 'Backend diagnostics' },
  '/audit': { title: 'Audit Log', subtitle: 'Activity history' },
  '/bulk-import': { title: 'Bulk Import', subtitle: 'CSV + ZIP product import' },
};

function useLiveClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function Header() {
  const { logout, user } = useAuth();
  const location = useLocation();
  const now = useLiveClock();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const go = () => setIsOnline(true);
    const stop = () => setIsOnline(false);
    window.addEventListener('online', go);
    window.addEventListener('offline', stop);
    return () => { window.removeEventListener('online', go); window.removeEventListener('offline', stop); };
  }, []);

  const meta = PAGE_META[location.pathname] || {
    title: location.pathname.replace('/', '').replace(/-/g, ' '),
    subtitle: '',
  };

  const userLabel = user?.id || user?.ownerId || 'Admin';
  const avatarChar = String(userLabel).charAt(0).toUpperCase();

  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <header className="admin-header">
      <div className="header-page-meta">
        <h1 className="header-title">{meta.title}</h1>
        {meta.subtitle && <p className="header-subtitle">{meta.subtitle}</p>}
      </div>

      <div className="header-actions">
        {/* Live clock */}
        <div className="header-clock">
          <span className="header-clock-time">{timeStr}</span>
          <span className="header-clock-date">{dateStr}</span>
        </div>

        {/* Online indicator */}
        <div className={`header-online-badge ${isOnline ? 'online' : 'offline'}`}>
          <span className="header-online-dot" />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        <ThemeToggle />

        {/* Admin notifications bell */}
        <AdminNotificationsBell />

        {/* User badge */}
        <div className="header-user-badge">
          <div className="user-avatar">{avatarChar}</div>
          <span className="user-name">{userLabel}</span>
        </div>

        {/* Refresh — icon only */}
        <button
          onClick={() => window.location.reload()}
          className="btn-header-icon"
          title="Refresh page"
          aria-label="Refresh"
        >
          ↺
        </button>

        {/* Logout */}
        <button onClick={logout} className="btn-header-action logout">
          Sign Out
        </button>
      </div>
    </header>
  );
}
