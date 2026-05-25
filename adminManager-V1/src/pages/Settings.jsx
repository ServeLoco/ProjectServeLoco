import React, { useState, useEffect, useRef } from 'react';
import { SettingsApi, ImagesApi } from '../api';
import './Settings.css';

const DEFAULT_SETTINGS = {
  shop_open: false,
  delivery_available: false,
  minimum_order_amount: 0,
  delivery_charge: 0,
  free_delivery_above: 0,
  night_charge: 0,
  night_charge_start: '',
  night_charge_end: '',
  delivery_time_message: '',
  whatsapp_number: '',
  support_phone: '',
  upi_id: '',
  upi_qr_image_id: '',
  upi_qr_image_url: '',
  shop_latitude: '',
  shop_longitude: '',
  delivery_radius_km: 8,
  delivery_cost_per_km: 0,
  below_threshold_delivery_charge: 20,
  free_delivery_above_minimum_active: true,
  free_delivery_offer_active: false
};

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  
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
        setSettings({ ...DEFAULT_SETTINGS, ...res.data });
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
      const image = res.image || res.data || res;
      setSettings(prev => ({
        ...prev,
        upi_qr_image_id: image.id || image._id || image.image_id || '',
        upi_qr_image_url: image.imageUrl || image.image_url || image.url || '',
      }));
    } catch (err) {
      alert('QR image upload failed: ' + err.message);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const nullableNumber = (value) => (value === '' || value === null || value === undefined ? null : Number(value));
      // Ensure numeric fields are numbers
      const payload = {
        ...settings,
        minimum_order_amount: Number(settings.minimum_order_amount),
        delivery_charge: Number(settings.delivery_charge),
        free_delivery_above: Number(settings.free_delivery_above),
        night_charge: Number(settings.night_charge),
        shop_latitude: nullableNumber(settings.shop_latitude),
        shop_longitude: nullableNumber(settings.shop_longitude),
        delivery_radius_km: Number(settings.delivery_radius_km),
        delivery_cost_per_km: Number(settings.delivery_cost_per_km),
        below_threshold_delivery_charge: Number(settings.below_threshold_delivery_charge),
        free_delivery_above_minimum_active: Boolean(settings.free_delivery_above_minimum_active),
        free_delivery_offer_active: Boolean(settings.free_delivery_offer_active),
        upi_qr_image_id: settings.upi_qr_image_id,
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
            <input type="number" min="0" step="1" name="minimum_order_amount" className="settings-input" value={settings.minimum_order_amount || ''} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Standard Delivery Charge (₹)</label>
            <input type="number" min="0" step="1" name="delivery_charge" className="settings-input" value={settings.delivery_charge} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Below Threshold Delivery Charge (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              name="below_threshold_delivery_charge"
              className="settings-input"
              value={settings.below_threshold_delivery_charge ?? 20}
              onChange={handleChange}
            />
          </div>
          <div className="toggle-switch-wrapper full-width">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Free Delivery After Minimum Order</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                When enabled, orders at or above the minimum order amount get free delivery. When disabled, standard delivery charge applies.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                name="free_delivery_above_minimum_active"
                checked={Boolean(settings.free_delivery_above_minimum_active)}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Delivery Surcharge (₹)</label>
            <input type="number" min="0" step="1" name="night_charge" className="settings-input" value={settings.night_charge} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Charge Start Time</label>
            <input type="time" name="night_charge_start" className="settings-input" value={settings.night_charge_start || ''} onChange={handleChange} />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Charge End Time</label>
            <input type="time" name="night_charge_end" className="settings-input" value={settings.night_charge_end || ''} onChange={handleChange} />
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h2 className="settings-section-title">Location Based Delivery</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">Shop Latitude</label>
            <input
              type="number"
              step="0.000001"
              min="-90"
              max="90"
              name="shop_latitude"
              className="settings-input"
              placeholder="e.g. 30.900965"
              value={settings.shop_latitude ?? ''}
              onChange={handleChange}
            />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Shop Longitude</label>
            <input
              type="number"
              step="0.000001"
              min="-180"
              max="180"
              name="shop_longitude"
              className="settings-input"
              placeholder="e.g. 75.857276"
              value={settings.shop_longitude ?? ''}
              onChange={handleChange}
            />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Delivery Radius (km)</label>
            <input
              type="number"
              min="0"
              step="0.1"
              name="delivery_radius_km"
              className="settings-input"
              value={settings.delivery_radius_km ?? 8}
              onChange={handleChange}
            />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Delivery Cost Per Km (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              name="delivery_cost_per_km"
              className="settings-input"
              value={settings.delivery_cost_per_km ?? 0}
              onChange={handleChange}
            />
          </div>
          <div className="toggle-switch-wrapper full-width">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Free Delivery Offer</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>When enabled, all in-range orders get zero delivery charge.</span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                name="free_delivery_offer_active"
                checked={Boolean(settings.free_delivery_offer_active)}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-form-group full-width">
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
              Customers must pin GPS location at checkout. Backend allows orders only inside the radius and calculates delivery as exact distance multiplied by cost per km.
            </p>
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
