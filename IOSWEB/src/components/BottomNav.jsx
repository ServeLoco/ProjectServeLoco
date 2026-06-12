import { NavLink } from 'react-router-dom';
import './BottomNav.css';

// SVG Icons (simplified inline for portability)
const HomeIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
  </svg>
);
const OrdersIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
  </svg>
);
const ProfileIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
  </svg>
);

const navClass = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={navClass} end>
        {({ isActive }) => (
          <>
            {isActive && <div className="active-pill" />}
            <HomeIcon />
            <span className="nav-label">Home</span>
          </>
        )}
      </NavLink>
      <NavLink to="/orders" className={navClass}>
        {({ isActive }) => (
          <>
            {isActive && <div className="active-pill" />}
            <OrdersIcon />
            <span className="nav-label">Orders</span>
          </>
        )}
      </NavLink>
      <NavLink to="/profile" className={navClass}>
        {({ isActive }) => (
          <>
            {isActive && <div className="active-pill" />}
            <ProfileIcon />
            <span className="nav-label">Profile</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}
