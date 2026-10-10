import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Keyboard, Platform } from 'react-native';

// Measure what the keyboard actually covers. On adjustResize windows, the
// root already ends above the keyboard and needs no second keyboard inset.
export function keyboardOverlap(rootY, rootHeight, keyboardFrame) {
  if (!keyboardFrame || keyboardFrame.height <= 0 || !Number.isFinite(keyboardFrame.screenY)) return 0;
  // Android's measureInWindow can subtract the status bar even when the root
  // draws edge to edge. This screen never starts above the physical display.
  const screenTop = Math.max(0, rootY);
  return Math.max(0, Math.min(rootHeight, screenTop + rootHeight - keyboardFrame.screenY));
}

export default function useAuthKeyboard(reducedMotion) {
  const rootRef = useRef(null);
  const frame = useRef(null);
  const generation = useRef(0);
  const inset = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);

  const measure = useCallback((duration = 240) => {
    const version = ++generation.current;
    const update = (overlap) => {
      if (version !== generation.current) return;
      inset.stopAnimation();
      Animated.timing(inset, {
        toValue: overlap,
        duration: reducedMotion ? 0 : duration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    };
    if (!frame.current) update(0);
    else rootRef.current?.measureInWindow((_x, y, _width, height) => {
      update(keyboardOverlap(y, height, frame.current));
    });
  }, [inset, reducedMotion]);

  useEffect(() => {
    const show = (event) => {
      const coordinates = event.endCoordinates;
      // iOS also sends willChangeFrame while dismissing: its offscreen frame
      // still has a height, but should restore the expanded logo/layout.
      frame.current = coordinates?.height > 0 && coordinates.screenY < Dimensions.get('screen').height
        ? coordinates : null;
      setVisible(Boolean(frame.current));
      measure(event.duration || 240);
    };
    const hide = (event) => {
      frame.current = null;
      setVisible(false);
      measure(event?.duration || 240);
    };
    const subscriptions = [
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow', show),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', hide),
    ];
    if (Keyboard.isVisible()) {
      const metrics = Keyboard.metrics();
      if (metrics) show({ endCoordinates: metrics, duration: 0 });
    }
    return () => {
      generation.current += 1;
      subscriptions.forEach((subscription) => subscription.remove());
      inset.stopAnimation();
    };
  }, [inset, measure]);

  const onLayout = useCallback(() => measure(), [measure]);
  return { rootRef, inset, visible, onLayout };
}
