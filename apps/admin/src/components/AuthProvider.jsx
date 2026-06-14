import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthApi, connectAdminRealtime, disconnectAdminRealtime } from '../api';
import { storage } from '../utils/storage';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      const token = storage.getToken();
      if (token) {
        try {
          const userData = await AuthApi.me();
          setUser(userData.user || userData.data || userData);
          connectAdminRealtime();
        } catch (error) {
          storage.clearToken();
          disconnectAdminRealtime();
        }
      }
      setLoading(false);
    };
    initAuth();
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
