import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { productsApi } from '../../api/productsApi';
import ProductCard from '../../components/ProductCard';
import CategoryChip from '../../components/CategoryChip';
import SkeletonCard from '../../components/SkeletonCard';
import ErrorState from '../../components/ErrorState';
import EmptyState from '../../components/EmptyState';
import Button from '../../components/Button';
import StickyMiniCart from '../../components/StickyMiniCart';
import './ProductListScreen.css';

const BackIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="pl-search-icon">
    <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
  </svg>
);

export default function ProductListScreen() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const initialCategoryId = searchParams.get('categoryId') || '';
  const initialSearch = searchParams.get('search') || '';
  const storeType = searchParams.get('storeType') || 'fast_food';

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  
  const [activeCategory, setActiveCategory] = useState(initialCategoryId);
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Load Categories on mount
  useEffect(() => {
    productsApi.getCategories(storeType)
      .then(res => {
        const payload = res.data || res;
        setCategories(payload.categories || (Array.isArray(payload) ? payload : []));
      })
      .catch(console.error);
  }, [storeType]);

  // Load Products
  const loadProducts = useCallback(async (pageNum = 1, isAppend = false) => {
    if (pageNum === 1) setLoading(true);
    else setLoadingMore(true);
    setError(null);

    try {
      const params = {
        page: pageNum,
        limit: 20,
        type: storeType
      };
      if (activeCategory) params.category_id = activeCategory;
      if (searchQuery) params.search = searchQuery;

      const res = await productsApi.getProducts(params);
      const payload = res.data || res;
      const newProducts = payload.products || (Array.isArray(payload) ? payload : []);
      // Prefer the server-provided pagination flag when present; fall back
      // to the page-size heuristic so empty last pages don't show a "Load More"
      // button that returns nothing.
      const hasMore = typeof payload.hasMore === 'boolean'
        ? payload.hasMore
        : (typeof payload.has_more === 'boolean'
            ? payload.has_more
            : newProducts.length === 20);

      setProducts(prev => isAppend ? [...prev, ...newProducts] : newProducts);
      setHasMore(hasMore);
      setPage(pageNum);
    } catch (err) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [activeCategory, searchQuery, storeType]);

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      loadProducts(1, false);
    }, 400);
    return () => clearTimeout(timer);
  }, [activeCategory, searchQuery, loadProducts]);

  // Mirror activeCategory/searchQuery back into the URL on a *separate* tick
  // so setSearchParams cannot re-trigger the load effect above.
  useEffect(() => {
    const newParams = new URLSearchParams(searchParams);
    if (activeCategory) newParams.set('categoryId', activeCategory);
    else newParams.delete('categoryId');
    if (searchQuery) newParams.set('search', searchQuery);
    else newParams.delete('search');
    const currentCategory = searchParams.get('categoryId') || '';
    const currentSearch = searchParams.get('search') || '';
    if (currentCategory === activeCategory && currentSearch === searchQuery) return;
    setSearchParams(newParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategory, searchQuery]);

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleCategoryClick = (id) => {
    setActiveCategory(prev => prev === String(id) ? '' : String(id));
  };

  return (
    <div className="screen-container product-list-screen">
      <div className="pl-header">
        <button className="pl-back-btn" onClick={() => navigate(-1)}>
          <BackIcon />
        </button>
        <div className="pl-search-container">
          <SearchIcon />
          <input 
            type="text" 
            className="pl-search-input" 
            placeholder="Search products..."
            value={searchQuery}
            onChange={handleSearchChange}
            autoFocus={searchParams.get('mode') === 'search'}
          />
        </div>
      </div>

      <div className="pl-categories-scroll hide-scrollbar">
        <CategoryChip 
          label="All" 
          active={!activeCategory} 
          onClick={() => handleCategoryClick('')} 
        />
        {categories.map(cat => (
          <CategoryChip 
            key={cat.id} 
            label={cat.name} 
            active={activeCategory === String(cat.id)}
            onClick={() => handleCategoryClick(cat.id)}
          />
        ))}
      </div>

      <div className="pl-content">
        {error ? (
          <ErrorState message={error} onRetry={() => loadProducts(1)} />
        ) : loading ? (
          <div className="pl-grid">
            {[1,2,3,4,5,6].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <EmptyState 
            title="No Products Found" 
            message="We couldn't find anything matching your criteria." 
          />
        ) : (
          <>
            <div className="pl-grid">
              {products.map(product => (
                <ProductCard key={product.id} item={product} />
              ))}
            </div>
            
            {hasMore && (
              <div className="pl-load-more">
                <Button 
                  variant="outline" 
                  size="small" 
                  onClick={() => loadProducts(page + 1, true)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      
      <StickyMiniCart />
    </div>
  );
}
