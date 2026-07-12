import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api/dashboardApi';
import { useSettingsStore } from '../../stores/settingsStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { useAuthStore } from '../../stores/authStore';
import { subscribeRealtime } from '../../api/realtimeClient';
import { useStoreModes } from '../../hooks/useStoreModes';

import BottomNav from '../../components/BottomNav';
import StickyMiniCart from '../../components/StickyMiniCart';
import ShopClosedBanner from '../../components/ShopClosedBanner';
import OfferBannerCarousel from '../../components/OfferBannerCarousel';
import CategoryCard from '../../components/CategoryCard';
import ProductCard from '../../components/ProductCard';
import SkeletonCard from '../../components/SkeletonCard';
import ErrorState from '../../components/ErrorState';

import './HomeScreen.css';

const BellIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

export default function HomeScreen() {
  const navigate = useNavigate();
  const token = useAuthStore(state => state.token);
  
  const { fetchSettings, shopOpen } = useSettingsStore();
  const { unreadCount, fetchUnreadCount } = useNotificationStore();
  const { modes } = useStoreModes();

  const [storeType, setStoreType] = useState(() => {
    try {
      return localStorage.getItem('home-store-type') || 'fast_food';
    } catch {
      return 'fast_food';
    }
  });
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // Realtime unread count: refresh on notification events while authenticated.
  // `realtimeClient` only emits `notification.created` and
  // `notification.unread_count.updated`; there is no `notification.read` /
  // `notification.read-all` event in this app, so we listen for what exists.
  useEffect(() => {
    if (!token) return undefined;
    fetchUnreadCount();
    const events = ['notification.created', 'notification.unread_count.updated'];
    const unsubscribers = events.map(eventName =>
      subscribeRealtime(eventName, () => {
        fetchUnreadCount();
      })
    );
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [token, fetchUnreadCount]);

  useEffect(() => {
    try { localStorage.setItem('home-store-type', storeType); } catch { /* storage may be unavailable */ }
  }, [storeType]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.getDashboard(storeType);
      const payload = res.data || res;
      setSections(payload.sections || (Array.isArray(payload) ? payload : []));
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeType]);

  const renderSection = (section, idx) => {
    switch (section.sectionType || section.type || section.section_type) {
      case 'offer_banner':
        return (
          <div className="dashboard-section" key={idx}>
            <OfferBannerCarousel offers={section.items} />
          </div>
        );
      case 'category_grid':
        return (
          <div className="dashboard-section" key={idx}>
            <div className="section-header">
              <div className="section-title-row">
                <div className="section-indicator" />
                <div className="section-title">{section.title || 'Shop by Category'}</div>
              </div>
            </div>
            <div className="grid-4">
              {section.items.slice(0, 8).map(cat => (
                <CategoryCard key={cat.id} category={cat} storeType={storeType} />
              ))}
            </div>
          </div>
        );
      case 'product_block':
      case 'combo_block': {
        const isCombo = (section.sectionType || section.type || section.section_type) === 'combo_block';
        return (
          <div className="dashboard-section" key={idx}>
            {section.title && (
              <div className="section-header">
                <div className="section-title-row">
                  <div className="section-indicator" />
                  <div className="section-title">{section.title}</div>
                </div>
              </div>
            )}
            <div className={isCombo ? 'grid-2' : 'grid-3'}>
              {section.items.map(item => (
                <ProductCard key={item.id} item={item} isCombo={isCombo} />
              ))}
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="screen-container home-screen">
      
      <div className="home-header">
        <div className="home-logo">ServeLoco</div>
        <div className="home-actions">
          <button className="icon-btn" onClick={() => navigate('/notifications')}>
            <BellIcon />
            {unreadCount > 0 && <div className="badge">{unreadCount > 99 ? '99+' : unreadCount}</div>}
          </button>
        </div>
      </div>

      <div className="store-type-tabs">
        {modes.map(m => (
          <button
            key={m.slug}
            className={`store-type-tab ${storeType === m.slug ? 'active' : ''}`}
            onClick={() => setStoreType(m.slug)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="home-content">
        {!shopOpen && <ShopClosedBanner />}
        
        <div className="home-search" onClick={() => navigate(`/products?mode=search&storeType=${storeType}`)}>
          <span className="home-search-icon-ring">
            <SearchIcon />
          </span>
          <span>Search for food, snacks...</span>
        </div>

        {error && <ErrorState message={error} onRetry={loadDashboard} />}

        {loading ? (
          <div className="dashboard-section grid-3">
            {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : (
          sections.map((sec, idx) => renderSection(sec, idx))
        )}
      </div>

      <StickyMiniCart />
      <BottomNav />
    </div>
  );
}
