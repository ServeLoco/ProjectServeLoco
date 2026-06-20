import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProductsApi, CategoriesApi, ImagesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { getUploadedImage, normalizeImageUrl } from '../utils/imageUrl';
import { IMAGE_GUIDANCE, isWithinTimeWindow, formatTimeWindow } from '../utils/imageGuidance';
import { getImageUploadError } from '../utils/fileValidation';
import { useImageCropper } from '../hooks/useImageCropper';
import ImageCropper from '../components/ImageCropper/ImageCropper';
import './Products.css';

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export default function Products() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    category_id: '',
    available: '',
    featured: '',
    is_combo: '0',
    type: 'packed'
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  // Inline delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => { fetchCategories(); }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchProducts(1), 500);
    return () => clearTimeout(timer);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCategories = async () => {
    try {
      const res = await CategoriesApi.list();
      setCategories(res.data || []);
    } catch (err) {
      console.error('Failed to load categories', err);
    }
  };

  const readProducts = (res) => readList(res, ['products']);

  const fetchProducts = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, limit: 20, ...filters };
      Object.keys(params).forEach(k => !params[k] && params[k] !== false && delete params[k]);
      const res = await ProductsApi.list(params);
      setProducts(readProducts(res));
      if (res.pagination) setPagination(res.pagination);
      setSelectedIds([]);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAll = () => {
    if (selectedIds.length === products.length) setSelectedIds([]);
    else setSelectedIds(products.map(p => p.id));
  };

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 4000);
  };

  const toggleAvailability = async (product) => {
    const newStatus = !product.available;
    try {
      await ProductsApi.updateAvailability(product.id, newStatus);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: newStatus } : p));
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    }
  };

  // Generic bulk action using the new batch APIs
  const runBulkUpdate = async (updates, successLabel) => {
    setBulkUpdating(true);
    setError(null);
    try {
      const res = await ProductsApi.bulkUpdate(selectedIds, updates);
      const msg = res.skipped > 0
        ? `${res.updated} products updated. ${res.skipped} skipped (already deleted).`
        : `${res.updated} products ${successLabel}.`;
      showSuccess(msg);
      fetchProducts(pagination.page);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkAvailability = (available) =>
    runBulkUpdate({ available }, available ? 'marked in stock' : 'marked out of stock');

  const handleBulkFeatured = (featured) =>
    runBulkUpdate({ featured }, featured ? 'marked as featured' : 'removed from featured');

  const handleBulkMoveCategory = async () => {
    if (!bulkCategoryId) return;
    await runBulkUpdate({ category_id: Number(bulkCategoryId) }, 'moved to category');
    setBulkCategoryId('');
  };

  const handleBulkDelete = async () => {
    setBulkUpdating(true);
    setError(null);
    setConfirmDelete(false);
    try {
      const res = await ProductsApi.bulkDelete(selectedIds);
      const msg = res.skipped > 0
        ? `${res.deleted} products deleted. ${res.skipped} skipped (already removed).`
        : `${res.deleted} products deleted.`;
      showSuccess(msg);
      fetchProducts(1);
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
    } finally {
      setBulkUpdating(false);
    }
  };

  const openCreateDrawer = () => { setEditingProduct(null); setDrawerOpen(true); };
  const openEditDrawer = (product) => { setEditingProduct(product); setDrawerOpen(true); };
  const closeDrawer = () => { setDrawerOpen(false); setEditingProduct(null); };

  // Categories filtered by current mode tab for the move-to-category dropdown
  const filteredCategoriesForBulk = categories.filter(c => c.type === filters.type && !c.deleted);

  return (
    <div className="products-container">
      <header className="products-header">
        <h1 className="products-title">Products Management</h1>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn-secondary" onClick={() => navigate('/bulk-import')}>📦 Bulk Import</button>
          <button className="btn-primary" onClick={openCreateDrawer}>+ New Product</button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button
          className={`btn-secondary ${filters.type === 'packed' ? 'active' : ''}`}
          style={filters.type === 'packed' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setFilters(prev => ({ ...prev, type: 'packed', category_id: '' }))}
        >
          Packed Items
        </button>
        <button
          className={`btn-secondary ${filters.type === 'fast_food' ? 'active' : ''}`}
          style={filters.type === 'fast_food' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setFilters(prev => ({ ...prev, type: 'fast_food', category_id: '' }))}
        >
          Fast Food
        </button>
      </div>

      <section className="filter-bar">
        <input
          type="text" name="search" placeholder="Search product name..."
          className="filter-input filter-search" value={filters.search} onChange={handleFilterChange}
        />
        <select name="category_id" className="filter-select" value={filters.category_id} onChange={handleFilterChange}>
          <option value="">All Categories</option>
          {categories.filter(c => c.type === filters.type && !c.deleted).map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="available" className="filter-select" value={filters.available} onChange={handleFilterChange}>
          <option value="">All Availability</option>
          <option value="1">In Stock</option>
          <option value="0">Out of Stock</option>
        </select>
        <select name="featured" className="filter-select" value={filters.featured} onChange={handleFilterChange}>
          <option value="">All Featured Status</option>
          <option value="1">Featured Only</option>
        </select>
      </section>

      {selectedIds.length > 0 && (
        <div className="bulk-actions-bar">
          <span className="bulk-actions-info">{selectedIds.length} item(s) selected</span>
          <div className="bulk-actions-buttons">
            <button className="btn-secondary" disabled={bulkUpdating} onClick={() => handleBulkAvailability(true)}>Mark In Stock</button>
            <button className="btn-secondary" disabled={bulkUpdating} onClick={() => handleBulkAvailability(false)}>Mark Out of Stock</button>
            <button className="btn-secondary" disabled={bulkUpdating} onClick={() => handleBulkFeatured(true)}>⭐ Mark Featured</button>
            <button className="btn-secondary" disabled={bulkUpdating} onClick={() => handleBulkFeatured(false)}>Remove Featured</button>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                className="filter-select"
                style={{ margin: 0 }}
                value={bulkCategoryId}
                onChange={e => setBulkCategoryId(e.target.value)}
              >
                <option value="">Move to Category...</option>
                {filteredCategoriesForBulk.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button className="btn-secondary" disabled={bulkUpdating || !bulkCategoryId} onClick={handleBulkMoveCategory}>Move</button>
            </div>
            {!confirmDelete ? (
              <button
                className="btn-secondary"
                style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}
                disabled={bulkUpdating}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            ) : (
              <div className="bi-confirm-bar" style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center', background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px', padding: '0.35rem 0.75rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#856404' }}>⚠️ Delete {selectedIds.length} products?</span>
                <button className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }} disabled={bulkUpdating} onClick={handleBulkDelete}>Yes, Delete</button>
                <button className="btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem' }} onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {successMessage && <div className="success-container" style={{ margin: '0 0 1rem 0', padding: '0.75rem 1rem', background: '#d4edda', border: '1px solid #c3e6cb', borderRadius: '6px', color: '#155724' }}>{successMessage}</div>}
      {error && <div className="error-container" style={{ margin: '0 0 2rem 0' }}>{error}</div>}

      <section className="products-table-wrapper">
        <table className="products-table">
          <thead>
            <tr>
              <th style={{ width: '40px' }}>
                <input
                  type="checkbox"
                  checked={products.length > 0 && selectedIds.length === products.length}
                  onChange={selectAll}
                />
              </th>
              <th>Product</th>
              <th>Price</th>
              <th>Category</th>
              <th>Order</th>
              <th>Availability</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading products...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No products found.</td></tr>
            ) : (
              products.map(p => (
                <tr key={p.id} className={selectedIds.includes(p.id) ? 'selected' : ''}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelection(p.id)} />
                  </td>
                  <td>
                    <div className="product-info">
                      <img src={normalizeImageUrl(p.imageUrl || p.image_url) || 'https://via.placeholder.com/48'} alt={p.name} className="product-thumbnail" />
                      <div className="product-details">
                        <span className="product-name">{p.name}</span>
                        <span className="product-unit">{p.unit || '1 plate'} {p.featured ? '• Featured' : ''}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--text-primary)' }}>₹{p.price}</strong>
                    {p.original_price && <div style={{ fontSize: '0.8rem', textDecoration: 'line-through', color: 'var(--text-secondary)' }}>₹{p.original_price}</div>}
                  </td>
                  <td>{p.category_name}</td>
                  <td>{p.display_order || 0}</td>
                  <td>
                    <button
                      className={`availability-toggle ${p.available ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleAvailability(p)}
                    >
                      {p.available ? 'In Stock' : 'Out of Stock'}
                    </button>
                    {(p.available_from_time || p.available_until_time) ? (
                      <div style={{ marginTop: '0.25rem' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 10,
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: isWithinTimeWindow(p.available_from_time, p.available_until_time)
                            ? 'rgba(34, 197, 94, 0.15)'
                            : 'rgba(239, 68, 68, 0.15)',
                          color: isWithinTimeWindow(p.available_from_time, p.available_until_time)
                            ? '#15803d'
                            : '#b91c1c',
                          marginRight: 6,
                        }}>
                          {isWithinTimeWindow(p.available_from_time, p.available_until_time) ? '✓ Visible now' : '✗ Hidden now'}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          ⏰ {formatTimeWindow(p.available_from_time, p.available_until_time)}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <button className="action-link" onClick={() => openEditDrawer(p)}>Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="pagination-controls">
          <button className="btn-secondary" disabled={pagination.page <= 1 || loading} onClick={() => fetchProducts(pagination.page - 1)}>Previous</button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Page {pagination.page} of {pagination.totalPages}</span>
          <button className="btn-secondary" disabled={pagination.page >= pagination.totalPages || loading} onClick={() => fetchProducts(pagination.page + 1)}>Next</button>
        </div>
      </section>

      {drawerOpen && (
        <ProductFormDrawer
          product={editingProduct}
          categories={categories}
          currentMode={filters.type}
          onClose={closeDrawer}
          onSave={() => { closeDrawer(); fetchProducts(pagination.page); }}
        />
      )}
    </div>
  );
}

// Separate Component for the Drawer — unchanged from original
function ProductFormDrawer({ product, categories, currentMode, onClose, onSave }) {
  const isEdit = !!product;
  const initialMode = product?.category_type || categories.find(c => String(c.id) === String(product?.category_id))?.type || currentMode || 'packed';
  const [productMode, setProductMode] = useState(initialMode);
  const [formData, setFormData] = useState(() => {
    if (product) {
      // MySQL TIME fields come back as strings like '09:00:00' or as Date objects depending on driver config.
      // Normalize them to HH:MM so the <input type="time"> works correctly.
      const formatTime = (v) => {
        if (!v) return '';
        if (typeof v === 'string') return v.length >= 5 ? v.slice(0, 5) : v;
        if (v instanceof Date) {
          const hh = String(v.getHours()).padStart(2, '0');
          const mm = String(v.getMinutes()).padStart(2, '0');
          return `${hh}:${mm}`;
        }
        return '';
      };
      return {
        ...product,
        available_from_time: formatTime(product.available_from_time),
        available_until_time: formatTime(product.available_until_time)
      };
    }
    return {
      name: '', description: '', price: '', original_price: '', unit: '',
      category_id: '', display_order: 0, available: true, featured: false,
      discount_label: '', image_id: '', image_url: '',
      available_from_time: '', available_until_time: ''
    };
  });

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const fileInputRef = useRef(null);

  const uploadImageFile = async (file) => {
    const sizeError = getImageUploadError(file);
    if (sizeError) {
      setUploadMessage({ type: 'error', text: sizeError });
      return;
    }
    const data = new FormData();
    data.append('image', file);
    try {
      setUploadingImage(true);
      setUploadMessage(null);
      const res = await ImagesApi.upload(data);
      const image = getUploadedImage(res);
      setFormData(prev => ({ ...prev, image_id: image.id, image_url: image.url }));
      setUploadMessage({ type: 'success', text: 'Image uploaded. Save the product to apply it.' });
    } catch (err) {
      console.error(err);
      setUploadMessage({ type: 'error', text: GENERIC_ERROR });
    } finally {
      setUploadingImage(false);
    }
  };

  const { fileInputProps, cropperProps } = useImageCropper({
    type: 'product',
    defaultAspect: 1,
    onCropped: uploadImageFile,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleModeChange = (e) => {
    const nextMode = e.target.value;
    setProductMode(nextMode);
    setFormData(prev => {
      const selectedCategory = categories.find(c => String(c.id) === String(prev.category_id));
      return { ...prev, category_id: selectedCategory?.type === nextMode ? prev.category_id : '' };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      const price = Number(formData.price);
      const originalPrice = formData.original_price ? Number(formData.original_price) : null;
      if (!Number.isFinite(price) || price < 0) {
        alert('Product price must be a valid non-negative number.');
        setSaving(false);
        return;
      }
      if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) {
        alert('Original price must be a valid amount and cannot be lower than selling price.');
        setSaving(false);
        return;
      }
      const fromTime = formData.available_from_time || null;
      const untilTime = formData.available_until_time || null;
      const payload = {
        ...formData,
        price,
        original_price: originalPrice,
        display_order: Number(formData.display_order) || 0,
        imageId: formData.image_id,
        image_id: formData.image_id,
        available_from_time: fromTime,
        available_until_time: untilTime,
        availableFromTime: fromTime,
        availableUntilTime: untilTime,
      };
      const selectedCat = categories.find(c => c.id.toString() === formData.category_id.toString());
      if (!selectedCat) { alert('Please select a category for this product.'); setSaving(false); return; }
      if (selectedCat.type !== productMode) { alert('Selected category does not match the chosen product mode.'); setSaving(false); return; }
      if (isEdit) {
        if (product.category_id && formData.category_id && product.category_id.toString() !== formData.category_id.toString()) {
          const oldCat = categories.find(c => c.id.toString() === product.category_id.toString());
          const newCat = categories.find(c => c.id.toString() === formData.category_id.toString());
          if (oldCat && newCat && oldCat.type !== newCat.type) {
            if (!window.confirm(`Warning: You are moving this product from ${oldCat.type === 'fast_food' ? 'Fast Food' : 'Packed Items'} to ${newCat.type === 'fast_food' ? 'Fast Food' : 'Packed Items'}. Are you sure?`)) {
              setSaving(false);
              return;
            }
          }
        }
        await ProductsApi.update(product.id, payload);
        if (formData.image_id && formData.image_id !== product.image_id) {
          await ProductsApi.attachImage(product.id, formData.image_id);
        }
      } else {
        const created = await ProductsApi.create(payload);
        const productId = created.id || created.product?.id || created.data?.id;
        if (productId && formData.image_id) await ProductsApi.attachImage(productId, formData.image_id);
      }
      onSave();
    } catch (err) {
      console.error(err);
      setFormError(GENERIC_ERROR);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      setSaving(true);
      await ProductsApi.delete(product.id);
      onSave();
    } catch (err) {
      console.error(err);
      setFormError(GENERIC_ERROR);
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h3 className="drawer-title">{isEdit ? 'Edit Product' : 'New Product'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>
          <div className="drawer-body">
            {formError && <div className="error-container" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input required type="text" name="name" className="form-input" value={formData.name} onChange={handleChange} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Price (₹)</label>
                <input required type="number" min="0" step="0.01" name="price" className="form-input" value={formData.price} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Original Price (₹)</label>
                <input type="number" min="0" step="0.01" name="original_price" className="form-input" placeholder="Optional" value={formData.original_price || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Product Mode</label>
                <select required name="product_mode" className="form-select" value={productMode} onChange={handleModeChange}>
                  <option value="packed">Packed Items</option>
                  <option value="fast_food">Fast Food</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Category</label>
                <select required name="category_id" className="form-select" value={formData.category_id} onChange={handleChange}>
                  <option value="">Select {productMode === 'fast_food' ? 'Fast Food' : 'Packed Items'} Category</option>
                  {categories.filter(c => c.type === productMode).map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.type === 'fast_food' ? 'Fast Food' : 'Packed Items'})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Unit (e.g., 1 Plate)</label>
                <input type="text" name="unit" className="form-input" value={formData.unit || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea name="description" className="form-textarea" value={formData.description || ''} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label className="form-label">Product Image</label>
              <p className="image-dimension-hint">{IMAGE_GUIDANCE.product.label}</p>
              {(formData.image_url || formData.imageUrl) && <img src={normalizeImageUrl(formData.image_url || formData.imageUrl)} alt="Preview" className="image-preview" />}
              <div className="image-upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input type="file" hidden ref={fileInputRef} {...fileInputProps} accept="image/*" />
                {uploadingImage ? 'Uploading...' : 'Click to Upload Image'}
              </div>
              {uploadMessage && <p className={`upload-message ${uploadMessage.type}`}>{uploadMessage.text}</p>}
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Display Order</label>
                <input type="number" min="0" step="1" name="display_order" className="form-input" value={formData.display_order} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Discount Label (Optional)</label>
                <input type="text" name="discount_label" className="form-input" placeholder="e.g. 20% OFF" value={formData.discount_label || ''} onChange={handleChange} />
              </div>
            </div>
            <div className="form-row" style={{ marginTop: '1rem', gap: '2rem' }}>
              <label className="checkbox-label">
                <input type="checkbox" name="available" checked={formData.available} onChange={handleChange} />
                In Stock (Available)
              </label>
              <label className="checkbox-label">
                <input type="checkbox" name="featured" checked={formData.featured} onChange={handleChange} />
                Featured Product
              </label>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Daily availability window (optional)</label>
              <p className="form-hint" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0' }}>
                Restrict this product to a specific time of day. Leave both empty to make it available all day.
              </p>
              {(formData.available_from_time || formData.available_until_time) && (
                <div style={{
                  padding: '8px 12px',
                  borderRadius: 6,
                  marginBottom: 8,
                  fontSize: '0.8rem',
                  background: isWithinTimeWindow(formData.available_from_time, formData.available_until_time)
                    ? 'rgba(34, 197, 94, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid ' + (isWithinTimeWindow(formData.available_from_time, formData.available_until_time)
                    ? 'rgba(34, 197, 94, 0.3)'
                    : 'rgba(239, 68, 68, 0.3)'),
                  color: isWithinTimeWindow(formData.available_from_time, formData.available_until_time)
                    ? '#15803d'
                    : '#b91c1c',
                }}>
                  <strong>
                    {isWithinTimeWindow(formData.available_from_time, formData.available_until_time)
                      ? '✓ Customers can see this product right now'
                      : '✗ Customers cannot see this product right now'}
                  </strong>
                  <div style={{ marginTop: 2, opacity: 0.85 }}>
                    Window: {formatTimeWindow(formData.available_from_time, formData.available_until_time)}
                    {' · '}Server time: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </div>
                </div>
              )}
              <div className="form-row" style={{ alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem' }}>Available from</label>
                  <input
                    type="time"
                    name="available_from_time"
                    className="form-input"
                    value={formData.available_from_time || ''}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.85rem' }}>Available until</label>
                  <input
                    type="time"
                    name="available_until_time"
                    className="form-input"
                    value={formData.available_until_time || ''}
                    onChange={handleChange}
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ alignSelf: 'flex-end' }}
                  onClick={() => setFormData(prev => ({ ...prev, available_from_time: '', available_until_time: '' }))}
                  disabled={!formData.available_from_time && !formData.available_until_time}
                >
                  Clear window
                </button>
              </div>
            </div>
          </div>
          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>Delete Product</button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingImage}>{saving ? 'Saving...' : 'Save Product'}</button>
          </div>
        </form>
      </div>
      <ImageCropper {...cropperProps} />
    </div>
  );
}
