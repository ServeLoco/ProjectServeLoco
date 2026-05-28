import React, { useState, useEffect, useRef } from 'react';
import { CategoriesApi, ImagesApi } from '../api';
import { readList } from '../utils/apiResponse';
import { getUploadedImage, normalizeImageUrl } from '../utils/imageUrl';
import { IMAGE_GUIDANCE } from '../utils/imageGuidance';
import './Categories.css';

export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await CategoriesApi.list();
      setCategories(readList(res, ['categories']));
    } catch (err) {
      setError(err.message || 'Failed to fetch categories');
    } finally {
      setLoading(false);
    }
  };

  const openCreateDrawer = () => {
    setEditingCategory(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (category) => {
    setEditingCategory(category);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingCategory(null);
  };

  const toggleActive = async (category) => {
    try {
      await CategoriesApi.update(category.id, {
        name: category.name,
        slug: category.slug,
        type: category.type,
        imageId: category.image_id,
        image_id: category.image_id,
        active: !category.active,
        displayOrder: category.display_order,
        display_order: category.display_order,
      });
      fetchCategories();
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  return (
    <div className="categories-container">
      <header className="categories-header">
        <h1 className="categories-title">Categories Management</h1>
        <button className="btn-primary" onClick={openCreateDrawer}>
          + New Category
        </button>
      </header>

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      <section className="categories-table-wrapper">
        <table className="categories-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th>Order</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && categories.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Loading categories...</td></tr>
            ) : categories.length === 0 ? (
              <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No categories found.</td></tr>
            ) : (
              categories.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="category-info">
                      <img src={normalizeImageUrl(c.imageUrl || c.image_url) || 'https://via.placeholder.com/48'} alt={c.name} className="category-thumbnail" />
                      <div>
                        <span className="category-name">{c.name}</span>
                        <span className="category-slug">/{c.slug}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`category-type ${c.type === 'fast_food' ? 'fast-food' : ''}`}>
                      {c.type === 'fast_food' ? 'Fast Food' : c.type === 'packed' ? 'Packed Items' : c.type}
                    </span>
                  </td>
                  <td>{c.display_order}</td>
                  <td>
                    <button 
                      className={`availability-toggle ${c.active ? 'in-stock' : 'out-of-stock'}`}
                      onClick={() => toggleActive(c)}
                    >
                      {c.active ? 'Active' : 'Hidden'}
                    </button>
                  </td>
                  <td>
                    <button className="action-link" onClick={() => openEditDrawer(c)}>Edit</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      {drawerOpen && (
        <CategoryFormDrawer 
          category={editingCategory} 
          onClose={closeDrawer} 
          onSave={() => { closeDrawer(); fetchCategories(); }}
        />
      )}
    </div>
  );
}

function CategoryFormDrawer({ category, onClose, onSave }) {
  const isEdit = !!category;
  const [formData, setFormData] = useState(category || {
    name: '',
    slug: '',
    description: '',
    type: 'packed',
    display_order: 0,
    active: true,
    image_id: '',
    image_url: ''
  });
  
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
  const fileInputRef = useRef(null);

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => {
      const updates = { [name]: type === 'checkbox' ? checked : value };
      // Auto-generate slug if name changes and we're creating
      if (name === 'name' && !isEdit && !prev.slug_manually_edited) {
        updates.slug = generateSlug(value);
      }
      if (name === 'slug') {
        updates.slug_manually_edited = true;
      }
      return { ...prev, ...updates };
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
      setUploadMessage({ type: 'success', text: 'Image uploaded. Save the category to apply it.' });
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
      setFormError(null);
      setSaving(true);
      const payload = {
        ...formData,
        display_order: Number(formData.display_order) || 0,
        displayOrder: Number(formData.display_order) || 0,
        imageId: formData.image_id,
        image_id: formData.image_id,
      };

      if (isEdit) {
        await CategoriesApi.update(category.id, payload);
      } else {
        await CategoriesApi.create(payload);
      }
      onSave();
    } catch (err) {
      setFormError('Failed to save category: ' + (err.response?.data?.message || err.message));
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this category? This will fail if products are still assigned to it.')) return;
    try {
      setFormError(null);
      setSaving(true);
      await CategoriesApi.delete(category.id);
      onSave();
    } catch (err) {
      setFormError('Delete failed (likely products exist): ' + (err.response?.data?.message || err.message));
      setSaving(false);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="drawer-header">
            <h3 className="drawer-title">{isEdit ? 'Edit Category' : 'New Category'}</h3>
            <button type="button" className="drawer-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="drawer-body">
            {formError && <div className="error-container" style={{ marginBottom: '1rem' }}>{formError}</div>}
            <div className="form-group">
              <label className="form-label">Category Name</label>
              <input required type="text" name="name" className="form-input" value={formData.name} onChange={handleChange} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Slug (URL friendly)</label>
                <input required type="text" name="slug" className="form-input" value={formData.slug} onChange={handleChange} />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select required name="type" className="form-select" value={formData.type} onChange={handleChange}>
                  <option value="packed">Packed Items</option>
                  <option value="fast_food">Fast Food</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <textarea name="description" className="form-textarea" value={formData.description || ''} onChange={handleChange} />
            </div>

            <div className="form-group">
              <label className="form-label">Category Image</label>
              <p className="image-dimension-hint">{IMAGE_GUIDANCE.category.label}</p>
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
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '0.75rem' }}>
                <label className="checkbox-label">
                  <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} />
                  Active / Visible
                </label>
              </div>
            </div>
          </div>

          <div className="drawer-footer">
            {isEdit && (
              <button type="button" className="action-link danger" onClick={handleDelete} disabled={saving} style={{ marginRight: 'auto' }}>
                Delete
              </button>
            )}
            <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={saving || uploadingImage}>
              {saving ? 'Saving...' : 'Save Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
