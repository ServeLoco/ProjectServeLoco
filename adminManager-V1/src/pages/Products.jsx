import React, { useState, useEffect, useRef } from 'react';
import { ProductsApi, CategoriesApi, ImagesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { getUploadedImage, normalizeImageUrl } from '../utils/imageUrl';
import './Products.css';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Normal products require category. Combos are bundles and do not require category.
  const [filters, setFilters] = useState({
    search: '',
    category_id: '',
    available: '',
    featured: '',
    is_combo: '0', // Default to normal products
    type: 'packed'
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchProducts(1);
  }, [filters]);

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
      if (res.pagination) {
        setPagination(res.pagination);
      }
      setSelectedIds([]); // clear selection on page change
    } catch (err) {
      setError(err.message || 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === products.length) setSelectedIds([]);
    else setSelectedIds(products.map(p => p.id));
  };

  const toggleAvailability = async (product) => {
    const newStatus = !product.available;
    try {
      await ProductsApi.updateAvailability(product.id, newStatus);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, available: newStatus } : p));
    } catch (err) {
      alert('Failed to update availability: ' + err.message);
    }
  };

  // Bulk Actions
  const handleBulkAvailability = async (available) => {
    if (!window.confirm(`Mark ${selectedIds.length} products as ${available ? 'In Stock' : 'Out of Stock'}?`)) return;
    setBulkUpdating(true);
    try {
      await Promise.all(selectedIds.map(id => ProductsApi.updateAvailability(id, available)));
      fetchProducts(pagination.page);
    } catch (err) {
      alert('Error updating some products: ' + err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} products?`)) return;
    setBulkUpdating(true);
    try {
      await Promise.all(selectedIds.map(id => ProductsApi.delete(id)));
      fetchProducts(1);
    } catch (err) {
      alert('Error deleting some products: ' + err.message);
    } finally {
      setBulkUpdating(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingProduct(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (product) => {
    setEditingProduct(product);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="products-container">
      <header className="products-header">
        <h1 className="products-title">Products Management</h1>
        <button className="btn-primary" onClick={openCreateDrawer}>
          + New Product
        </button>
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
          type="text"
          name="search"
          placeholder="Search product name..."
          className="filter-input filter-search"
          value={filters.search}
          onChange={handleFilterChange}
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
            <button className="btn-secondary" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }} disabled={bulkUpdating} onClick={handleBulkDelete}>Delete</button>
          </div>
        </div>
      )}

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
          <button 
            className="btn-secondary" 
            disabled={pagination.page <= 1 || loading}
            onClick={() => fetchProducts(pagination.page - 1)}
          >
            Previous
          </button>
          <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <button 
            className="btn-secondary" 
            disabled={pagination.page >= pagination.totalPages || loading}
            onClick={() => fetchProducts(pagination.page + 1)}
          >
            Next
          </button>
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

// Separate Component for the Drawer
function ProductFormDrawer({ product, categories, currentMode, onClose, onSave }) {
  const isEdit = !!product;
  const initialMode = product?.category_type || categories.find(c => String(c.id) === String(product?.category_id))?.type || currentMode || 'packed';
  const [productMode, setProductMode] = useState(initialMode);
  const [formData, setFormData] = useState(product || {
    name: '',
    description: '',
    price: '',
    original_price: '',
    unit: '',
    category_id: '',
    display_order: 0,
    available: true,
    featured: false,
    discount_label: '',
    image_id: '',
    image_url: ''
  });
  
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const fileInputRef = useRef(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleModeChange = (e) => {
    const nextMode = e.target.value;
    setProductMode(nextMode);
    setFormData(prev => {
      const selectedCategory = categories.find(c => String(c.id) === String(prev.category_id));
      return {
        ...prev,
        category_id: selectedCategory?.type === nextMode ? prev.category_id : '',
      };
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('image', file);

    try {
      setUploadingImage(true);
      setUploadMessage(null);
      const res = await ImagesApi.upload(data);
      const image = getUploadedImage(res);
      setFormData(prev => ({
        ...prev,
        image_id: image.id,
        image_url: image.url,
      }));
      setUploadMessage({ type: 'success', text: 'Image uploaded. Save the product to apply it.' });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Image upload failed: ' + err.message });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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

      // Convert number strings
      const payload = {
        ...formData,
        price,
        original_price: originalPrice,
        display_order: Number(formData.display_order) || 0,
        imageId: formData.image_id,
        image_id: formData.image_id,
      };

      const selectedCat = categories.find(c => c.id.toString() === formData.category_id.toString());
      if (!selectedCat) {
        alert('Please select a category for this product.');
        setSaving(false);
        return;
      }
      if (selectedCat.type !== productMode) {
        alert('Selected category does not match the chosen product mode.');
        setSaving(false);
        return;
      }

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
        if (productId && formData.image_id) {
          await ProductsApi.attachImage(productId, formData.image_id);
        }
      }
      onSave();
    } catch (err) {
      alert('Failed to save product: ' + err.message);
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
      alert('Delete failed: ' + err.message);
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
            <div className="form-group">
              <label className="form-label">Product Name</label>
              <input required type="text" name="name" className="form-input" value={formData.name} onChange={handleChange} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Price (₹)</label>
                <input required type="number" min="0" step="1" name="price" className="form-input" value={formData.price} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Original Price (₹)</label>
                <input type="number" min="0" step="1" name="original_price" className="form-input" placeholder="Optional" value={formData.original_price || ''} onChange={handleChange} />
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
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.type === 'fast_food' ? 'Fast Food' : 'Packed Items'})
                    </option>
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
              {(formData.image_url || formData.imageUrl) && <img src={normalizeImageUrl(formData.image_url || formData.imageUrl)} alt="Preview" className="image-preview" />}
              <div className="image-upload-zone" onClick={() => fileInputRef.current?.click()}>
                <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
                {uploadingImage ? 'Uploading...' : 'Click to Upload Image'}
              </div>
              {uploadMessage && (
                <p className={`upload-message ${uploadMessage.type}`}>{uploadMessage.text}</p>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Display Order</label>
                <input type="number" name="display_order" className="form-input" value={formData.display_order} onChange={handleChange} />
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
          </div>

          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete Product
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingImage}>
              {saving ? 'Saving...' : 'Save Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
