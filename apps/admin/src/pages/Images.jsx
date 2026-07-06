import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ImagesApi } from '../api';
import { normalizeImageUrl } from '../utils/imageUrl';
import { IMAGE_GUIDANCE } from '../utils/imageGuidance';
import { getImageUploadError } from '../utils/fileValidation';
import { useImageCropper } from '../hooks/useImageCropper';
import ImageCropper from '../components/ImageCropper/ImageCropper';
import './Images.css';

import { GENERIC_ERROR } from '../utils/constants';

export default function Images() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnusedOnly, setShowUnusedOnly] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchImages();
  }, []);

  const fetchImages = async () => {
    try {
      setLoading(true);
      const res = await ImagesApi.list();
      setImages(res.data || []);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || err?.message || GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  };

  const uploadImageFile = async (file) => {
    const sizeError = getImageUploadError(file);
    if (sizeError) {
      setUploadMessage({ type: 'error', text: sizeError });
      return;
    }

    const data = new FormData();
    data.append('image', file);

    try {
      setUploading(true);
      setUploadMessage(null);
      await ImagesApi.upload(data);
      setUploadMessage({ type: 'success', text: 'Image uploaded successfully.' });
      fetchImages();
    } catch (err) {
      console.error(err);
      setUploadMessage({ type: 'error', text: err?.response?.data?.message || err?.message || GENERIC_ERROR });
    } finally {
      setUploading(false);
    }
  };

  const { fileInputProps, cropperProps } = useImageCropper({
    type: 'library',
    defaultAspect: 1,
    onCropped: uploadImageFile,
  });

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this image permanently? It will fail if currently in use.')) return;
    try {
      await ImagesApi.delete(id);
      setImages(prev => prev.filter(img => img.id !== id));
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || err?.message || GENERIC_ERROR);
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(normalizeImageUrl(url));
    setUploadMessage({ type: 'success', text: 'URL copied to clipboard.' });
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatImageDate = (img) => {
    const value = img.created_at || img.createdAt;
    if (!value) return 'Unknown date';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Unknown date' : date.toLocaleDateString();
  };

  // Client-side filter: filename + original name + altText + url match the query.
  const filteredImages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return images.filter((img) => {
      if (showUnusedOnly && img.in_use) return false;
      if (!q) return true;
      const haystack = [
        img.filename,
        img.originalName,
        img.altText,
        img.url,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [images, searchQuery, showUnusedOnly]);

  return (
    <div className="images-container">
      <header className="images-header">
        <h1 className="images-title">Image Library</h1>
      </header>

      <div className="image-upload-area" onClick={() => fileInputRef.current?.click()}>
        <input type="file" hidden ref={fileInputRef} {...fileInputProps} accept="image/*" />
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>{uploading ? 'Uploading...' : 'Click to Upload New Image'}</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Supported formats: JPG, PNG, WebP. Max size: 5MB.</p>
        <p className="image-dimension-hint">{IMAGE_GUIDANCE.library.label}</p>
      </div>
      {uploadMessage && (
        <p className={`upload-message ${uploadMessage.type}`} style={{ marginBottom: '1rem' }}>{uploadMessage.text}</p>
      )}

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      {/* Search + filter bar */}
      {!loading || images.length > 0 ? (
        <div className="filter-bar" style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '1rem 0', flexWrap: 'wrap' }}>
          <input
            type="text"
            className="filter-search"
            placeholder="Search by filename, original name, alt text, or URL…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: 220 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={showUnusedOnly}
              onChange={(e) => setShowUnusedOnly(e.target.checked)}
            />
            Show unused only
          </label>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {filteredImages.length} / {images.length}
          </span>
        </div>
      ) : null}

      {loading && images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading image library...</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)' }}>
          No images uploaded yet.
        </div>
      ) : filteredImages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)' }}>
          No images match your filters.
        </div>
      ) : (
        <div className="images-grid">
          {filteredImages.map(img => (
            <div key={img.id} className="image-card">
              <div className={`image-usage-badge ${img.in_use ? 'used' : 'unused'}`}>
                {img.in_use ? 'IN USE' : 'UNUSED'}
              </div>
              <div className="image-preview-wrapper">
                <img src={normalizeImageUrl(img.url)} alt={img.filename} loading="lazy" />
              </div>
              <div className="image-details">
                <div className="image-filename" title={img.filename}>{img.filename}</div>
                <div className="image-meta">
                  <span>{formatSize(img.size)}</span>
                  <span>{formatImageDate(img)}</span>
                </div>
              </div>
              <div className="image-actions">
                <button className="btn-icon" onClick={() => handleCopyUrl(img.url)}>Copy URL</button>
                <button
                  className="btn-icon danger"
                  onClick={() => handleDelete(img.id)}
                  title={img.in_use ? "Cannot delete image in use" : "Delete image"}
                  disabled={img.in_use}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <ImageCropper {...cropperProps} />
    </div>
  );
}
