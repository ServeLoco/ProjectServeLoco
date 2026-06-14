import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import BottomNav from '../../components/BottomNav';
import Button from '../../components/Button';
import './ProfileScreen.css';

// SVG Icons
const OrderIcon = () => (
  <svg className="profile-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
  </svg>
);

const NotificationIcon = () => (
  <svg className="profile-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const SupportIcon = () => (
  <svg className="profile-menu-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
  </svg>
);

const ChevronRight = () => (
  <svg className="profile-menu-chevron" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

export default function ProfileScreen() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const clearCart = useCartStore(state => state.clearCart);

  const handleLogout = () => {
    if (window.confirm("Are you sure you want to log out?")) {
      logout();
      clearCart();
      navigate('/auth', { replace: true });
    }
  };

  if (!user) {
    return (
      <div className="screen-container profile-screen">
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="screen-container profile-screen">
      <div className="profile-header">
        <div className="profile-avatar">
          {user.name ? user.name.charAt(0) : 'U'}
        </div>
        <div className="profile-name">{user.name}</div>
        <div className="profile-phone">{user.phone}</div>
        <Button variant="outline" size="small" className="profile-edit-btn" onClick={() => navigate('/profile/edit')}>
          Edit Profile
        </Button>
      </div>

      <div className="profile-content">
        <div className="profile-menu">
          <div className="profile-menu-item" onClick={() => navigate('/orders')}>
            <OrderIcon />
            <span className="profile-menu-text">My Orders</span>
            <ChevronRight />
          </div>
          <div className="profile-menu-item" onClick={() => navigate('/notifications')}>
            <NotificationIcon />
            <span className="profile-menu-text">Notifications</span>
            <ChevronRight />
          </div>
          <div className="profile-menu-item" onClick={() => window.open('mailto:support@serveloco.app')}>
            <SupportIcon />
            <span className="profile-menu-text">Help & Support</span>
            <ChevronRight />
          </div>
        </div>

        <Button variant="outline" className="profile-logout-btn" onClick={handleLogout}>
          Log Out
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
