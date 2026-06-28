import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { signInWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { authApi } from '../../api/authApi';
import { useAuthStore } from '../../stores/authStore';
import { connectCustomerRealtime } from '../../api/realtimeClient';
import Button from '../../components/Button';
import './AuthScreen.css';

const COUNTRY_CODE = '+91';
const OTP_LENGTH = 6;

export default function AuthScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore(state => state.login);
  const token = useAuthStore(state => state.token);
  const submittingRef = useRef(false);

  /*
   * step: 'phone' | 'otp' | 'name'
   * mode: 'login' | 'signup'
   */
  const [step, setStep] = useState('phone');
  const [mode, setMode] = useState('login');

  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /* Firebase state */
  const [confirmation, setConfirmation] = useState(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState(null);
  const recaptchaRef = useRef(null);
  const otpRefs = useRef([]);

  /* Resend timer */
  const [resendTimer, setResendTimer] = useState(0);
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setTimeout(() => setResendTimer(r => r - 1), 1000);
    return () => clearTimeout(t);
  }, [resendTimer]);

  // Redirect if already authenticated
  if (token) {
    const origin = location.state?.from?.pathname || '/';
    const search = location.state?.from?.search || '';
    return <Navigate to={origin + search} replace />;
  }

  const handleAuthSuccess = (data) => {
    login(data.user, data.token);
    connectCustomerRealtime(data.token);
    const origin = location.state?.from?.pathname || '/';
    const search = location.state?.from?.search || '';
    navigate(origin + search, { replace: true });
  };

  /* ── Setup invisible reCAPTCHA ── */
  const setupRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current;

    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => {
        setError('reCAPTCHA expired. Please try again.');
      },
    });

    recaptchaRef.current = verifier;
    return verifier;
  };

  /* ── Send OTP ── */
  const sendOtp = async (e) => {
    if (e) e.preventDefault();
    if (submittingRef.current) return;

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Name is required');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const verifier = setupRecaptcha();
      const fullPhone = `${COUNTRY_CODE}${cleanPhone}`;
      const result = await signInWithPhoneNumber(auth, fullPhone, verifier);
      setConfirmation(result);
      setStep('otp');
      setResendTimer(30);
      // Focus first OTP input
      setTimeout(() => otpRefs.current[0]?.focus(), 200);
    } catch (err) {
      console.error('[firebase] sendOtp error:', err);
      // Reset recaptcha on error so it can be re-rendered
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_) { /* best-effort */ }
        recaptchaRef.current = null;
      }
      if (err.code === 'auth/invalid-phone-number') {
        setError('Invalid phone number format');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError(err.message || 'Failed to send OTP');
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  /* ── Verify OTP ── */
  const verifyOtp = async (e) => {
    if (e) e.preventDefault();
    if (submittingRef.current) return;

    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError(`Enter all ${OTP_LENGTH} digits`);
      return;
    }
    if (!confirmation) {
      setError('Session expired. Please resend OTP.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const userCredential = await confirmation.confirm(code);
      const idToken = await userCredential.user.getIdToken();
      setFirebaseIdToken(idToken);

      const payload = { idToken };
      if (mode === 'signup' && name.trim()) {
        payload.name = name.trim();
      }

      try {
        const res = await authApi.firebaseVerify(payload);
        const data = res.data || res;
        handleAuthSuccess(data);
      } catch (backendErr) {
        // Web client error shape: { message, status, data: { code, ... } }
        const backendData = backendErr.data || backendErr.response?.data || {};
        if (backendData.code === 'NAME_REQUIRED' || backendData.isNewUser) {
          setStep('name');
          setError(null);
          return;
        }
        throw backendErr;
      }
    } catch (err) {
      console.error('[firebase] verifyOtp error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        setError('Incorrect OTP. Please try again.');
      } else if (err.code === 'auth/code-expired') {
        setError('OTP has expired. Please resend.');
      } else {
        setError(err.response?.data?.message || err.message || 'Failed to verify OTP');
      }
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  /* ── Submit name (new user discovered at verify) ── */
  const submitName = async (e) => {
    if (e) e.preventDefault();
    if (submittingRef.current) return;
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Re-get fresh token if needed
      let idToken = firebaseIdToken;
      const currentUser = auth.currentUser;
      if (currentUser) {
        idToken = await currentUser.getIdToken(true);
      }

      const res = await authApi.firebaseVerify({
        idToken,
        name: name.trim(),
      });
      const data = res.data || res;
      handleAuthSuccess(data);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to create account');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  /* ── Resend OTP ── */
  const resendOtp = async () => {
    if (resendTimer > 0 || submittingRef.current) return;
    setOtp(Array(OTP_LENGTH).fill(''));
    setError(null);

    // Reset recaptcha verifier for resend
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch (_) { /* best-effort */ }
      recaptchaRef.current = null;
    }

    submittingRef.current = true;
    setLoading(true);
    try {
      const verifier = setupRecaptcha();
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      const fullPhone = `${COUNTRY_CODE}${cleanPhone}`;
      const result = await signInWithPhoneNumber(auth, fullPhone, verifier);
      setConfirmation(result);
      setResendTimer(30);
      otpRefs.current[0]?.focus();
    } catch (err) {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch (_) { /* best-effort */ }
        recaptchaRef.current = null;
      }
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  /* ── OTP input handling ── */
  const handleOtpChange = (value, index) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newOtp = [...otp];
    newOtp[index] = digit;
    setOtp(newOtp);

    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (e, index) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
      const newOtp = [...otp];
      newOtp[index - 1] = '';
      setOtp(newOtp);
    }
  };

  // Handle paste for OTP
  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pastedData.length > 0) {
      const newOtp = Array(OTP_LENGTH).fill('');
      for (let i = 0; i < pastedData.length; i++) {
        newOtp[i] = pastedData[i];
      }
      setOtp(newOtp);
      const focusIndex = Math.min(pastedData.length, OTP_LENGTH - 1);
      otpRefs.current[focusIndex]?.focus();
    }
  };

  /* ── Subtitle ── */
  const subtitle = step === 'phone'
    ? (mode === 'login' ? 'Welcome back!' : 'Create an account')
    : step === 'otp'
    ? 'Verify your phone number'
    : 'One more step';

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-title">ServeLoco</div>
          <div className="auth-subtitle">{subtitle}</div>
        </div>

        {/* ── Phone Step ── */}
        {step === 'phone' && (
          <>
            {/* Mode Switcher */}
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

            <form className="auth-form" onSubmit={sendOtp}>
              {mode === 'signup' && (
                <div className="input-group">
                  <label>Full Name</label>
                  <input
                    type="text"
                    className="auth-input"
                    placeholder="Your full name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(null); }}
                    required
                  />
                </div>
              )}

              <div className="input-group">
                <label>Phone Number</label>
                <div className="phone-input-row">
                  <span className="country-code">{COUNTRY_CODE}</span>
                  <input
                    type="tel"
                    className="auth-input phone-input"
                    placeholder="10-digit mobile number"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setError(null); }}
                    maxLength={10}
                    required
                  />
                </div>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <Button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
                {loading ? 'Sending OTP...' : 'Send OTP'}
              </Button>
            </form>
          </>
        )}

        {/* ── OTP Step ── */}
        {step === 'otp' && (
          <form className="auth-form" onSubmit={verifyOtp}>
            <div className="otp-info">
              <p className="otp-subtitle">
                Enter the 6-digit code sent to<br />
                <strong>{COUNTRY_CODE} {phone}</strong>
              </p>
            </div>

            <div className="otp-row">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => { otpRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  className={`otp-box ${digit ? 'filled' : ''}`}
                  value={digit}
                  onChange={(e) => handleOtpChange(e.target.value, index)}
                  onKeyDown={(e) => handleOtpKeyDown(e, index)}
                  onPaste={index === 0 ? handleOtpPaste : undefined}
                  maxLength={1}
                  disabled={loading}
                  autoComplete={index === 0 ? 'one-time-code' : 'off'}
                />
              ))}
            </div>

            {error && <div className="auth-error">{error}</div>}

            <Button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </Button>

            <div className="otp-actions">
              <button
                type="button"
                className={`link-btn ${resendTimer > 0 ? 'disabled' : ''}`}
                onClick={resendOtp}
                disabled={resendTimer > 0 || loading}
              >
                {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setStep('phone');
                  setOtp(Array(OTP_LENGTH).fill(''));
                  setConfirmation(null);
                  setError(null);
                }}
              >
                Change number
              </button>
            </div>
          </form>
        )}

        {/* ── Name Step (new user) ── */}
        {step === 'name' && (
          <form className="auth-form" onSubmit={submitName}>
            <div className="otp-info">
              <p className="otp-subtitle">
                You're new here! Tell us your name to get started.
              </p>
            </div>

            <div className="input-group">
              <label>Full Name</label>
              <input
                type="text"
                className="auth-input"
                placeholder="Your full name"
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                required
                autoFocus
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <Button type="submit" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        )}

        {/* Invisible reCAPTCHA container */}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
}
