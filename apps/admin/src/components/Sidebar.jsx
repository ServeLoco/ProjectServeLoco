import React, { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAreaStore } from '../stores/useAreaStore';
import AdminIcon from './AdminIcon';
import './Sidebar.css';

const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: 'dashboard' },
    ],
  },
  {
    label: 'Orders & Delivery',
    items: [
      { path: '/orders', label: 'Orders', icon: 'orders' },
      { path: '/riders', label: 'Riders', icon: 'riders' },
      { path: '/delivery-zones', label: 'Delivery Zones', icon: 'pin' },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      { path: '/products', label: 'Products', icon: 'products' },
      { path: '/categories', label: 'Categories', icon: 'categories' },
      { path: '/combos', label: 'Combos', icon: 'combos' },
      { path: '/store-modes', label: 'Store Modes', icon: 'modes' },
      { path: '/images', label: 'Images', icon: 'images' },
    ],
  },
  {
    label: 'Shops & Team',
    items: [
      { path: '/shops', label: 'Shops', icon: 'shops' },
      { path: '/mobile-admins', label: 'Mobile Admins', icon: 'mobile' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { path: '/offers', label: 'Offers', icon: 'offers' },
      { path: '/coupons', label: 'Coupons', icon: 'coupons' },
      { path: '/offer-cards', label: 'Offer Cards', icon: 'cards' },
      { path: '/notifications', label: 'Notifications', icon: 'bell' },
    ],
  },
  {
    label: 'App & Customers',
    items: [
      { path: '/mobile-dashboard', label: 'App Home', icon: 'appHome' },
      // Customers are one account nationwide — a super admin page.
      { path: '/customers', label: 'Customers', icon: 'customers', superAdminOnly: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { path: '/reports', label: 'Reports', icon: 'reports' },
      { path: '/analytics', label: 'Analytics', icon: 'analytics' },
      { path: '/heat-map', label: 'App Opens Map', icon: 'map' },
    ],
  },
  {
    label: 'System',
    items: [
      { path: '/settings', label: 'Settings', icon: 'settings' },
      { path: '/health', label: 'System Health', icon: 'health' },
    ],
  },
];

// 26.8/25.5 — super_admin only, hidden entirely for an area_admin (no nav
// link, and the routes themselves are also gated by SuperAdminRoute).
const SUPER_ADMIN_GROUP = {
  label: 'Multi-Area',
  items: [
    { path: '/areas', label: 'Areas', icon: 'areas' },
    { path: '/admins', label: 'Admins', icon: 'admins' },
    { path: '/library', label: 'Library', icon: 'library' },
  ],
};

export default function Sidebar({ mobileOpen, setMobileOpen }) {
  const sidebarRef = useRef(null);
  const toggleRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1024px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [setMobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const sidebar = sidebarRef.current;
    sidebar.querySelector('button')?.focus();
    const onKeyDown = (event) => {
      if (event.target.closest?.('.order-alert-overlay')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setMobileOpen(false);
      }
      if (event.key !== 'Tab') return;
      const controls = sidebar.querySelectorAll('button, a[href]');
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (window.matchMedia('(max-width: 1024px)').matches && !document.querySelector('.order-alert-overlay')) {
        toggleRef.current?.focus();
      }
    };
  }, [mobileOpen, setMobileOpen]);
  const { isSuperAdmin } = useAreaStore() || {};
  const navGroups = isSuperAdmin
    ? [...NAV_GROUPS, SUPER_ADMIN_GROUP]
    : NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !item.superAdminOnly) }))
      .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        ref={toggleRef}
        type="button"
        className={`sidebar-mobile-toggle${mobileOpen ? ' is-open' : ''}`}
        onClick={() => setMobileOpen(o => !o)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="admin-navigation"
      >
        <AdminIcon name="menu" />
      </button>

      <aside ref={sidebarRef} id="admin-navigation"
        className={`admin-sidebar${mobileOpen ? ' mobile-open' : ''}`}
        {...(isMobile && !mobileOpen ? { inert: '' } : {})}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label="Admin navigation">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img className="sidebar-logo-img" src="/logo.png" alt="VillKro" />
          </div>
          <div className="sidebar-brand-text">
            <span className="sidebar-brand-name">VillKro</span>
            <span className="sidebar-brand-subtitle">Admin Panel</span>
          </div>
          <button type="button" className="sidebar-close" aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}><AdminIcon name="close" /></button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navGroups.map((group, index) => (
            <div key={group.label} className="sidebar-group" style={{ '--group-index': index }}>
              <span className="sidebar-group-label">{group.label}</span>
              <ul className="sidebar-list">
                {group.items.map(item => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      className={({ isActive }) =>
                        `sidebar-item-link${isActive ? ' active' : ''}`
                      }
                      onClick={() => setMobileOpen(false)}
                      end={item.path === '/'}
                    >
                      <AdminIcon name={item.icon} className="sidebar-icon" />
                      <span className="sidebar-label">{item.label}</span>
                      <AdminIcon name="chevron" size={14} className="sidebar-link-chevron" />
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-footer-badge">
            <span className="sidebar-footer-dot" />
            <span>VillKro Admin</span>
          </div>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="sidebar-mobile-backdrop" aria-hidden="true" onClick={() => setMobileOpen(false)} />
      )}
    </>
  );
}
