import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Animated, Dimensions, Keyboard, Platform } from 'react-native';
import useAuthKeyboard, { keyboardOverlap } from '../src/screens/customer/AuthScreen/useAuthKeyboard';

describe('auth keyboard avoidance', () => {
  it.each([
    ['edge-to-edge window', 0, 800, { screenY: 500, height: 300 }, 300],
    ['already resized window', 0, 500, { screenY: 500, height: 300 }, 0],
    ['root below a header', 50, 750, { screenY: 500, height: 300 }, 300],
    ['Android negative status-bar offset', -36, 800, { screenY: 500, height: 300 }, 300],
    ['hidden keyboard', 0, 800, null, 0],
    ['hardware keyboard', 0, 800, { screenY: 800, height: 0 }, 0],
    ['missing keyboard coordinates', 0, 800, { height: 300 }, 0],
    ['short viewport', 0, 250, { screenY: 500, height: 300 }, 0],
  ])('handles %s', (_name, top, height, frame, expected) => {
    expect(keyboardOverlap(top, height, frame)).toBe(expected);
  });

  it('re-measures resize, restores zero on hide, and ignores late measurements', async () => {
    const handlers = {};
    const remove = jest.fn();
    const listen = jest.spyOn(Keyboard, 'addListener').mockImplementation((name, fn) => { handlers[name] = fn; return { remove }; });
    const visible = jest.spyOn(Keyboard, 'isVisible').mockReturnValue(false);
    const timing = jest.spyOn(Animated, 'timing').mockImplementation((value, config) => ({
      start: () => value.setValue(config.toValue), stop: jest.fn(),
    }));
    let keyboard;
    function Harness() { keyboard = useAuthKeyboard(true); return null; }
    let screen;
    try {
      await act(async () => { screen = Renderer.create(<Harness />); });
      const callbacks = [];
      keyboard.rootRef.current = { measureInWindow: (callback) => callbacks.push(callback) };
      const show = handlers[Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow'];
      const hide = handlers[Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'];
      await act(async () => { show({ endCoordinates: { screenY: 500, height: 300 } }); });
      callbacks.shift()(0, 0, 360, 800);
      expect(keyboard.inset.__getValue()).toBe(300);
      expect(keyboard.visible).toBe(true);
      keyboard.onLayout();
      callbacks.shift()(0, 0, 360, 500);
      expect(keyboard.inset.__getValue()).toBe(0);
      keyboard.onLayout();
      await act(async () => { hide({}); });
      callbacks.shift()(0, 0, 360, 800);
      expect(keyboard.inset.__getValue()).toBe(0);
      expect(keyboard.visible).toBe(false);
      await act(async () => { show({ endCoordinates: { screenY: Dimensions.get('screen').height, height: 300 } }); });
      expect(keyboard.visible).toBe(false);
      expect(keyboard.inset.__getValue()).toBe(0);
      await act(async () => { screen.unmount(); });
      expect(remove).toHaveBeenCalledTimes(2);
    } finally {
      listen.mockRestore(); visible.mockRestore(); timing.mockRestore();
    }
  });
});
