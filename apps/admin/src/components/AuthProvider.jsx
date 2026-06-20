import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthApi, connectAdminRealtime, disconnectAdminRealtime } from '../api';
import { storage } from '../utils/storage';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const initAuth = async () => {
      const token = storage.getToken();
      if (token) {
        try {
          const userData = await AuthApi.me();
          if (!alive) return;
          setUser(userData.user || userData.data || userData);
          connectAdminRealtime();
        } catch (error) {
          if (!alive) return;
          // Only destroy local state on an explicit auth failure. Network blips,
          // server downtime, CORS errors, or 5xx responses should NOT wipe a
          // valid token — the next API call will get a fresh 401 if the token
          // really is dead, and the unauthorized listener below handles it.
          const isAuthError = /Unauthorized/i.test(error?.message || '');
          if (isAuthError) {
            storage.clearToken();
            disconnectAdminRealtime();
            setUser(null);
          } else {
            // Keep the user state untouched so the admin's session survives a
            // network blip. Show a console warning for diagnostics.
            console.warn('[AuthProvider] init /me failed (keeping token):', error?.message || error);
          }
        }
      }
      if (alive) setLoading(false);
    };
    initAuth();
    return () => { alive = false; };
  }, []);

  // Listen for 401s dispatched by the API client. Clear local auth state and
  // let ProtectedRoute redirect — no hard page reload, so any unsaved form
  // state in inputs is at least preserved until the redirect renders.
  useEffect(() => {
    const handleUnauthorized = () => {
      storage.clearToken();
      disconnectAdminRealtime();
      setUser(null);
    };
    window.addEventListener('admin:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('admin:unauthorized', handleUnauthorized);
  }, []);

  const login = async (credentials) => {
    const data = await AuthApi.login(credentials);
    storage.setToken(data.token);
    setUser(data.user);
    connectAdminRealtime();
  };

  const logout = () => {
    storage.clearToken();
    disconnectAdminRealtime();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
