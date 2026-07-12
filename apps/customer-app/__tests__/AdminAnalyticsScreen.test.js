/**
 * ADMIN TASK 14 — Analytics Live screen: live presence via socket, days
 * presets, product/window-shopper lists, find-users search.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AdminAnalyticsScreen from '../src/screens/admin/AdminAnalyticsScreen';

let liveHandler = null;

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (cb) => { require('react').useEffect(cb, []); },
}));

jest.mock('../src/api', () => ({
  adminApi: {
    analyticsSummary: jest.fn(),
    analyticsProducts: jest.fn(),
    analyticsWindowShoppers: jest.fn(),
    analyticsActiveUsers: jest.fn(),
  },
  getAdminRealtimeConnectionState: () => ({ connected: false }),
  subscribeAdminRealtime: (eventName, handler) => {
    if (eventName === 'analytics.live') liveHandler = handler;
    return () => { liveHandler = null; };
  },
  subscribeAdminRealtimeLifecycle: () => () => {},
}));

const { adminApi } = require('../src/api');

function findAllText(root) {
  return root.findAll((n) => n.type === 'Text' && typeof n.props.children !== 'undefined')
    .map((n) => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children)));
}

describe('AdminAnalyticsScreen', () => {
  let root;

  beforeEach(() => {
    jest.clearAllMocks();
    liveHandler = null;
    adminApi.analyticsSummary.mockResolvedValue({ today: { visitors: 10, sessions: 12, orders: 3, conversionPct: 25, cartAdds: 5, cartRemoves: 1 } });
    adminApi.analyticsProducts.mockResolvedValue({ topAdded: [{ productId: 1, name: 'Milk', count: 4 }], topRemoved: [], topViewed: [] });
    adminApi.analyticsWindowShoppers.mockResolvedValue({ data: [] });
    adminApi.analyticsActiveUsers.mockResolvedValue({ data: [] });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => { root.unmount(); });
      root = null;
    }
  });

  it('renders today stats and product lists', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminAnalyticsScreen />);
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['10', '3', 'Milk']));
  });

  it('shows "Connect to see live data" when the socket is disconnected and no users', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminAnalyticsScreen />);
    });

    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Connect to see live data.']));
  });

  it('updates the live panel when analytics.live pushes a payload', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminAnalyticsScreen />);
    });

    act(() => {
      liveHandler?.({ online: 7, peakToday: 15, byScreen: { Home: 3 }, byPlatform: { android: 5, ios: 2 }, users: [] });
    });

    const texts = findAllText(root.root);
    expect(texts).toEqual(expect.arrayContaining(['7', 'Peak today: 15', 'Home: 3']));
  });

  it('switches the days preset and refetches summary', async () => {
    await act(async () => {
      root = ReactTestRenderer.create(<AdminAnalyticsScreen />);
    });

    adminApi.analyticsSummary.mockClear();
    const chip30 = root.root.findAll((n) => n.props?.onPress && findAllText(n).includes('30d'))[0];
    await act(async () => { chip30.props.onPress(); });

    expect(adminApi.analyticsSummary).toHaveBeenCalledWith(30);
  });

  it('searches active users with the selected window', async () => {
    adminApi.analyticsActiveUsers.mockResolvedValue({ data: [{ userId: 9, name: 'Yash', phone: '999', sessions: 2, lastActiveAt: new Date().toISOString() }] });

    await act(async () => {
      root = ReactTestRenderer.create(<AdminAnalyticsScreen />);
    });

    const searchInput = root.root.findByProps({ placeholder: 'Search name or phone number…' });
    await act(async () => {
      searchInput.props.onChangeText('Yash');
    });
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(adminApi.analyticsActiveUsers).toHaveBeenCalledWith(60, 'Yash');
    expect(findAllText(root.root)).toEqual(expect.arrayContaining(['Yash']));
  });
});
