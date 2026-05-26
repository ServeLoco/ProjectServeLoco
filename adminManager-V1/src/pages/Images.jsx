import React, { useState, useEffect, useRef } from 'react';
import { ImagesApi } from '../api';
import { normalizeImageUrl } from '../utils/imageUrl';
import './Images.css';

export default function Images() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadMessage, setUploadMessage] = useState(null);
  const [uploading, setUploading] = useState(false);
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
      setError(err.message || 'Failed to fetch images');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('image', file);

    try {
      setUploading(true);
      setUploadMessage(null);
      await ImagesApi.upload(data);
      setUploadMessage({ type: 'success', text: 'Image uploaded successfully.' });
      fetchImages();
    } catch (err) {
      setUploadMessage({ type: 'error', text: 'Upload failed: ' + err.message });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this image permanently? It will fail if currently in use.')) return;
    try {
      await ImagesApi.delete(id);
      fetchImages();
    } catch (err) {
      alert('Failed to delete image (it may be in use): ' + (err.response?.data?.message || err.message));
    }
  };

  const handleCopyUrl = (url) => {
    navigator.clipboard.writeText(normalizeImageUrl(url));
    alert('Image URL copied to clipboard!');
  };

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="images-container">
      <header className="images-header">
        <h1 className="images-title">Image Library</h1>
      </header>

      <div className="image-upload-area" onClick={() => fileInputRef.current?.click()}>
        <input type="file" hidden ref={fileInputRef} onChange={handleUpload} accept="image/*" />
        <h3 style={{ color: 'var(--primary-color)', marginBottom: '0.5rem' }}>{uploading ? 'Uploading...' : 'Click to Upload New Image'}</h3>
        <p style={{ color: 'var(--text-secondary)' }}>Supported formats: JPG, PNG, WebP. Max size: 5MB.</p>
      </div>
      {uploadMessage && (
        <p className={`upload-message ${uploadMessage.type}`} style={{ marginBottom: '1rem' }}>{uploadMessage.text}</p>
      )}

      {error && <div className="error-container" style={{ marginBottom: '2rem' }}>{error}</div>}

      {loading && images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem' }}>Loading image library...</div>
      ) : images.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface-color)', borderRadius: 'var(--radius-lg)' }}>
          No images uploaded yet.
        </div>
      ) : (
        <div className="images-grid">
          {images.map(img => (
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
                  <span>{new Date(img.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="image-actions">
                <button className="btn-icon" onClick={() => handleCopyUrl(img.url)}>Copy URL</button>
                <button 
                  className="btn-icon danger" 
                  onClick={() => handleDelete(img.id)}
                  title={img.in_use ? "Cannot delete image in use" : "Delete image"}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
