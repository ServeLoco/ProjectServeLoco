import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminReportsScreen from '../src/screens/admin/AdminReportsScreen';
import { adminApi } from '../src/api';

// The first render compiles the whole screen tree on a cold CI cache (over 5s there).
jest.setTimeout(20000);

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockOrderHandlers = [];
let mockLifecycleHandlers = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack }),
  useFocusEffect: cb => require('react').useEffect(cb, [cb]),
}));
jest.mock('../src/api', () => ({
  adminApi: {
    reportProfitSummary: jest.fn(), reportProfitInsights: jest.fn(), reportProfitOrders: jest.fn(),
    reportSales: jest.fn(), reportTopProducts: jest.fn(), reportCustomers: jest.fn(), reportShops: jest.fn(), reportFoodRatings: jest.fn(),
  },
  subscribeAdminOrderEvents: handler => { mockOrderHandlers.push(handler); return () => { mockOrderHandlers = mockOrderHandlers.filter(h => h !== handler); }; },
  subscribeAdminRealtimeLifecycle: handler => { mockLifecycleHandlers.push(handler); return () => { mockLifecycleHandlers = mockLifecycleHandlers.filter(h => h !== handler); }; },
}));

const summary = {
  period: { from: '2026-10-10', to: '2026-10-10' },
  totals: { netProfit: -25, shopCost: 200, customerPaid: 175, deliveredOrders: 2, appSales: 180, marginPercent: -14.3 },
  warnings: { unpricedItemsCount: 1, rejectedItemsCount: 2 },
  shops: [{ shopId: 2, shopName: 'Pizza shop', shopCost: 200, appSales: 180, margin: -20 }],
};
const overviewSales = { total_revenue: 789, total_orders: 3, status_breakdown: { delivered: 2, pending: 1 } };
const order = { id: 51, orderNumber: 'OD-51', customerName: 'Test Customer', paymentMethod: 'Cash', customerPaid: 175, netProfit: -25 };
const texts = root => root.findAll(n => n.type === 'Text').map(n => Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children));
let tree;
const press = async label => {
  const button = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  expect(button).toBeDefined();
  await act(async () => button.props.onPress());
};
const render = async () => { await act(async () => { tree = ReactTestRenderer.create(<AdminReportsScreen />); }); };

beforeEach(() => {
  jest.clearAllMocks();
  mockOrderHandlers = []; mockLifecycleHandlers = [];
  adminApi.reportProfitSummary.mockResolvedValue(summary);
  adminApi.reportProfitInsights.mockResolvedValue({ customers: { newCustomers: 2 }, losses: {}, trend: { points: [] } });
  adminApi.reportProfitOrders.mockResolvedValue({ data: [order], pagination: { page: 1, total: 21, totalPages: 2 } });
  adminApi.reportSales.mockResolvedValue(overviewSales);
  adminApi.reportTopProducts.mockResolvedValue({ data: [] });
  adminApi.reportCustomers.mockResolvedValue({ data: { total_customers: 10 } });
  adminApi.reportShops.mockResolvedValue({ data: [] });
  adminApi.reportFoodRatings.mockResolvedValue({ data: [{ product_id: 1, item_type: 'product', product_name: 'Plain Roti', rating: 4.8, rated_avg: 2, ratings_count: 2, orders_count: 10, low_ratings: 2 }] });
});
afterEach(async () => {
  if (tree) await act(async () => { tree.unmount(); });
  tree = null;
  jest.useRealTimers();
});

it('loads profit with admin report methods, displays negative profit and pricing warnings', async () => {
  await render();
  expect(adminApi.reportProfitSummary).toHaveBeenCalledWith({ period: 'today' });
  expect(adminApi.reportSales).not.toHaveBeenCalled();
  expect(texts(tree.root)).toEqual(expect.arrayContaining(['₹-25.00', 'Pizza shop', 'Shop payout due', '#OD-51', 'Delivered orders only. Net profit is before rider payouts.']));
  expect(texts(tree.root).join(' ')).toContain('profit may be overstated');
});

it('uses the correct profit vs overview period keys, and shows real food ratings', async () => {
  await render();
  await press('This week');
  expect(adminApi.reportProfitSummary).toHaveBeenLastCalledWith({ period: 'this_week' });
  await press('Overview');
  await press('This week');
  expect(adminApi.reportSales).toHaveBeenLastCalledWith({ period: 'week' });
  expect(adminApi.reportFoodRatings).toHaveBeenLastCalledWith({ period: 'week' });
  expect(texts(tree.root)).toEqual(expect.arrayContaining(['₹789.00', 'Food ratings', 'Plain Roti', 'Real average', '2.0 / 5', '★ 4.8']));
});

it('rejects invalid custom dates without sending them, then applies valid dates', async () => {
  await render();
  await press('Custom');
  adminApi.reportProfitSummary.mockClear();
  await act(async () => {
    tree.root.findByProps({ accessibilityLabel: 'Report start date' }).props.onChangeText('2026-02-30');
    tree.root.findByProps({ accessibilityLabel: 'Report end date' }).props.onChangeText('2026-03-01');
  });
  await press('Apply dates');
  expect(texts(tree.root)).toContain('Enter valid dates as YYYY-MM-DD.');
  expect(adminApi.reportProfitSummary).not.toHaveBeenCalled();
  await act(async () => tree.root.findByProps({ accessibilityLabel: 'Report start date' }).props.onChangeText('2026-02-28'));
  await press('Apply dates');
  expect(adminApi.reportProfitSummary).toHaveBeenLastCalledWith({ period: 'custom', from: '2026-02-28', to: '2026-03-01' });
});

it('paginates and sorts only delivered orders, resetting the page on filters', async () => {
  await render();
  adminApi.reportProfitSummary.mockClear(); adminApi.reportProfitInsights.mockClear();
  await press('Next');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  expect(adminApi.reportProfitSummary).not.toHaveBeenCalled();
  expect(adminApi.reportProfitInsights).not.toHaveBeenCalled();
  await press('Highest profit');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'profit', page: 1 }));
  await press('Pizza shop');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ shopId: 2, page: 1 }));
  await press('This month');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'this_month', shopId: undefined, page: 1 }));
});

it('opens the matching order and goes back to admin home', async () => {
  await render();
  await press('Open order OD-51');
  expect(mockNavigate).toHaveBeenCalledWith('AdminOrderDetail', { orderId: 51 });
  await press('Back to admin home');
  expect(mockGoBack).toHaveBeenCalled();
});

it('shows and retries failed overview requests without reporting false zero figures', async () => {
  adminApi.reportFoodRatings.mockRejectedValueOnce(new Error('offline'));
  await render();
  await press('Overview');
  expect(texts(tree.root)).toContain('Could not load overview.');
  expect(texts(tree.root)).not.toContain('Sales overview');
  await press('Retry overview');
  expect(texts(tree.root)).toContain('Food ratings');
});

it('lets independent profit sections load even when summary fails', async () => {
  adminApi.reportProfitSummary.mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(texts(tree.root)).toContain('Could not load profit summary.');
  expect(texts(tree.root)).toContain('#OD-51');
  await press('Retry profit summary');
  expect(texts(tree.root)).toContain('Shop payout due');
});

it('ignores a slow previous-period response after the period changes', async () => {
  let resolveOld;
  adminApi.reportProfitSummary.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await render();
  adminApi.reportProfitSummary.mockResolvedValueOnce({ ...summary, totals: { netProfit: 999 } });
  await press('Yesterday');
  expect(texts(tree.root)).toContain('₹999.00');
  await act(async () => resolveOld({ ...summary, totals: { netProfit: 111 } }));
  expect(texts(tree.root)).toContain('₹999.00');
  expect(texts(tree.root)).not.toContain('₹111.00');
});

it('pull-to-refresh refetches the current report resources', async () => {
  await render();
  adminApi.reportProfitSummary.mockClear();
  const refresh = tree.root.findAll(n => n.props.onRefresh && n.props.refreshing !== undefined)[0];
  await act(async () => refresh.props.onRefresh());
  expect(adminApi.reportProfitSummary).toHaveBeenCalledTimes(1);
});

it('debounces live updates, refreshes on foreground, and removes subscriptions on exit', async () => {
  jest.useFakeTimers();
  await render();
  adminApi.reportProfitSummary.mockClear();
  await act(async () => {
    mockOrderHandlers.forEach(handler => { handler(); handler(); });
    jest.advanceTimersByTime(300);
  });
  expect(adminApi.reportProfitSummary).toHaveBeenCalledTimes(1);
  await act(async () => {
    mockLifecycleHandlers.forEach(handler => handler({ eventName: 'foreground' }));
    jest.advanceTimersByTime(300);
  });
  expect(adminApi.reportProfitSummary).toHaveBeenCalledTimes(2);
  await act(async () => tree.unmount());tree = null;
  expect(mockOrderHandlers).toHaveLength(0);
  expect(mockLifecycleHandlers).toHaveLength(0);
});

it('clears the shop filter when new custom dates are applied', async () => {
  await render();
  await press('Custom');
  const setDates = (from, to) => act(async () => {
    tree.root.findByProps({ accessibilityLabel: 'Report start date' }).props.onChangeText(from);
    tree.root.findByProps({ accessibilityLabel: 'Report end date' }).props.onChangeText(to);
  });
  await setDates('2026-02-01', '2026-02-28');
  await press('Apply dates');
  await press('Pizza shop');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ shopId: 2 }));
  await setDates('2026-03-01', '2026-03-31');
  await press('Apply dates');
  expect(adminApi.reportProfitOrders).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'custom', shopId: undefined, page: 1 }));
});

it('keeps the current orders on screen while the next page loads', async () => {
  await render();
  let resolveNext;
  adminApi.reportProfitOrders.mockImplementationOnce(() => new Promise(resolve => { resolveNext = resolve; }));
  await press('Next');
  expect(texts(tree.root)).toContain('#OD-51');
  expect(texts(tree.root)).toContain('Page 2 of 2');
  await act(async () => resolveNext({ data: [{ ...order, id: 52, orderNumber: 'OD-52' }], pagination: { page: 2, total: 21, totalPages: 2 } }));
  expect(texts(tree.root)).toContain('#OD-52');
  expect(texts(tree.root)).not.toContain('#OD-51');
});

it('shows each top item once per row, even when a renamed product repeats, up to 50', async () => {
  const products = Array.from({ length: 60 }, (_, i) => ({ product_id: i < 2 ? 7 : i, item_type: 'product', product_name: `Item ${i}`, total_quantity: 1, total_sales: 10 }));
  adminApi.reportTopProducts.mockResolvedValue({ data: products });
  const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  await render();
  await press('Overview');
  const shown = texts(tree.root).filter(t => /^Item \d+$/.test(t));
  expect(shown).toHaveLength(50);
  expect(shown.slice(0, 2)).toEqual(['Item 0', 'Item 1']);
  expect(errors.mock.calls.join(' ')).not.toContain('same key');
  errors.mockRestore();
});
