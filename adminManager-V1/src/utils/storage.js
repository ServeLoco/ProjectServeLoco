const TOKEN_KEY = 'admin_token';
const THEME_KEY = 'admin_theme';

export const storage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
  getTheme: () => localStorage.getItem(THEME_KEY) || 'light',
  setTheme: (theme) => localStorage.setItem(THEME_KEY, theme),
};
