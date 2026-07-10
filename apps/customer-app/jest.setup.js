jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

jest.mock('expo-location', () => ({
  Accuracy: {
    High: 4,
  },
  PermissionStatus: {
    GRANTED: 'granted',
  },
  getCurrentPositionAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSvg = React.forwardRef((props, ref) => <View ref={ref} {...props} />);

  return {
    __esModule: true,
    default: MockSvg,
    Circle: MockSvg,
    ClipPath: MockSvg,
    Defs: MockSvg,
    Ellipse: MockSvg,
    G: MockSvg,
    Line: MockSvg,
    LinearGradient: MockSvg,
    Path: MockSvg,
    Polygon: MockSvg,
    Polyline: MockSvg,
    Rect: MockSvg,
    Stop: MockSvg,
    Svg: MockSvg,
  };
});

// Mock SafeAreaContext
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// Mock expo-notifications — not available in Node/Jest environment
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'mock-push-token' })),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  scheduleNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// Mock expo-linear-gradient
jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    LinearGradient: React.forwardRef((props, ref) => <View ref={ref} {...props} />),
  };
});

// Mock @react-native-firebase/auth — native module not available in Jest/Node.
// AuthScreen imports this, so any test that touches AuthScreen needs the mock.
// Modular API (v22+): getAuth() returns an instance; signInWithPhoneNumber and
// getIdToken are standalone functions taking that instance/user as first arg.
jest.mock('@react-native-firebase/auth', () => {
  const mockAuthInstance = { currentUser: null };
  return {
    __esModule: true,
    getAuth: jest.fn(() => mockAuthInstance),
    signInWithPhoneNumber: jest.fn(async () => ({
      confirm: jest.fn(async () => ({
        user: { getIdToken: jest.fn(async () => 'mock-id-token') },
      })),
    })),
    getIdToken: jest.fn(async (user) => (user?.getIdToken ? user.getIdToken() : 'mock-id-token')),
  };
});

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: {},
}));
