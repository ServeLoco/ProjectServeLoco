import { useEffect, useState } from 'react';
import { productsApi } from '../../api/productsApi';
import { useStoreModes } from '../../hooks/useStoreModes';
import BottomNav from '../../components/BottomNav';
import CategoryCard from '../../components/CategoryCard';
import ErrorState from '../../components/ErrorState';
import './CategoriesScreen.css';

export default function CategoriesScreen() {
  const { modes } = useStoreModes();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [type, setType] = useState('fast_food');

  useEffect(() => {
    productsApi.getCategories(type)
      .then(res => {
        const payload = res.data || res;
        setCategories(payload.categories || (Array.isArray(payload) ? payload : []));
      })
      .catch(err => setError(err.message || 'Failed to load categories'))
      .finally(() => setLoading(false));
  }, [type]);

  return (
    <div className="screen-container categories-screen">
      <div className="cat-header">
        <div className="cat-title">Categories</div>
      </div>
      
      <div className="store-type-tabs cat-tabs">
        {modes.map(m => (
          <button
            key={m.slug}
            className={`store-type-tab ${type === m.slug ? 'active' : ''}`}
            onClick={() => setType(m.slug)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setLoading(true)} />
      ) : loading ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>Loading...</div>
      ) : (
        <div className="cat-grid">
          {categories.map(cat => (
            <CategoryCard key={cat.id} category={cat} storeType={type} />
          ))}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
