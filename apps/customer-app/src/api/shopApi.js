import { apiClient } from './httpClient';

// Thin client over the shop-owner API (TASK 7). Uses the same apiClient +
// `auth: 'customer'` pattern as authApi.js — the JWT stays role: 'customer';
// the shop is derived server-side from the user.
const shopApi = {
  getMyShop: () => apiClient.get('/shop/me', { auth: 'customer' }),
  toggleShop: (isOpen) =>
    apiClient.patch('/shop/me/toggle', { is_open: isOpen, isOpen }, { auth: 'customer' }),
  getMyProducts: () => apiClient.get('/shop/products', { auth: 'customer' }),
  toggleProduct: (id, available) =>
    apiClient.patch(`/shop/products/${id}/toggle`, { available, isAvailable: available }, { auth: 'customer' }),
  getMyOrders: () => apiClient.get('/shop/orders', { auth: 'customer' }),
  confirmOrder: (orderId) =>
    apiClient.patch(`/shop/orders/${orderId}/confirm`, {}, { auth: 'customer' }),
};

export { shopApi };
