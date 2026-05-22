import { apiClient } from './httpClient';

const imagesApi = {
  getImage: id => apiClient.get(`/images/${id}`),
};

export { imagesApi };
