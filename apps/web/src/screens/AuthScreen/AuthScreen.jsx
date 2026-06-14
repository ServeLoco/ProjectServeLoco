import React, { useState, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { authApi } from '../../api/authApi';
import { useAuthStore } from '../../stores/authStore';
import { connectCustomerRealtime } from '../../api/realtimeClient';
import Button from '../../components/Button';
import './AuthScreen.css';

export default function AuthScreen() {
  const [mode, setMode] = useState('login'); // login, signup, reset
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore(state => state.login);
  const token = useAuthStore(state => state.token);
  const submittingRef = useRef(false);

  // Hooks must run before any conditional return.
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (token) {
    const origin = location.state?.from?.pathname || '/';
    const search = location.state?.from?.search || '';
    return <Navigate to={origin + search} replace />;
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleAuthSuccess = (data) => {
    login(data.user, data.token);
    connectCustomerRealtime(data.token);
    const origin = location.state?.from?.pathname || '/';
    const search = location.state?.from?.search || '';
    navigate(origin + search, { replace: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'login') {
        const res = await authApi.login({ 
          phone: formData.phone, 
          password: formData.password 
        });
        const payload = res.data || res;
        handleAuthSuccess(payload);
      } else if (mode === 'signup') {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords don't match");
        }
        if (formData.password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
        const res = await authApi.signup({
          name: formData.name,
          phone: formData.phone,
          password: formData.password
        });
        const payload = res.data || res;
        handleAuthSuccess(payload);
      } else if (mode === 'reset') {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords don't match");
        }
        if (formData.password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
        await authApi.requestPasswordReset({
          phone: formData.phone,
          newPassword: formData.password
        });
        setSuccess("Password reset requested. An admin will review it soon.");
        setFormData({ name: '', phone: '', password: '', confirmPassword: '' });
      }
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        
        <div className="auth-header">
          <div className="auth-title">ServeLoco</div>
          <div className="auth-subtitle">
            {mode === 'login' && "Welcome back!"}
            {mode === 'signup' && "Create an account"}
            {mode === 'reset' && "Reset your password"}
          </div>
        </div>

        {mode !== 'reset' && (
          <div className="auth-segmented">
            <button 
              className={`auth-seg-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(null); }}
            >
              Log In
            </button>
            <button 
              className={`auth-seg-btn ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => { setMode('signup'); setError(null); }}
            >
              Sign Up
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="input-group">
              <label>Full Name</label>
              <input 
                type="text" 
                name="name" 
                className="auth-input" 
                placeholder="John Doe"
                value={formData.name}
                onChange={handleChange}
                required 
              />
            </div>
          )}

          <div className="input-group">
            <label>Phone Number</label>
            <input 
              type="tel" 
              name="phone" 
              className="auth-input" 
              placeholder="e.g. 9876543210"
              value={formData.phone}
              onChange={handleChange}
              required 
            />
          </div>

          <div className="input-group">
            <label>{mode === 'reset' ? 'New Password' : 'Password'}</label>
            <input
              type="password"
              name="password"
              className="auth-input"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          {(mode === 'signup' || mode === 'reset') && (
            <div className="input-group">
              <label>{mode === 'reset' ? 'Confirm New Password' : 'Confirm Password'}</label>
              <input
                type="password"
                name="confirmPassword"
                className="auth-input"
                placeholder="••••••••"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <Button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
            {loading ? 'Please wait...' : (
              mode === 'login' ? 'Log In' : mode === 'signup' ? 'Create Account' : 'Request Reset'
            )}
          </Button>
        </form>

        <div className="auth-footer">
          {mode === 'login' ? (
            <button className="link-btn" onClick={() => setMode('reset')}>
              Forgot Password?
            </button>
          ) : (
            <button className="link-btn" onClick={() => setMode('login')}>
              Back to Login
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
