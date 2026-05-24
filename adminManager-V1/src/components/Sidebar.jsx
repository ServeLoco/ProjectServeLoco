import React from 'react';
import { NavLink } from 'react-router-dom';
import './Sidebar.css';

const navItems = [
  { path: '/', label: 'Dashboard' },
  { path: '/orders', label: 'Orders' },
  { path: '/products', label: 'Products / Items' },
  { path: '/combos', label: 'Combos' },
  { path: '/categories', label: 'Categories' },
  { path: '/offers', label: 'Offers' },
  { path: '/customers', label: 'Customers' },
  { path: '/settings', label: 'Settings' },
  { path: '/images', label: 'Images' },
  { path: '/reports', label: 'Reports' },
  { path: '/health', label: 'Backend Health' },
  { path: '/audit', label: 'Activity / Audit Log' },
];

export default function Sidebar() {
  return (
    <aside className="admin-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">SL</div>
        <span>ServeLoco Admin</span>
      </div>
      <nav className="sidebar-nav">
        <ul className="sidebar-list">
          {navItems.map(item => (
            <li key={item.path}>
              <NavLink 
                to={item.path} 
                className={({ isActive }) => 
                  `sidebar-item-link${isActive ? ' active' : ''}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
