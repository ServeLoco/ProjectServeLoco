import { apiClient } from './httpClient';

const offersApi = {
  getActiveOffer: () => apiClient.get('/offers/active'),
};

export { offersApi };
