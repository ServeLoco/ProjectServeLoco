import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import './Login.css';

export default function Login() {
  const [ownerId, setOwnerId] = useState('');
  const [password, setPassword] = useState('');
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
      <div className="login-card">
        <div className="login-logo-badge">SL</div>
        <h2 className="login-title">ServeLoco Panel</h2>
        <p className="login-subtitle">Sign in to manage inventory, settings, and orders</p>
        
        {error && <div className="login-error-alert">{error}</div>}
        
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label className="form-label">Owner ID</label>
            <input 
              type="text" 
              value={ownerId} 
              onChange={e => setOwnerId(e.target.value)}
              className="form-input"
              placeholder="Enter Owner ID"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="form-input"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" disabled={loading || !ownerId || !password} className="login-submit-btn">
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
