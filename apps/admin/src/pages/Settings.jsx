import React, { useState, useEffect, useRef } from 'react';
import { SettingsApi, ImagesApi } from '../api';
import { getUploadedImage, normalizeImageUrl } from '../utils/imageUrl';
import { IMAGE_GUIDANCE } from '../utils/imageGuidance';
import { getImageUploadError } from '../utils/fileValidation';
import './Settings.css';

const DEFAULT_SETTINGS = {
  shop_open: false,
  delivery_available: false,
  minimum_order_amount: 0,
  delivery_charge: 0,
  below_threshold_delivery_charge: 20,
  night_charge: 0,
  night_charge_start: '',
  night_charge_end: '',
  fast_delivery_enabled: false,
  fast_delivery_charge: 0,
  standard_delivery_minutes: 60,
  fast_delivery_minutes: 30,
  whatsapp_number: '',
  support_phone: '',
  upi_id: '',
  upi_qr_image_id: '',
  upi_qr_image_url: '',
  free_delivery_above_minimum_active: true,
  free_delivery_offer_active: false
  // Location-based distance pricing is removed, so latitude/longitude/radius are obsolete.
};

const GENERIC_ERROR = 'Something went wrong. Please try again later.';

export default function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [error, setError] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadMessage, setUploadMessage] = useState(null);
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
      console.error(err);
      setError(GENERIC_ERROR);
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

    const sizeError = getImageUploadError(file);
    if (sizeError) {
      setUploadMessage({ type: 'error', text: sizeError });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const data = new FormData();
    data.append('image', file);

    try {
      setUploadingImage(true);
      setUploadMessage(null);
      const res = await ImagesApi.upload(data);
      const image = getUploadedImage(res);
      setSettings(prev => ({
        ...prev,
        upi_qr_image_id: image.id,
        upi_qr_image_url: image.url,
      }));
      setUploadMessage({ type: 'success', text: 'QR image uploaded. Save settings to apply it.' });
    } catch (err) {
      console.error(err);
      setUploadMessage({ type: 'error', text: GENERIC_ERROR });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const nullableNumber = (value) => (value === '' || value === null || value === undefined ? null : Number(value));
      const nonNegativeFields = [
        ['minimum_order_amount', 'Minimum order amount'],
        ['delivery_charge', 'Standard delivery charge'],
        ['night_charge', 'Night delivery surcharge'],
        ['below_threshold_delivery_charge', 'Below-threshold delivery charge'],
      ];

      for (const [field, label] of nonNegativeFields) {
        const value = settings[field];
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric < 0) {
          alert(`${label} must be a valid non-negative number.`);
          setSaving(false);
          return;
        }
      }

      // Night charge requires both start and end times when active.
      // Otherwise customers are either always or never charged at night.
      if (Number(settings.night_charge) > 0) {
        if (!settings.night_charge_start || !settings.night_charge_end) {
          alert('Night charge is set but the start or end time is missing. Either set both times or set the charge to 0.');
          setSaving(false);
          return;
        }
      }

      // Ensure numeric fields are numbers
      const payload = {
        ...settings,
        minimum_order_amount: Number(settings.minimum_order_amount),
        delivery_charge: Number(settings.delivery_charge),
        night_charge: Number(settings.night_charge),
        below_threshold_delivery_charge: Number(settings.below_threshold_delivery_charge),
        free_delivery_above_minimum_active: Boolean(settings.free_delivery_above_minimum_active),
        free_delivery_offer_active: Boolean(settings.free_delivery_offer_active),
        fast_delivery_enabled: Boolean(settings.fast_delivery_enabled),
        fast_delivery_charge: Number(settings.fast_delivery_charge || 0),
        standard_delivery_minutes: Number.parseInt(settings.standard_delivery_minutes, 10) || 60,
        fast_delivery_minutes: Number.parseInt(settings.fast_delivery_minutes, 10) || 30,
        upi_qr_image_id: settings.upi_qr_image_id,
      };
      const response = await SettingsApi.update(payload);
      if (response.data) {
        // Merge over the current state — NOT over DEFAULT_SETTINGS — so that
        // fields the backend doesn't echo back (e.g. whatsapp_number) keep the
        // value the admin just typed instead of reverting to blank.
        setSettings(prev => ({ ...prev, ...response.data }));
      }
      alert('Settings saved successfully!');
    } catch (err) {
      console.error(err);
      setError(GENERIC_ERROR);
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

      {error && <div className="error-container" style={{ marginBottom: '1rem' }}>{error}</div>}

      {settings.delivery_available === false && (
        <div style={{ backgroundColor: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '1rem', borderRadius: '4px', marginBottom: '1rem', border: '1px solid var(--warning-border)' }}>
          <strong>Warning:</strong> Delivery is currently OFF. Customers will not be able to select delivery at checkout.
        </div>
      )}

      {/* ── 1. Operational Status ────────────────────────────────────────── */}
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
        </div>
      </section>

      {/* ── 2. Order Requirements ───────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">Order Requirements</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">Minimum Order Amount (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              name="minimum_order_amount"
              className="settings-input"
              value={settings.minimum_order_amount || ''}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Orders below this amount use the below-minimum delivery charge.
            </span>
          </div>
        </div>
      </section>

      {/* ── 3. Delivery Pricing ─────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">Delivery Pricing</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">Delivery Charge (Above Minimum) (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              name="delivery_charge"
              className="settings-input"
              value={settings.delivery_charge}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Charged on orders at or above the minimum (unless waived by a rule below).
            </span>
          </div>

          <div className="settings-form-group">
            <label className="settings-label">Delivery Charge (Below Minimum) (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              name="below_threshold_delivery_charge"
              className="settings-input"
              value={settings.below_threshold_delivery_charge ?? 20}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Charged on orders below the minimum order amount.
            </span>
          </div>

          <div className="toggle-switch-wrapper full-width">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Free Delivery for Orders Above Minimum</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                When ON, orders at or above the minimum order amount get free delivery. When OFF, the above-minimum charge applies.
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

          <div className="toggle-switch-wrapper full-width">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>Free Delivery Offer (Global)</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>When enabled, all orders get zero delivery charge (overrides the other delivery charges).</span>
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
        </div>
      </section>

      {/* ── 4. Delivery Speed ───────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">Delivery Speed</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">🕐 Standard Delivery Time (minutes)</label>
            <input
              type="number"
              min="1"
              max="1439"
              step="1"
              name="standard_delivery_minutes"
              className="settings-input"
              value={settings.standard_delivery_minutes ?? 60}
              onChange={handleChange}
              placeholder="e.g. 60"
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Shown to the customer as the ETA for standard delivery. 1–1439 minutes.
            </span>
          </div>

          <div className="toggle-switch-wrapper full-width fast-delivery-toggle">
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text-primary)' }}>
                ⚡ Fast Delivery Option
              </strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                When enabled, customers can choose fast delivery at a fixed charge and ETA you set below.
                Replaces the standard delivery charge for eligible orders.
              </span>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                name="fast_delivery_enabled"
                checked={Boolean(settings.fast_delivery_enabled)}
                onChange={handleChange}
              />
              <span className="toggle-slider"></span>
            </label>
          </div>

          {Boolean(settings.fast_delivery_enabled) && (
            <>
              <div className="settings-form-group fast-delivery-charge-input">
                <label className="settings-label">⚡ Fast Delivery Charge (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  name="fast_delivery_charge"
                  className="settings-input"
                  value={settings.fast_delivery_charge ?? 0}
                  onChange={handleChange}
                  placeholder="e.g. 50"
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  This replaces the standard delivery charge when the customer selects fast delivery.
                </span>
              </div>
              <div className="settings-form-group">
                <label className="settings-label">⚡ Fast Delivery Time (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="1439"
                  step="1"
                  name="fast_delivery_minutes"
                  className="settings-input"
                  value={settings.fast_delivery_minutes ?? 30}
                  onChange={handleChange}
                  placeholder="e.g. 30"
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Shown to the customer as the ETA for fast delivery. 1–1439 minutes.
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* ── 5. Night Delivery ───────────────────────────────────────────── */}
      <section className="settings-section">
        <h2 className="settings-section-title">Night Delivery</h2>
        <div className="settings-form-grid">
          <div className="settings-form-group">
            <label className="settings-label">Night Delivery Surcharge (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              name="night_charge"
              className="settings-input"
              value={settings.night_charge}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Extra amount added to every order placed inside the night window. Set to 0 to disable.
            </span>
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Window — Start Time</label>
            <input
              type="time"
              name="night_charge_start"
              className="settings-input"
              value={settings.night_charge_start || ''}
              onChange={handleChange}
            />
          </div>
          <div className="settings-form-group">
            <label className="settings-label">Night Window — End Time</label>
            <input
              type="time"
              name="night_charge_end"
              className="settings-input"
              value={settings.night_charge_end || ''}
              onChange={handleChange}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              End before start means the window crosses midnight (e.g. 21:00 → 07:00).
            </span>
          </div>
        </div>
      </section>

      {/* ── 6. Contact & Payment Info ───────────────────────────────────── */}
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
            <p className="image-dimension-hint">{IMAGE_GUIDANCE.qr.label}</p>
            {settings.upi_qr_image_url && <img src={normalizeImageUrl(settings.upi_qr_image_url)} alt="UPI QR" className="qr-preview" />}
            <div
              style={{ border: '2px dashed var(--border-color)', padding: '2rem', textAlign: 'center', borderRadius: 'var(--radius-md)', cursor: 'pointer', background: 'var(--bg-color)' }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input type="file" hidden ref={fileInputRef} onChange={handleImageUpload} accept="image/*" />
              {uploadingImage ? 'Uploading...' : 'Click to Upload new QR Code'}
            </div>
            {uploadMessage && (
              <p className={`upload-message ${uploadMessage.type}`}>{uploadMessage.text}</p>
            )}
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
