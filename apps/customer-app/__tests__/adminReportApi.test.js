import { adminApi } from '../src/api/adminApi';
import { apiClient } from '../src/api/httpClient';
jest.mock('../src/api/httpClient', () => ({ apiClient: { get: jest.fn() } }));

it.each([
  ['reportSales', 'sales'], ['reportCustomers', 'customers'], ['reportTopProducts', 'top-products'],
  ['reportFoodRatings', 'ratings'], ['reportShops', 'shops'], ['reportProfitSummary', 'profit/summary'],
  ['reportProfitInsights', 'profit/insights'], ['reportProfitOrders', 'profit/orders'],
])('%s uses admin authentication and the existing report endpoint', (method, path) => {
  apiClient.get.mockClear();
  adminApi[method]({ period: 'custom', from: '2026-10-01', to: '2026-10-10', page: 2, shopId: undefined });
  expect(apiClient.get).toHaveBeenCalledWith(`/admin/reports/${path}?period=custom&from=2026-10-01&to=2026-10-10&page=2`, { auth: 'admin' });
});
