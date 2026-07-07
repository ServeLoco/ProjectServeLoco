import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useCartStore } from '../../stores/cartStore';
import { useSettingsStore } from '../../stores/settingsStore';
import BottomNav from '../../components/BottomNav';
import './ProfileScreen.css';

/* ------------------------------------------------------------------ */
/* Inline SVG icons — matches the web app's existing icon convention  */
/* ------------------------------------------------------------------ */

const EditIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
);

const LocationIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
  </svg>
);

const InstagramIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.74 3.74 0 0 1-1.38-.9 3.74 3.74 0 0 1-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.62c-3.15 0-3.5.01-4.74.07-1.04.05-1.6.22-1.98.37-.5.19-.85.42-1.22.79-.37.37-.6.72-.79 1.22-.15.38-.32.94-.37 1.98C3.85 8.5 3.84 8.85 3.84 12s.01 3.5.07 4.74c.05 1.04.22 1.6.37 1.98.19.5.42.85.79 1.22.37.37.72.6 1.22.79.38.15.94.32 1.98.37 1.24.06 1.59.07 4.74.07s3.5-.01 4.74-.07c1.04-.05 1.6-.22 1.98-.37.5-.19.85-.42 1.22-.79.37-.37.6-.72.79-1.22.15-.38.32-.94.37-1.98.06-1.24.07-1.59.07-4.74s-.01-3.5-.07-4.74c-.05-1.04-.22-1.6-.37-1.98a3.27 3.27 0 0 0-.79-1.22 3.27 3.27 0 0 0-1.22-.79c-.38-.15-.94-.32-1.98-.37C15.5 3.79 15.15 3.78 12 3.78zm0 2.76A5.46 5.46 0 1 1 6.54 12 5.46 5.46 0 0 1 12 6.54zm0 9A3.54 3.54 0 1 0 8.46 12 3.54 3.54 0 0 0 12 15.54zm5.74-9.18a1.27 1.27 0 1 1-1.27-1.27 1.27 1.27 0 0 1 1.27 1.27z" />
  </svg>
);

const OrdersIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
  </svg>
);

const NotificationIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const HelpIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z" />
  </svg>
);

const LockIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
  </svg>
);

const MailIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
  </svg>
);

const DeleteIcon = () => (
  <svg className="ps-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
  </svg>
);

const ChevronRight = () => (
  <svg className="ps-row-chevron" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
  </svg>
);

const WarningIcon = () => (
  <svg className="ps-banner-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
  </svg>
);

const CloseIcon = () => (
  <svg className="ps-banner-icon-svg" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

const SUPPORT_EMAIL = 'support@serveloco.app';
const PRIVACY_URL = 'https://api.serveloco.app/policies/privacy';
const TERMS_URL = 'https://api.serveloco.app/policies/terms';
const DEFAULT_INSTAGRAM_URL = 'https://instagram.com/serveloco';

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const formatAddress = (address) => {
  if (!address) return null;
  if (typeof address === 'string') return address.trim() || null;
  const { houseNumber, street, area, city, pincode } = address;
  return [houseNumber, street, area, city, pincode]
    .filter(Boolean)
    .join(', ')
    .trim() || null;
};

const formatDeletionDate = (requestedAt) => {
  if (!requestedAt) return '';
  const start = new Date(requestedAt);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000);
  return end.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getMemberSinceYear = (user) => {
  const raw = user?.memberSince || user?.member_since || user?.createdAt;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
};

/* ------------------------------------------------------------------ */
/* Main component                                                       */
/* ------------------------------------------------------------------ */

export default function ProfileScreen() {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const fetchUser = useAuthStore(state => state.fetchUser);
  const requestAccountDeletion = useAuthStore(state => state.requestAccountDeletion);
  const cancelAccountDeletion = useAuthStore(state => state.cancelAccountDeletion);
  const clearCart = useCartStore(state => state.clearCart);

  const settings = useSettingsStore(state => state.settings);

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Refresh profile on mount so deletion-scheduled/blocked flags are
  // up to date without requiring the user to log out and back in.
  useEffect(() => {
    fetchUser().catch(() => {
      /* offline-friendly: keep cached user */
    });
  }, [fetchUser]);

  const instagramUrl = useMemo(() => {
    const fromSettings = settings?.instagramUrl || settings?.instagram_url;
    return fromSettings || DEFAULT_INSTAGRAM_URL;
  }, [settings]);

  const memberSinceYear = useMemo(() => getMemberSinceYear(user), [user]);
  const addressText = useMemo(() => formatAddress(user?.address), [user]);

  const isBlocked = !!user?.isBlocked || user?.status === 'Blocked';
  const deletionRequestedAt = user?.deletionRequestedAt || user?.deletion_requested_at || null;

  const handleLogout = () => {
    clearCart();
    logout();
    setShowLogoutConfirm(false);
    navigate('/auth', { replace: true });
  };

  const handleRequestDeletion = async () => {
    setIsMutating(true);
    setActionError(null);
    try {
      await requestAccountDeletion();
      setShowDeleteConfirm(false);
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Could not schedule deletion.');
    } finally {
      setIsMutating(false);
    }
  };

  const handleCancelDeletion = async () => {
    setIsMutating(true);
    setActionError(null);
    try {
      await cancelAccountDeletion();
    } catch (err) {
      setActionError(err?.response?.data?.message || err?.message || 'Could not cancel deletion.');
    } finally {
      setIsMutating(false);
    }
  };

  if (!user) {
    return (
      <div className="screen-container profile-screen">
        <BottomNav />
      </div>
    );
  }

  const initial = (user.name || user.phone || 'U').trim().charAt(0).toUpperCase();

  return (
    <div className="screen-container profile-screen">
      {/* -------------------- Hero -------------------- */}
      <section className="ps-hero">
        <div className="ps-hero-bg" aria-hidden="true">
          <span className="ps-hero-blob ps-hero-blob-a" />
          <span className="ps-hero-blob ps-hero-blob-b" />
        </div>

        <div className="ps-hero-top">
          <div className="ps-avatar">
            <span className="ps-avatar-letter">{initial}</span>
            <span className="ps-avatar-badge" aria-hidden="true">
              <CheckIcon />
            </span>
          </div>

          <div className="ps-hero-info">
            <div className="ps-hero-name">{user.name || 'Welcome'}</div>
            <div className="ps-hero-phone">{user.phone || ''}</div>
            <div className="ps-hero-chips">
              <span className="ps-chip ps-chip-solid">
                <span className="ps-chip-star" aria-hidden="true">★</span>
                ServeLoco Member
              </span>
              <span className="ps-chip ps-chip-ghost">
                {memberSinceYear ? `Member since ${memberSinceYear}` : 'Fresh member'}
              </span>
            </div>
          </div>

          <button
            type="button"
            className="ps-hero-edit"
            onClick={() => navigate('/profile/edit')}
            aria-label="Edit profile"
          >
            <EditIcon />
          </button>
        </div>
      </section>

      {/* -------------------- Content -------------------- */}
      <div className="ps-content">

        {/* Status banners */}
        {isBlocked && (
          <div className="ps-banner ps-banner-blocked" role="alert">
            <span className="ps-banner-icon">
              <CloseIcon />
            </span>
            <span className="ps-banner-text">
              Your account is currently restricted. Contact support to restore access.
            </span>
          </div>
        )}

        {deletionRequestedAt && (
          <div className="ps-banner ps-banner-deletion" role="alert">
            <div className="ps-banner-head">
              <span className="ps-banner-icon">
                <WarningIcon />
              </span>
              <span className="ps-banner-title">Account deletion scheduled</span>
            </div>
            <p className="ps-banner-body">
              Your account and data will be permanently deleted on{' '}
              <strong>{formatDeletionDate(deletionRequestedAt)}</strong> (30 days from confirmation).
            </p>
            <button
              type="button"
              className="ps-cancel-delete-btn"
              onClick={handleCancelDeletion}
              disabled={isMutating}
            >
              <CheckIcon />
              <span>{isMutating ? 'Cancelling…' : 'Cancel deletion'}</span>
            </button>
          </div>
        )}

        {actionError && (
          <div className="ps-banner ps-banner-error" role="alert">
            <span className="ps-banner-text">{actionError}</span>
          </div>
        )}

        {/* Instagram follow card */}
        <a
          className="ps-ig-card"
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Follow us on Instagram"
        >
          <span className="ps-ig-blob ps-ig-blob-a" aria-hidden="true" />
          <span className="ps-ig-blob ps-ig-blob-b" aria-hidden="true" />
          <span className="ps-ig-blob ps-ig-blob-c" aria-hidden="true" />

          <div className="ps-ig-top">
            <span className="ps-ig-icon-bubble">
              <InstagramIcon />
            </span>
            <span className="ps-ig-tag">SOCIAL</span>
          </div>

          <div className="ps-ig-middle">
            <div className="ps-ig-title">Follow us on Instagram</div>
            <div className="ps-ig-handle">@serveloco</div>
            <div className="ps-ig-subtitle">
              Behind-the-scenes, offers and updates from your local shop
            </div>
          </div>

          <div className="ps-ig-bottom">
            <span className="ps-ig-follow">Follow</span>
            <span className="ps-ig-arrow"><ChevronRight /></span>
          </div>
        </a>

        {/* Address panel */}
        <div className="ps-address-card">
          <span className="ps-address-icon">
            <LocationIcon />
          </span>
          <div className="ps-address-content">
            <div className="ps-address-label">Delivery address</div>
            <div className="ps-address-text">
              {addressText || 'No address added yet. Tap to set your delivery location.'}
            </div>
          </div>
          <button
            type="button"
            className="ps-address-edit-chip"
            onClick={() => navigate('/profile/edit')}
            aria-label="Edit address"
          >
            <EditIcon />
            <span>Edit</span>
          </button>
        </div>

        {/* Menu sections */}
        <section className="ps-menu-section">
          <h2 className="ps-menu-section-title">Account</h2>
          <div className="ps-menu-card">
            <button type="button" className="ps-menu-row" onClick={() => navigate('/orders')}>
              <span className="ps-menu-row-icon" style={{ background: 'var(--info-light)', color: 'var(--info)' }}>
                <OrdersIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">My Orders</span>
                <span className="ps-menu-row-caption">Track current and past orders</span>
              </span>
              <ChevronRight />
            </button>
            <button type="button" className="ps-menu-row" onClick={() => navigate('/notifications')}>
              <span className="ps-menu-row-icon" style={{ background: 'var(--saffron-light)', color: 'var(--saffron-dark)' }}>
                <NotificationIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Notifications</span>
                <span className="ps-menu-row-caption">Offers, order updates and alerts</span>
              </span>
              <ChevronRight />
            </button>
            <button type="button" className="ps-menu-row" onClick={() => navigate('/profile/edit')}>
              <span className="ps-menu-row-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                <EditIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Edit Profile</span>
                <span className="ps-menu-row-caption">Name, phone, address</span>
              </span>
              <ChevronRight />
            </button>
            <button type="button" className="ps-menu-row ps-menu-row-last" onClick={() => navigate('/profile/edit')}>
              <span className="ps-menu-row-icon" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <LocationIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Saved Address</span>
                <span className="ps-menu-row-caption">Manage your delivery location</span>
              </span>
              <ChevronRight />
            </button>
          </div>
        </section>

        <section className="ps-menu-section">
          <h2 className="ps-menu-section-title">Support &amp; Legal</h2>
          <div className="ps-menu-card">
            <a className="ps-menu-row" href={`mailto:${SUPPORT_EMAIL}`}>
              <span className="ps-menu-row-icon" style={{ background: '#E8F8EF', color: '#1FB574' }}>
                <HelpIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Help</span>
                <span className="ps-menu-row-caption">{SUPPORT_EMAIL}</span>
              </span>
              <ChevronRight />
            </a>
            <a className="ps-menu-row" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              <span className="ps-menu-row-icon" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                <LockIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Privacy Policy</span>
                <span className="ps-menu-row-caption">How we handle your data</span>
              </span>
              <ChevronRight />
            </a>
            <a className="ps-menu-row" href={TERMS_URL} target="_blank" rel="noopener noreferrer">
              <span className="ps-menu-row-icon" style={{ background: '#F1F5F9', color: '#475569' }}>
                <ShieldIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Terms of Service</span>
                <span className="ps-menu-row-caption">Rules for using ServeLoco</span>
              </span>
              <ChevronRight />
            </a>
            <a className="ps-menu-row" href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              <span className="ps-menu-row-icon" style={{ background: 'var(--saffron-light)', color: 'var(--saffron-dark)' }}>
                <CheckIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Data Safety</span>
                <span className="ps-menu-row-caption">Permissions, sharing and retention</span>
              </span>
              <ChevronRight />
            </a>
            <a className="ps-menu-row ps-menu-row-last" href={`mailto:${SUPPORT_EMAIL}`}>
              <span className="ps-menu-row-icon" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                <MailIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Contact Us</span>
                <span className="ps-menu-row-caption">{SUPPORT_EMAIL}</span>
              </span>
              <ChevronRight />
            </a>
          </div>
        </section>

        <section className="ps-menu-section">
          <h2 className="ps-menu-section-title">Account Actions</h2>
          <div className="ps-menu-card">
            <button type="button" className="ps-menu-row" onClick={() => setShowLogoutConfirm(true)}>
              <span className="ps-menu-row-icon" style={{ background: '#FFF7ED', color: '#9A3412' }}>
                <LogoutIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Log Out</span>
                <span className="ps-menu-row-caption">Log out from this device</span>
              </span>
              <ChevronRight />
            </button>
            <button
              type="button"
              className="ps-menu-row ps-menu-row-last ps-menu-row-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <span className="ps-menu-row-icon" style={{ background: 'var(--error-light)', color: 'var(--error)' }}>
                <DeleteIcon />
              </span>
              <span className="ps-menu-row-content">
                <span className="ps-menu-row-label">Delete Account</span>
                <span className="ps-menu-row-caption">30-day grace period before permanent deletion</span>
              </span>
              <ChevronRight />
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="ps-footer">
          <span className="ps-footer-divider" aria-hidden="true" />
          <div className="ps-footer-brand">ServeLoco — Freshness delivered</div>
          <div className="ps-footer-tag">v1.0.0</div>
        </footer>
      </div>

      {/* -------------------- Modals -------------------- */}
      {showLogoutConfirm && (
        <div className="ps-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ps-logout-title">
          <div className="ps-modal">
            <h3 className="ps-modal-title" id="ps-logout-title">Log out?</h3>
            <p className="ps-modal-body">
              You will need to login again to place orders and view your account.
            </p>
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-modal-btn ps-modal-btn-secondary"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Stay
              </button>
              <button
                type="button"
                className="ps-modal-btn ps-modal-btn-danger"
                onClick={handleLogout}
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="ps-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="ps-delete-title">
          <div className="ps-modal">
            <h3 className="ps-modal-title" id="ps-delete-title">Schedule account deletion?</h3>
            <p className="ps-modal-body">
              Your account and data will be permanently deleted 30 days from now.
              You can cancel anytime in this Profile screen during the grace period —
              just tap &ldquo;Cancel deletion&rdquo; on the banner above.
            </p>
            <div className="ps-modal-actions">
              <button
                type="button"
                className="ps-modal-btn ps-modal-btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isMutating}
              >
                Keep account
              </button>
              <button
                type="button"
                className="ps-modal-btn ps-modal-btn-danger"
                onClick={handleRequestDeletion}
                disabled={isMutating}
              >
                {isMutating ? 'Scheduling…' : 'Schedule deletion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
