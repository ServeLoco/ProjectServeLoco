import React from 'react';
import { NavLink } from 'react-router-dom';

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
    <aside style={{ width: '250px', background: '#333', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', fontSize: '1.2rem', fontWeight: 'bold', borderBottom: '1px solid #444' }}>
        Admin Panel
      </div>
      <nav style={{ flex: 1, overflowY: 'auto' }}>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {navItems.map(item => (
            <li key={item.path}>
              <NavLink 
                to={item.path} 
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '1rem',
                  color: '#fff',
                  textDecoration: 'none',
                  background: isActive ? '#555' : 'transparent',
                })}
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
