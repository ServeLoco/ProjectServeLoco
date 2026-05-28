// MobileDashboard.jsx
import React, { useState, useEffect } from 'react';
import { MobileDashboardApi, ProductsApi, CategoriesApi, OffersApi, CombosApi } from '../api';
import './MobileDashboard.css';

import { readList } from '../utils/apiResponse';
import { normalizeImageUrl } from '../utils/imageUrl';

export default function MobileDashboard() {
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [storeType, setStoreType] = useState('packed');
  
  // Loading states
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingSection, setSavingSection] = useState(false);
  const [savingItem, setSavingItem] = useState(false);
  const [error, setError] = useState(null);

  // New section modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSectionForm, setNewSectionForm] = useState({
    title: '',
    slug: '',
    section_type: 'product_block',
    store_type: storeType,
    active: 1,
    display_order: 0,
    max_visible_items: 6,
    show_see_all: 1,
    linked_category_id: '',
    linked_offer_id: '',
    starts_at: '',
    ends_at: ''
  });

  // Edit section properties form
  const [editForm, setEditForm] = useState(null);

  // Item picker states
  const [candidates, setCandidates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  useEffect(() => {
    fetchSections();
    setNewSectionForm(prev => ({ ...prev, store_type: storeType }));
  }, [storeType]);

  useEffect(() => {
    if (selectedSection) {
      loadCandidates(selectedSection.section_type);
    } else {
      setCandidates([]);
    }
    setSearchQuery('');
  }, [selectedSection?.id, selectedSection?.section_type]);

  const fetchSections = async () => {
    try {
      setLoadingSections(true);
      setError(null);
      const res = await MobileDashboardApi.listSections({ store_type: storeType });
      setSections(res.data || []);
    } catch (err) {
      setError(err.message || 'Failed to fetch dashboard sections');
    } finally {
      setLoadingSections(false);
    }
  };

  const fetchSectionDetail = async (id) => {
    try {
      setLoadingDetail(true);
      setError(null);
      const res = await MobileDashboardApi.getSection(id);
      const section = res.data;
      setSelectedSection(section);
      
      // Initialize edit form
      setEditForm({
        title: section.title,
        slug: section.slug,
        store_type: section.store_type || 'all',
        active: section.active === 1 || section.active === true ? 1 : 0,
        display_order: section.display_order || 0,
        max_visible_items: section.max_visible_items !== undefined ? section.max_visible_items : 6,
        show_see_all: section.show_see_all === 1 || section.show_see_all === true ? 1 : 0,
        linked_category_id: section.linked_category_id || '',
        linked_offer_id: section.linked_offer_id || '',
        starts_at: formatDateToLocalInput(section.starts_at),
        ends_at: formatDateToLocalInput(section.ends_at),
        version: section.version
      });
    } catch (err) {
      setError(err.message || 'Failed to load section details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const loadCandidates = async (sectionType) => {
    try {
      setLoadingCandidates(true);
      if (sectionType === 'offer_banner') {
        const res = await OffersApi.list({ store_type: storeType });
        setCandidates(readList(res, 'offers'));
      } else if (sectionType === 'category_grid') {
        const res = await CategoriesApi.list({ type: storeType });
        setCandidates(readList(res, 'categories'));
      } else if (sectionType === 'product_block') {
        // Load only non-combos
        const res = await ProductsApi.list({ limit: 100, is_combo: '0', available: '1', type: storeType });
        setCandidates(readList(res, 'products'));
      } else if (sectionType === 'combo_block') {
        // Load only combos
        const res = await CombosApi.list({ limit: 100, available: '1', store_type: storeType });
        setCandidates(readList(res, ['products', 'combos']));
      }
    } catch (err) {
      console.error('Failed to load candidate items', err);
    } finally {
      setLoadingCandidates(false);
    }
  };

  const formatDateToLocalInput = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  const generateSlug = (name) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  const handleModalFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setNewSectionForm(prev => {
      const val = type === 'checkbox' ? (checked ? 1 : 0) : value;
      const updates = { [name]: val };
      if (name === 'title' && !prev.slug_manually_edited) {
        updates.slug = generateSlug(value);
      }
      if (name === 'slug') {
        updates.slug_manually_edited = true;
      }
      return { ...prev, ...updates };
    });
  };

  const handleEditFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value
    }));
  };

  const handleCreateSection = async (e) => {
    e.preventDefault();
    try {
      setSavingSection(true);
      setError(null);
      
      const payload = {
        ...newSectionForm,
        active: Number(newSectionForm.active),
        display_order: Number(newSectionForm.display_order),
        max_visible_items: Number(newSectionForm.max_visible_items),
        show_see_all: Number(newSectionForm.show_see_all),
        linked_category_id: newSectionForm.linked_category_id ? Number(newSectionForm.linked_category_id) : null,
        linked_offer_id: newSectionForm.linked_offer_id ? Number(newSectionForm.linked_offer_id) : null,
        starts_at: newSectionForm.starts_at || null,
        ends_at: newSectionForm.ends_at || null
      };

      await MobileDashboardApi.createSection(payload);
      setIsModalOpen(false);
      
      // Reset form
      setNewSectionForm({
        title: '',
        slug: '',
        section_type: 'product_block',
        store_type: storeType,
        active: 1,
        display_order: 0,
        max_visible_items: 6,
        show_see_all: 1,
        linked_category_id: '',
        linked_offer_id: '',
        starts_at: '',
        ends_at: ''
      });

      await fetchSections();
    } catch (err) {
      setError(err.message || 'Failed to create section');
    } finally {
      setSavingSection(false);
    }
  };

  const handleUpdateSection = async (e) => {
    e.preventDefault();
    if (!selectedSection) return;
    try {
      setSavingSection(true);
      setError(null);
      
      const payload = {
        ...editForm,
        active: Number(editForm.active),
        display_order: Number(editForm.display_order),
        max_visible_items: Number(editForm.max_visible_items),
        show_see_all: Number(editForm.show_see_all),
        linked_category_id: editForm.linked_category_id ? Number(editForm.linked_category_id) : null,
        linked_offer_id: editForm.linked_offer_id ? Number(editForm.linked_offer_id) : null,
        starts_at: editForm.starts_at || null,
        ends_at: editForm.ends_at || null
      };

      const res = await MobileDashboardApi.updateSection(selectedSection.id, payload);
      alert('Section updated successfully');
      
      // Refresh section detail to get next version
      await fetchSectionDetail(selectedSection.id);
      await fetchSections();
    } catch (err) {
      setError(err.message || 'Failed to update section');
    } finally {
      setSavingSection(false);
    }
  };

  const handleDeleteSection = async () => {
    if (!selectedSection) return;
    if (!window.confirm('Are you sure you want to delete this section? This will soft-delete the layout configuration.')) return;
    try {
      setSavingSection(true);
      setError(null);
      await MobileDashboardApi.deleteSection(selectedSection.id);
      setSelectedSection(null);
      setEditForm(null);
      await fetchSections();
    } catch (err) {
      setError(err.message || 'Failed to delete section');
    } finally {
      setSavingSection(false);
    }
  };

  const handleMoveSection = async (index, direction) => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sections.length - 1) return;

    const newSections = [...sections];
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    
    // Swap elements
    const temp = newSections[index];
    newSections[index] = newSections[swapWith];
    newSections[swapWith] = temp;

    // Call reorder API
    try {
      const sectionIds = newSections.map(s => s.id);
      await MobileDashboardApi.reorderSections(sectionIds, { store_type: storeType });
      setSections(newSections);
    } catch (err) {
      alert('Failed to reorder: ' + err.message);
      fetchSections();
    }
  };

  const handleAddItem = async (itemId) => {
    if (!selectedSection) return;
    try {
      setSavingItem(true);
      setError(null);

      const sectionTypeToItemType = {
        offer_banner: 'offer',
        category_grid: 'category',
        product_block: 'product',
        combo_block: 'combo'
      };

      const itemType = sectionTypeToItemType[selectedSection.section_type];
      
      // Calculate display order as max + 1
      const currentItems = selectedSection.items || [];
      const nextOrder = currentItems.length > 0 
        ? Math.max(...currentItems.map(item => item.display_order || 0)) + 1 
        : 0;

      await MobileDashboardApi.addSectionItem(selectedSection.id, {
        item_type: itemType,
        item_id: itemId,
        display_order: nextOrder,
        active: 1
      });

      // Reload section items
      await fetchSectionDetail(selectedSection.id);
    } catch (err) {
      alert('Failed to add item: ' + err.message);
    } finally {
      setSavingItem(false);
    }
  };

  const handleRemoveItem = async (sectionItemId) => {
    if (!selectedSection) return;
    if (!window.confirm('Remove this item from the section?')) return;
    try {
      setSavingItem(true);
      setError(null);
      await MobileDashboardApi.deleteSectionItem(selectedSection.id, sectionItemId);
      await fetchSectionDetail(selectedSection.id);
    } catch (err) {
      alert('Failed to remove item: ' + err.message);
    } finally {
      setSavingItem(false);
    }
  };

  const handleMoveItem = async (index, direction) => {
    if (!selectedSection) return;
    const items = selectedSection.items || [];
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === items.length - 1) return;

    const newItems = [...items];
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    
    const temp = newItems[index];
    newItems[index] = newItems[swapWith];
    newItems[swapWith] = temp;

    try {
      const itemIds = newItems.map(item => item.id);
      await MobileDashboardApi.reorderSectionItems(selectedSection.id, itemIds);
      // Optimistically update locally or reload
      setSelectedSection(prev => ({
        ...prev,
        items: newItems
      }));
    } catch (err) {
      alert('Failed to reorder items: ' + err.message);
      fetchSectionDetail(selectedSection.id);
    }
  };

  const getFilteredCandidates = () => {
    if (!searchQuery.trim()) return candidates;
    const query = searchQuery.toLowerCase();
    return candidates.filter(item => {
      const name = item.name || item.title || '';
      return name.toLowerCase().includes(query);
    });
  };

  return (
    <div className="dashboard-workspace">
      {/* Left Panel: Section Selector */}
      <aside className="sections-panel">
        <header className="panel-header">
          <h2 className="panel-title">Layout Sections</h2>
          <button className="btn-add-section" onClick={() => setIsModalOpen(true)}>
            + Add Section
          </button>
        </header>

        <div style={{ display: 'flex', gap: '0.5rem', padding: '0 1rem', marginBottom: '1rem' }}>
        <button 
          className={`btn-secondary ${storeType === 'packed' ? 'active' : ''}`}
          style={storeType === 'packed' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => {
            setStoreType('packed');
            setSelectedSection(null);
            setEditForm(null);
          }}
        >
          Packed Items Layout
        </button>
        <button 
          className={`btn-secondary ${storeType === 'fast_food' ? 'active' : ''}`}
          style={storeType === 'fast_food' ? { background: 'var(--primary-color)', color: 'white', borderColor: 'var(--primary-color)' } : {}}
          onClick={() => {
            setStoreType('fast_food');
            setSelectedSection(null);
            setEditForm(null);
          }}
        >
          Fast Food Layout
        </button>
      </div>

        <div className="sections-list-container">
          {loadingSections && sections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>Loading layout...</div>
          ) : sections.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              No layout sections configured.
            </div>
          ) : (
            sections.map((sec, index) => (
              <div 
                key={sec.id} 
                className={`section-card ${selectedSection?.id === sec.id ? 'selected' : ''}`}
                onClick={() => fetchSectionDetail(sec.id)}
              >
                <div className="section-reorder-controls" onClick={e => e.stopPropagation()}>
                  <button 
                    className="btn-order-arrow" 
                    disabled={index === 0} 
                    onClick={() => handleMoveSection(index, 'up')}
                  >
                    ▲
                  </button>
                  <button 
                    className="btn-order-arrow" 
                    disabled={index === sections.length - 1} 
                    onClick={() => handleMoveSection(index, 'down')}
                  >
                    ▼
                  </button>
                </div>
                <div className="section-meta-info">
                  <span className="section-card-title">{sec.title}</span>
                  <div className="section-card-badges">
                    <span className="badge badge-type">{sec.section_type.replace('_', ' ')}</span>
                    <span className="badge badge-store">{sec.store_type}</span>
                    <span className={`badge ${sec.active ? 'badge-status-active' : 'badge-status-hidden'}`}>
                      {sec.active ? 'Active' : 'Hidden'}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Right Panel: Selected Section Details & Workspace */}
      <section className="detail-panel">
        {selectedSection && editForm ? (
          <>
            <header className="detail-header-bar">
              <h2 className="detail-title">{selectedSection.title} Details</h2>
              <button 
                className="btn-danger" 
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                onClick={handleDeleteSection}
                disabled={savingSection}
              >
                Delete Section
              </button>
            </header>

            <div className="detail-body-container">
              {/* Properties Form */}
              <form onSubmit={handleUpdateSection} className="form-section">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  Section Properties
                </h3>
                
                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Section Title</label>
                    <input 
                      type="text" 
                      name="title" 
                      required 
                      className="form-input" 
                      value={editForm.title} 
                      onChange={handleEditFormChange} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Slug</label>
                    <input 
                      type="text" 
                      name="slug" 
                      required 
                      className="form-input" 
                      value={editForm.slug} 
                      onChange={handleEditFormChange} 
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Store Visibility</label>
                    <select 
                      name="store_type" 
                      className="form-select" 
                      value={editForm.store_type} 
                      onChange={handleEditFormChange}
                    >
                      <option value="packed">Packed Items Only</option>
                      <option value="fast_food">Fast Food Only</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Max Display Items</label>
                    <input 
                      type="number" 
                      name="max_visible_items" 
                      min="1" 
                      className="form-input" 
                      value={editForm.max_visible_items} 
                      onChange={handleEditFormChange} 
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Scheduled Start Time</label>
                    <input 
                      type="datetime-local" 
                      name="starts_at" 
                      className="form-input" 
                      value={editForm.starts_at} 
                      onChange={handleEditFormChange} 
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Scheduled End Time</label>
                    <input 
                      type="datetime-local" 
                      name="ends_at" 
                      className="form-input" 
                      value={editForm.ends_at} 
                      onChange={handleEditFormChange} 
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', marginTop: '0.25rem' }}>
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      name="active" 
                      checked={editForm.active === 1} 
                      onChange={e => handleEditFormChange({ target: { name: 'active', checked: e.target.checked, type: 'checkbox' } })} 
                    />
                    Active (Visible on Dashboard)
                  </label>
                  
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      name="show_see_all" 
                      checked={editForm.show_see_all === 1} 
                      onChange={e => handleEditFormChange({ target: { name: 'show_see_all', checked: e.target.checked, type: 'checkbox' } })} 
                    />
                    Show "See All" button
                  </label>
                </div>

                <div className="form-actions-row">
                  <button type="submit" className="btn-primary" disabled={savingSection}>
                    {savingSection ? 'Saving...' : 'Save Properties'}
                  </button>
                </div>
              </form>

              {/* Items Management */}
              <div className="section-items-workspace">
                <h3 style={{ fontSize: '1rem', fontWeight: 600, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  Assigned Items ({selectedSection.items?.length || 0})
                </h3>

                <div className="items-list">
                  {selectedSection.items?.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      No items currently assigned to this section. Use the selector below to add them.
                    </div>
                  ) : (
                    selectedSection.items?.map((item, idx) => {
                      const details = item.details || {};
                      const name = details.name || details.title || `Item #${item.item_id}`;
                      const img = normalizeImageUrl(details.imageUrl || details.image_url) || 'https://via.placeholder.com/40';
                      return (
                        <div key={item.id} className="item-row">
                          <img src={img} alt={name} className="item-thumbnail" />
                          <div className="item-details">
                            <div className="item-title-name">{name}</div>
                            <div className="item-subtitle-meta">
                              {item.item_type} • ID: {item.item_id}
                              {details.price && ` • ₹${details.price}`}
                              {(details.store_type || details.type) && ` • ${(details.store_type || details.type) === 'fast_food' ? 'Fast Food' : 'Packed'}`}
                            </div>
                          </div>
                          <div className="item-action-controls">
                            <button 
                              className="btn-order-arrow" 
                              disabled={idx === 0} 
                              onClick={() => handleMoveItem(idx, 'up')}
                            >
                              ▲
                            </button>
                            <button 
                              className="btn-order-arrow" 
                              disabled={idx === selectedSection.items.length - 1} 
                              onClick={() => handleMoveItem(idx, 'down')}
                            >
                              ▼
                            </button>
                            <button 
                              className="btn-remove-item"
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={savingItem}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Add Items Picker */}
              <div className="add-items-picker">
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Assign New Item</h4>
                <div className="picker-search-bar">
                  <input 
                    type="text" 
                    placeholder="Search available candidates..." 
                    className="form-input" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="picker-results">
                  {loadingCandidates ? (
                    <div style={{ padding: '1rem', textAlign: 'center' }}>Loading candidates...</div>
                  ) : getFilteredCandidates().length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      No items found.
                    </div>
                  ) : (
                    getFilteredCandidates()
                      .filter(cand => {
                        // Exclude items already in this section
                        return !selectedSection.items?.some(i => i.item_id === cand.id);
                      })
                      .map(cand => {
                        const name = cand.name || cand.title || 'Unnamed';
                        const img = normalizeImageUrl(cand.imageUrl || cand.image_url) || 'https://via.placeholder.com/40';
                        return (
                          <div key={cand.id} className="picker-result-row">
                            <img src={img} alt={name} className="item-thumbnail" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="item-title-name">{name}</div>
                              <div className="item-subtitle-meta">
                                ID: {cand.id} {cand.price && `• ₹${cand.price}`} {cand.store_type && `• ${cand.store_type === 'fast_food' ? 'Fast Food' : 'Packed'}`} {cand.type && `• ${cand.type === 'fast_food' ? 'Fast Food' : 'Packed'}`}
                              </div>
                            </div>
                            <button 
                              type="button" 
                              className="btn-primary btn-add-item-action"
                              onClick={() => handleAddItem(cand.id)}
                              disabled={savingItem}
                            >
                              + Add
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

            </div>
          </>
        ) : (
          <div className="detail-empty-state">
            <span className="empty-state-icon">📱</span>
            <h2>Mobile Layout Editor</h2>
            <p>Select any section from the list to manage its visibility, timing, settings, and layout items.</p>
          </div>
        )}
      </section>

      {/* Add Section Modal */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleCreateSection}>
              <header className="modal-header">
                <h3 className="modal-title">New Dashboard Section</h3>
                <button type="button" style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem' }} onClick={() => setIsModalOpen(false)}>&times;</button>
              </header>

              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Section Title</label>
                  <input 
                    type="text" 
                    name="title" 
                    required 
                    placeholder="e.g. Milk Products, Daily Banners" 
                    className="form-input" 
                    value={newSectionForm.title} 
                    onChange={handleModalFormChange} 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Slug (URL friendly)</label>
                  <input 
                    type="text" 
                    name="slug" 
                    required 
                    className="form-input" 
                    value={newSectionForm.slug} 
                    onChange={handleModalFormChange} 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Section Type</label>
                  <select 
                    name="section_type" 
                    className="form-select" 
                    value={newSectionForm.section_type} 
                    onChange={handleModalFormChange}
                  >
                    <option value="offer_banner">Offer Banner</option>
                    <option value="category_grid">Category Grid</option>
                    <option value="product_block">Product Block</option>
                    <option value="combo_block">Combo Block</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Store Visibility</label>
                  <select 
                    name="store_type" 
                    className="form-select" 
                    value={newSectionForm.store_type} 
                    onChange={handleModalFormChange}
                  >
                    <option value="packed">Packed Items Only</option>
                    <option value="fast_food">Fast Food Only</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Max Visible Items</label>
                  <input 
                    type="number" 
                    name="max_visible_items" 
                    min="1" 
                    className="form-input" 
                    value={newSectionForm.max_visible_items} 
                    onChange={handleModalFormChange} 
                  />
                </div>

                <div className="form-group">
                  <label className="form-label font-medium">Scheduled Visibility (Optional)</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.25rem' }}>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Starts At</span>
                      <input 
                        type="datetime-local" 
                        name="starts_at" 
                        className="form-input" 
                        value={newSectionForm.starts_at} 
                        onChange={handleModalFormChange} 
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ends At</span>
                      <input 
                        type="datetime-local" 
                        name="ends_at" 
                        className="form-input" 
                        value={newSectionForm.ends_at} 
                        onChange={handleModalFormChange} 
                      />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '2rem', marginTop: '0.5rem' }}>
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      name="active" 
                      checked={newSectionForm.active === 1} 
                      onChange={e => handleModalFormChange({ target: { name: 'active', checked: e.target.checked, type: 'checkbox' } })} 
                    />
                    Active Immediately
                  </label>
                  <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      name="show_see_all" 
                      checked={newSectionForm.show_see_all === 1} 
                      onChange={e => handleModalFormChange({ target: { name: 'show_see_all', checked: e.target.checked, type: 'checkbox' } })} 
                    />
                    Show "See All"
                  </label>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={savingSection}>
                  {savingSection ? 'Creating...' : 'Create Section'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
