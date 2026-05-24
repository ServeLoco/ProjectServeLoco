import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthApi } from '../api';
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
        } catch (error) {
          storage.clearToken();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (credentials) => {
    const data = await AuthApi.login(credentials);
    storage.setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    storage.clearToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
