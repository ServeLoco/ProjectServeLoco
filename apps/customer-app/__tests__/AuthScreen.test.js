import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { getIdToken, signInWithPhoneNumber } from '@react-native-firebase/auth';
import AuthScreen from '../src/screens/customer/AuthScreen/AuthScreen';
import { authApi } from '../src/api';

const mockSetSession = jest.fn();
jest.mock('../src/stores', () => ({ useAuthStore: (selector) => selector({ setSession: mockSetSession }) }));
jest.mock('../src/api', () => ({ authApi: { firebaseVerify: jest.fn() } }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('../src/utils/motionPreferences', () => ({ useReducedMotion: () => true }));
jest.mock('../src/screens/customer/AuthScreen/AuthBackdrop', () => () => null);
jest.mock('../src/components/BlurView', () => ({ children }) => children || null);
jest.mock('../src/components', () => ({
  AppScreen: require('../src/components/AppScreen/AppScreen').default,
  AppIcon: () => null,
}));
jest.mock('../src/hooks/useLocalNotifications', () => ({ requestNotificationPermission: jest.fn(async () => {}) }));

describe('AuthScreen redesigned form preserves authentication flow', () => {
  let screen;
  let confirm;
  const input = (label) => screen.root.findAllByType(TextInput).find((node) => node.props.accessibilityLabel === label);
  const button = (label) => screen.root.findAllByType(TouchableOpacity).find((node) =>
    node.findAllByType(Text).some((text) => text.props.children === label));
  const texts = () => screen.root.findAllByType(Text).map((node) => node.props.children);

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    confirm = jest.fn(async () => ({ user: { uid: 'test-user' } }));
    signInWithPhoneNumber.mockResolvedValue({ confirm, verificationId: 'test-verification' });
    getIdToken.mockResolvedValue('test-id-token');
    await act(async () => { screen = Renderer.create(<AuthScreen />); });
  });
  afterEach(async () => {
    await act(async () => { screen.unmount(); });
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  async function sendCode() {
    await act(async () => {
      input('Phone Number').props.onChangeText('9876543210');
      screen.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityRole === 'checkbox').props.onPress();
    });
    await act(async () => { await button('Send OTP').props.onPress(); });
  }
  async function enterCode() {
    for (let i = 1; i <= 6; i++) {
      await act(async () => { input(`OTP digit ${i}`).props.onChangeText(String(i)); });
    }
  }

  it('keeps terms acceptance and phone validation before sending a code', async () => {
    expect(button('Send OTP').props.disabled).toBe(true);
    await act(async () => { input('Phone Number').props.onChangeText('9876543210'); });
    await act(async () => { await input('Phone Number').props.onSubmitEditing(); });
    expect(signInWithPhoneNumber).not.toHaveBeenCalled();
    expect(texts()).toContain('Please accept the Terms and Privacy Policy');
    await act(async () => {
      screen.root.findAllByType(TouchableOpacity).find((node) => node.props.accessibilityRole === 'checkbox').props.onPress();
      input('Phone Number').props.onChangeText('123');
    });
    await act(async () => { await button('Send OTP').props.onPress(); });
    expect(signInWithPhoneNumber).not.toHaveBeenCalled();
    expect(texts()).toContain('Enter a valid 10-digit phone number');
  });

  it('automatically verifies the sixth digit and signs an existing user in', async () => {
    authApi.firebaseVerify.mockResolvedValue({ token: 'test-session', user: { id: 7 } });
    await sendCode();
    expect(signInWithPhoneNumber).toHaveBeenCalledWith(expect.anything(), '+919876543210');
    await enterCode();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith('123456');
    expect(authApi.firebaseVerify).toHaveBeenCalledWith({ idToken: 'test-id-token' });
    expect(mockSetSession).toHaveBeenCalledWith('test-session', { id: 7 }, null, null, null);
    expect(texts()).not.toContain('Almost there!');
  });

  it('asks only new users for their name after verifying the code', async () => {
    authApi.firebaseVerify.mockRejectedValueOnce({ code: 'NAME_REQUIRED' });
    await sendCode();
    await enterCode();
    expect(texts()).toContain('Almost there!');
    expect(mockSetSession).not.toHaveBeenCalled();
    await act(async () => { await button('Create Account').props.onPress(); });
    expect(texts()).toContain('Name is required');
    authApi.firebaseVerify.mockResolvedValueOnce({ token: 'new-session', user: { id: 8 } });
    await act(async () => { input('Full Name').props.onChangeText('  Test Customer  '); });
    await act(async () => { await button('Create Account').props.onPress(); });
    expect(authApi.firebaseVerify).toHaveBeenLastCalledWith({ idToken: 'test-id-token', name: 'Test Customer' });
    expect(mockSetSession).toHaveBeenCalledWith('new-session', { id: 8 }, null, null, null);
  });

  it('keeps the resend cooldown and change-number action', async () => {
    await sendCode();
    expect(button('Resend OTP in 45s').props.disabled).toBe(true);
    await act(async () => { await button('Change number').props.onPress(); });
    expect(input('Phone Number').props.value).toBe('9876543210');
    expect(input('OTP digit 1')).toBeUndefined();
  });
});
