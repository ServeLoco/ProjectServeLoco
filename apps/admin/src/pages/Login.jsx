import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import './Login.css';

export default function Login() {
  const [ownerId, setOwnerId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!ownerId || !password) {
      setError('Owner ID and password are required');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await login({ ownerId, password });
      navigate('/');
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      {/* Animated blobs */}
      <div className="login-blob login-blob-1" />
      <div className="login-blob login-blob-2" />
      <div className="login-blob login-blob-3" />

      <div className="login-split">
        {/* Left branding panel */}
        <div className="login-brand-panel">
          <div className="login-brand-logo">VK</div>
          <h1 className="login-brand-title">VillKro</h1>
          <p className="login-brand-tagline">Manage your store with clarity and speed.</p>
          <ul className="login-brand-features">
            <li>⚡ Real-time order tracking</li>
            <li>📦 Inventory management</li>
            <li>📊 Sales analytics</li>
            <li>🔔 Push notifications</li>
          </ul>
        </div>

        {/* Right form panel */}
        <div className="login-card">
          <div className="login-card-inner">
            <div className="login-logo-badge">VK</div>
            <h2 className="login-title">Welcome back</h2>
            <p className="login-subtitle">Sign in to your admin panel</p>

            {error && (
              <div className="login-error-alert" role="alert">
                <span>⚠</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-form">
              <div className="form-group">
                <label className="form-label" htmlFor="ownerId">Owner ID</label>
                <input
                  id="ownerId"
                  type="text"
                  value={ownerId}
                  onChange={e => setOwnerId(e.target.value)}
                  className="form-input login-input"
                  placeholder="Enter your owner ID"
                  autoComplete="username"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="password">Password</label>
                <div className="login-password-wrap">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="form-input login-input"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="login-eye-btn"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !ownerId || !password}
                className="login-submit-btn"
              >
                {loading ? (
                  <><span className="login-spinner" /> Signing in…</>
                ) : (
                  'Sign In →'
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
