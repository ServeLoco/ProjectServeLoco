import React, { useState, useEffect, useRef } from 'react';
import { ProductsApi, CombosApi, ImagesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { getUploadedImage, normalizeImageUrl } from '../utils/imageUrl';
import './Products.css';

export default function Combos() {
  // Combos are bundles and do not require category.
  const [products, setProducts] = useState([]);
  const [comboProducts, setComboProducts] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [filters, setFilters] = useState({
    search: '',
    available: '',
    featured: '',
    store_type: 'packed',
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  useEffect(() => {
    fetchComboProducts();
  }, []);

  useEffect(() => {
    fetchProducts(1);
  }, [filters]);

  const readProducts = (res) => readList(res, ['products', 'combos']);

  const fetchComboProducts = async () => {
    try {
      // Fetch all products since combo form might need to validate cross-mode logic, or we filter in UI
      const res = await ProductsApi.list({ is_combo: '0', available: '1' });
      setComboProducts(readProducts(res));
    } catch (err) {
      console.error('Failed to load combo member products', err);
    }
  };

  const fetchProducts = async (page = 1) => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, limit: 20, ...filters };
      Object.keys(params).forEach(k => !params[k] && params[k] !== false && delete params[k]);

      const res = await CombosApi.list(params);
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
      await CombosApi.updateAvailability(product.id, newStatus);
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
      await Promise.all(selectedIds.map(id => CombosApi.updateAvailability(id, available)));
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
      await Promise.all(selectedIds.map(id => CombosApi.delete(id)));
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
        <h1 className="products-title">Combos Management</h1>
        <button className="btn-primary" onClick={openCreateDrawer}>
          + New Combo
        </button>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button 
          className={`btn-secondary ${filters.store_type === 'packed' ? 'active' : ''}`}
          style={filters.store_type === 'packed' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setFilters(prev => ({ ...prev, store_type: 'packed' }))}
        >
          Packed Items
        </button>
        <button 
          className={`btn-secondary ${filters.store_type === 'fast_food' ? 'active' : ''}`}
          style={filters.store_type === 'fast_food' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => setFilters(prev => ({ ...prev, store_type: 'fast_food' }))}
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
              <th>Combo</th>
              <th>Price</th>
              <th>Order</th>
              <th>Availability</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && products.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Loading combos...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>No combos found.</td></tr>
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
                        <span className="product-unit">
                          {p.unit || '1 plate'} {p.featured ? '• Featured' : ''}
                        </span>
                        <span className="product-unit">
                          {(p.combo_items || p.comboItems || []).length} included item(s)
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong style={{ color: 'var(--text-primary)' }}>₹{p.price}</strong>
                    {p.original_price && <div style={{ fontSize: '0.8rem', textDecoration: 'line-through', color: 'var(--text-secondary)' }}>₹{p.original_price}</div>}
                  </td>
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
          products={comboProducts}
          currentMode={filters.store_type}
          onClose={closeDrawer} 
          onSave={() => { closeDrawer(); fetchProducts(pagination.page); }}
        />
      )}
    </div>
  );
}

// Separate Component for the Drawer
function ProductFormDrawer({ product, products, onClose, onSave, currentMode }) {
  const isEdit = !!product;
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    original_price: '',
    unit: '',
    display_order: 0,
    available: true,
    featured: false,
    discount_label: '',
    image_id: '',
    image_url: '',
    ...(product || {}),
    store_type: product?.store_type || currentMode || 'packed',
  });
  const [comboItems, setComboItems] = useState(
    (product?.combo_items || product?.comboItems || []).map((item, index) => ({
      product_id: String(item.product_id || item.productId || item.id || ''),
      quantity: Number(item.quantity || 1),
      display_order: Number(item.display_order || item.displayOrder || index),
    }))
  );
  
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
      setUploadMessage({ type: 'success', text: 'Image uploaded. Save the combo to apply it.' });
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Image upload failed: ' + err.message });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const addComboItem = () => {
    setComboItems(prev => ([
      ...prev,
      { product_id: '', quantity: 1, display_order: prev.length },
    ]));
  };

  const updateComboItem = (index, field, value) => {
    setComboItems(prev => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const removeComboItem = (index) => {
    setComboItems(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    const selectedProductIds = new Set();
    const productById = new Map(products.map(item => [String(item.id), item]));
    for (const item of comboItems) {
      if (!item.product_id) continue;
      if (selectedProductIds.has(item.product_id)) {
        alert('This product is already in the combo. Increase quantity instead.');
        return;
      }
      selectedProductIds.add(item.product_id);
      const selectedProduct = productById.get(String(item.product_id));
      if (!selectedProduct) {
        alert('Please select a valid product for every combo item.');
        return;
      }
      if (selectedProduct.category_type !== formData.store_type) {
        alert(`${selectedProduct.name} belongs to ${selectedProduct.category_type}. It cannot be used in a ${formData.store_type} combo.`);
        return;
      }
    }
    if (selectedProductIds.size === 0) {
      alert('Please add at least one product to the combo.');
      return;
    }
    const price = Number(formData.price);
    const originalPrice = formData.original_price ? Number(formData.original_price) : null;
    if (!Number.isFinite(price) || price <= 0) {
      alert('Combo price must be positive.');
      return;
    }
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice < price)) {
      alert('Original price must be a valid amount and cannot be lower than selling price.');
      return;
    }

    try {
      setSaving(true);
      // Convert number strings
      const payload = {
        ...formData,
        price,
        original_price: originalPrice,
        display_order: Number(formData.display_order) || 0,
        combo_items: comboItems
          .filter(item => item.product_id)
          .map((item, index) => ({
            product_id: Number(item.product_id),
            productId: Number(item.product_id),
            quantity: Number(item.quantity) || 1,
            display_order: index,
          })),
        comboItems: comboItems
          .filter(item => item.product_id)
          .map((item, index) => ({
            productId: Number(item.product_id),
            quantity: Number(item.quantity) || 1,
            displayOrder: index,
          })),
        imageId: formData.image_id,
        image_id: formData.image_id,
      };

      if (isEdit) {
        if (product.store_type && formData.store_type && product.store_type !== formData.store_type) {
          if (!window.confirm(`Warning: You are moving this combo from ${product.store_type} to ${formData.store_type}. Some member products might become invalid. Are you sure?`)) {
            setSaving(false);
            return;
          }
        }
        await CombosApi.update(product.id, payload);
      } else {
        await CombosApi.create(payload);
      }
      onSave();
    } catch (err) {
      alert('Failed to save combo: ' + err.message);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this product?')) return;
    try {
      setSaving(true);
      await CombosApi.delete(product.id);
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
            <h3 className="drawer-title">{isEdit ? 'Edit Combo' : 'New Combo'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="drawer-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Combo Name</label>
                <input required type="text" name="name" className="form-input" value={formData.name} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Combo Mode</label>
                <select required name="store_type" className="form-select" value={formData.store_type} onChange={handleChange}>
                  <option value="packed">Packed Items</option>
                  <option value="fast_food">Fast Food</option>
                </select>
              </div>
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
                <label className="form-label">Unit (e.g., 1 Plate)</label>
                <input type="text" name="unit" className="form-input" value={formData.unit || ''} onChange={handleChange} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea name="description" className="form-textarea" value={formData.description || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                <label className="form-label" style={{ margin: 0 }}>Combo Items</label>
                <button type="button" className="btn-secondary" onClick={addComboItem}>
                  + Add Item
                </button>
              </div>
              <p style={{ margin: '0.35rem 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                This combo is sold as one bundle line in the customer cart and order history.
              </p>

              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {comboItems.length === 0 && (
                  <div style={{
                    padding: '0.85rem',
                    border: '1px dashed var(--border-color)',
                    borderRadius: '8px',
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-color)',
                  }}>
                    No products inside this combo yet.
                  </div>
                )}

                {comboItems.map((item, index) => (
                  <div
                    key={`${item.product_id}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 90px auto',
                      gap: '0.75rem',
                      alignItems: 'center',
                    }}
                  >
                    <select
                      className="form-select"
                      value={item.product_id}
                      onChange={(e) => updateComboItem(index, 'product_id', e.target.value)}
                    >
                      <option value="">Select product</option>
                      {products.filter(p => p.category_type === formData.store_type).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateComboItem(index, 'quantity', e.target.value)}
                    />
                    <button
                      type="button"
                      className="action-link danger"
                      onClick={() => removeComboItem(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Combo Image</label>
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
          </div>

          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete Combo
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingImage}>
              {saving ? 'Saving...' : 'Save Combo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
