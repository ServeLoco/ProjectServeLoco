import { apiClient } from './httpClient';

const adminImagesApi = {
  deleteImage: id => apiClient.delete(`/admin/images/${id}`, { auth: 'admin' }),
  uploadImage: formData => apiClient.post('/admin/images', formData, { auth: 'admin' }),
};

export { adminImagesApi };
