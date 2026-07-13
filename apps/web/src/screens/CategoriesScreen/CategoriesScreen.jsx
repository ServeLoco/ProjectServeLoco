import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { productsApi } from '../../api/productsApi';
import { useStoreModes } from '../../hooks/useStoreModes';
import BottomNav from '../../components/BottomNav';
import CategoryCard from '../../components/CategoryCard';
import ErrorState from '../../components/ErrorState';
import SkeletonCard from '../../components/SkeletonCard';
import './CategoriesScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

export default function CategoriesScreen() {
  const navigate = useNavigate();
  const { modes } = useStoreModes();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState(() => {
    try {
      return localStorage.getItem('home-store-type') || 'fast_food';
    } catch {
      return 'fast_food';
    }
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await productsApi.getCategories(type);
      const payload = res.data || res;
      setCategories(payload.categories || (Array.isArray(payload) ? payload : []));
    } catch (err) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="screen-container categories-screen">
      <div className="cat-header">
        <button type="button" className="cat-back-btn" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <div className="cat-title">Categories</div>
      </div>

      <div className="store-type-tabs cat-tabs">
        {modes.map((m) => (
          <button
            key={m.slug}
            type="button"
            className={`store-type-tab ${type === m.slug ? 'active' : ''}`}
            onClick={() => setType(m.slug)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : loading ? (
        <div className="cat-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No categories found for this store.
        </div>
      ) : (
        <div className="cat-grid">
          {categories.map((cat) => (
            <CategoryCard key={cat.id} category={cat} storeType={type} />
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
