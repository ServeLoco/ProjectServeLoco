import { apiClient } from './httpClient';

const storeModesApi = {
  list: () => apiClient.get('/store-modes'),
};

export { storeModesApi };
