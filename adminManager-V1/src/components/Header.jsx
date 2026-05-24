import React from 'react';
import { useAuth } from './AuthProvider';
import { useLocation } from 'react-router-dom';

export default function Header() {
  const { logout, user } = useAuth();
  const location = useLocation();

  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return 'Dashboard';
    return path.substring(1).charAt(0).toUpperCase() + path.substring(2);
  };

  return (
    <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 2rem', background: '#fff', borderBottom: '1px solid #ddd' }}>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{getPageTitle()}</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span>Admin: {user?.id || user?.ownerId || 'Unknown'}</span>
        <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>Refresh</button>
        <button onClick={logout} style={{ padding: '0.5rem 1rem', background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
      </div>
    </header>
  );
}
