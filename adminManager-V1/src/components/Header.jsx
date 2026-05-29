import React from 'react';
import { useAuth } from './AuthProvider';
import { useLocation } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import './Header.css';

export default function Header() {
  const { logout, user } = useAuth();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    const cleanPath = path.substring(1);
    if (cleanPath === 'audit') return 'Activity & Audit Logs';
    if (cleanPath === 'health') return 'System Health Status';
    return cleanPath.charAt(0).toUpperCase() + cleanPath.substring(1);
  };

  const userLabel = user?.id || user?.ownerId || 'Admin';
  const avatarChar = String(userLabel).charAt(0).toUpperCase();

  return (
    <header className="admin-header">
      <h1 className="header-title">{getPageTitle()}</h1>
      <div className="header-actions">
        <ThemeToggle />
        <div className="header-user-badge">
          <div className="user-avatar">{avatarChar}</div>
          <span className="user-name">{userLabel}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="btn-header-action refresh"
        >
          Refresh
        </button>
        <button
          onClick={logout}
          className="btn-header-action logout"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
