import { apiClient } from './httpClient';
import { buildQueryString } from './queryString';

const dashboardApi = {
  getDashboard: params => apiClient.get(`/dashboard${buildQueryString(params)}`),
  getSectionItems: (slug, params) => apiClient.get(`/dashboard/sections/${slug}/items${buildQueryString(params)}`),
  // Full product list of a deal price offer, for the Deal page.
  getDeal: (couponId, params) => apiClient.get(`/dashboard/deals/${couponId}${buildQueryString(params)}`),
  // Every product of a product offer card (template 2), for its See all page.
  getOfferCard: (cardId, params) => apiClient.get(`/dashboard/offer-cards/${cardId}${buildQueryString(params)}`),
};

export { dashboardApi };
