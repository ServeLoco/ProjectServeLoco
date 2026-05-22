import { apiClient } from './httpClient';

const settingsApi = {
  getSettings: () => apiClient.get('/settings'),
};

export { settingsApi };
