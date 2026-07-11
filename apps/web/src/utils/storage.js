const TOKEN_KEY = 'serveloco-customer-auth';

export const getToken = () => {
  try {
    const data = localStorage.getItem(TOKEN_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      return parsed.state?.token || null;
    }
  } catch {
    // Ignore error
  }
  return null;
};
