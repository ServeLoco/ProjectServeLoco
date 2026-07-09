import { trackScreen, trackEvent, flushEvents, resetAnalytics } from '../src/api/analyticsClient';

// Mock realtimeClient — trackScreen delegates to emitAnalyticsScreen.
jest.mock('../src/api/realtimeClient', () => ({
  emitAnalyticsScreen: jest.fn(),
  getRealtimeConnectionState: jest.fn(() => ({ connected: true, hasSocket: true })),
}));

// Mock httpClient — flushEvents POSTs to /analytics/events.
jest.mock('../src/api/httpClient', () => ({
  apiClient: {
    post: jest.fn().mockResolvedValue({ accepted: 1 }),
  },
}));

const { emitAnalyticsScreen } = require('../src/api/realtimeClient');
const { apiClient } = require('../src/api/httpClient');

describe('analyticsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAnalytics();
  });

  describe('trackScreen', () => {
    it('emits analytics:screen via the realtime client when connected', () => {
      trackScreen('Home');
      expect(emitAnalyticsScreen).toHaveBeenCalledWith('Home');
    });

    it('does not throw if screen name is missing', () => {
      expect(() => trackScreen(null)).not.toThrow();
      expect(() => trackScreen(undefined)).not.toThrow();
      expect(emitAnalyticsScreen).not.toHaveBeenCalled();
    });
  });

  describe('trackEvent', () => {
    it('queues events without immediately flushing', () => {
      trackEvent('cart_add', { productId: 1, qty: 2, price: 10 });
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('flushes when the queue reaches 20 events', async () => {
      for (let i = 0; i < 20; i++) {
        trackEvent('product_view', { productId: i });
      }
      await flushEvents();
      expect(apiClient.post).toHaveBeenCalledWith('/analytics/events', { events: expect.any(Array) }, { auth: 'customer' });
      const body = apiClient.post.mock.calls[0][1];
      expect(body.events).toHaveLength(20);
    });

    it('does not flush an empty queue', async () => {
      await flushEvents();
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('stamps each event with type + payload + at', async () => {
      trackEvent('cart_add', { productId: 88, qty: 2, price: 45 });
      await flushEvents();
      const body = apiClient.post.mock.calls[0][1];
      expect(body.events[0]).toMatchObject({ type: 'cart_add', productId: 88, qty: 2, price: 45 });
      expect(body.events[0].at).toBeDefined();
    });

    it('clears the queue after a successful flush', async () => {
      trackEvent('cart_add', { productId: 1 });
      trackEvent('product_view', { productId: 2 });
      await flushEvents();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      // Second flush with no new events → no POST.
      await flushEvents();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('retries once on failed flush, then drops (never throws)', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('network'));
      trackEvent('cart_add', { productId: 1 });
      // First flush fails — events stay for retry.
      await flushEvents();
      expect(apiClient.post).toHaveBeenCalledTimes(1);
      // Second flush retries the same events.
      apiClient.post.mockResolvedValueOnce({ accepted: 1 });
      await flushEvents();
      expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it('drops events after a failed retry (no infinite loop)', async () => {
      apiClient.post.mockRejectedValue(new Error('network'));
      trackEvent('cart_add', { productId: 1 });
      await flushEvents(); // fail
      await flushEvents(); // retry fail
      await flushEvents(); // drop — no more POST
      expect(apiClient.post).toHaveBeenCalledTimes(2);
    });

    it('never throws on flush failure', async () => {
      apiClient.post.mockRejectedValue(new Error('server explosion'));
      trackEvent('cart_add', { productId: 1 });
      await expect(flushEvents()).resolves.toBeUndefined();
    });
  });
});
