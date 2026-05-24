import React, { useState, useEffect, useRef } from 'react';
import { SettingsApi, ImagesApi } from '../api';
import './Settings.css';

export default function Settings() {
  const [settings, setSettings] = useState({
    shop_open: false,
    delivery_available: false,
    min_order_amount: 0,
    delivery_charge: 0,
    free_delivery_threshold: 0,
    night_charge: 0,
    night_charge_start_time: '',
    night_charge_end_time: '',
    delivery_time_message: '',
    whatsapp_number: '',
    support_phone: '',
    upi_id: '',
    upi_qr_image_url: ''
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await SettingsApi.get();
      if (res.data) {
        setSettings(res.data);
      }
    } catch (err) {
      alert('Failed to fetch settings: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setSettings(prev => ({
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
      const res = await ImagesApi.upload(data);
      setSettings(prev => ({ ...prev, upi_qr_image_url: res.imageUrl || res.url || res.data?.url }));
    } catch (err) {
      alert('QR image upload failed: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Ensure numeric fields are numbers
      const payload = {
        ...settings,
        min_order_amount: Number(settings.min_order_amount),
        delivery_charge: Number(settings.delivery_charge),
        free_delivery_threshold: Number(settings.free_delivery_threshold),
        night_charge: Number(settings.night_charge)
      };
      await SettingsApi.update(payload);
      alert('Settings saved successfully!');
    } catch (err) {
      alert('Failed to save settings: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="settings-container"><p style={{ textAlign: 'center', padding: '2rem' }}>Loading configuration...</p></div>;
  }

  return (
    <div className="settings-container">
      <header className="settings-header">
        <h1 className="settings-title">Shop Settings</h1>
        <button className="btn-primary" onClick={handleSave} disabled={saving || uploadingImage}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </header>

      <section className="settings-section">
        <h2 className="settings-section-title">Operational Status</h2>
        <div className="settings-form-grid">
          <div className="toggle-switch-wrapper">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Shop Open</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Allow customers to place orders on the app.</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" name="shop_open" checked={settings.shop_open} onChange={handleChange} />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="toggle-switch-wrapper">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Delivery Available</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Toggle delivery services on or off.</span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" name="delivery_available" checked={settings.delivery_available} onChange={handleChange} />
              <span className="toggle-slider"></span>
            </label>
          </div>

          <div className="settings-form-group full-width">
            <label className="settings-label">Global Delivery Time Message</label>
            <input type="text" name="delivery_time_message" className="settings-input" placeholder="e.g. Delivery in 30-45 minutes" value={settings.delivery_time_message || ''} onChange={handleChange} />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Pricing & Rules</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">Minimum Order Amount (₹)</label>
            <input type="number" min="0" step="1" name="min_order_amount" className="settings-input" value={settings.min_order_amount} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Standard Delivery Charge (₹)</label>
            <input type="number" min="0" step="1" name="delivery_charge" className="settings-input" value={settings.delivery_charge} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Free Delivery Threshold (₹)</label>
            <input type="number" min="0" step="1" name="free_delivery_threshold" className="settings-input" placeholder="0 to disable" value={settings.free_delivery_threshold} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Delivery Surcharge (₹)</label>
            <input type="number" min="0" step="1" name="night_charge" className="settings-input" value={settings.night_charge} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Charge Start Time</label>
            <input type="time" name="night_charge_start_time" className="settings-input" value={settings.night_charge_start_time || ''} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Charge End Time</label>
            <input type="time" name="night_charge_end_time" className="settings-input" value={settings.night_charge_end_time || ''} onChange={handleChange} />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Contact & Payment Info</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">WhatsApp Number</label>
            <input type="text" name="whatsapp_number" className="settings-input" placeholder="+91..." value={settings.whatsapp_number || ''} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Support Phone Number</label>
            <input type="text" name="support_phone" className="settings-input" value={settings.support_phone || ''} onChange={handleChange} />
          </div>
          
          <div className="settings-form-group full-width">
            <label className="settings-label">UPI ID (For manual payments)</label>
            <input type="text" name="upi_id" className="settings-input" value={settings.upi_id || ''} onChange={handleChange} />
          </div>

          <div className="settings-form-group full-width">
            <label className="settings-label">UPI QR Code Image</label>
            {settings.upi_qr_image_url && <img src={settings.upi_qr_image_url} alt="UPI QR" className="qr-preview" />}
            <div 
              style={{ border: '2px dashed var(--border-color)', padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--bg-color)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
              {uploadingImage ? 'Uploading...' : 'Click to Upload new QR Code'}
            </div>
          </div>
        </div>
      </section>

      <div className="settings-footer">
        <button className="btn-primary" style={{ padding: '1rem 3rem', fontSize: '1.1rem' }} onClick={handleSave} disabled={saving || uploadingImage}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>

    </div>
  );
}
