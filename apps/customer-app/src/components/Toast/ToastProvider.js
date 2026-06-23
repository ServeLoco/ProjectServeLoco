import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { spacing, typography } from '../../theme';

/**
 * Toast
 * Lightweight ephemeral confirmation message that floats over the app
 * and auto-dismisses after a short timeout. No external dependency.
 *
 * Usage:
 *   const { showToast } = useToast();
 *   showToast('Profile updated', { type: 'success' });
 *   showToast('Network is slow. Tap to retry.', { type: 'error', duration: 4000 });
 */

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let push = null;
export function showToast(message, options = {}) {
  if (push) push(message, options);
}

const COLORS = {
  success: { bg: '#1F3D2C', fg: '#9FE3B7', icon: 'check' },
  error:   { bg: '#3D1F1F', fg: '#FFB4B4', icon: 'close' },
  info:    { bg: '#1F2A3D', fg: '#B4C8FF', icon: 'bell' },
};

const DEFAULT_DURATION = 2400;

export function ToastProvider({ children }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState('');
  const [type, setType] = useState('info');
  const translateY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef(null);
  const queueRef = useRef([]);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: 80, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      // Drain queue
      if (queueRef.current.length > 0) {
        const next = queueRef.current.shift();
        setTimeout(() => show(next.message, next.options), 250);
      }
    });
  }, [translateY, opacity]);

  const show = useCallback((message, options = {}) => {
    const dur = options.duration || DEFAULT_DURATION;
    if (visible) {
      // Queue and return
      queueRef.current.push({ message, options });
      return;
    }
    setText(String(message || ''));
    setType(options.type || 'info');
    setVisible(true);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(dismiss, dur);
  }, [visible, translateY, opacity, dismiss]);

  // Expose a stable show function
  useEffect(() => {
    push = show;
    return () => { push = null; };
  }, [show]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const palette = COLORS[type] || COLORS.info;

  return (
    <ToastContext.Provider value={{ showToast: show }}>
      {children}
      {visible ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              backgroundColor: palette.bg,
              transform: [{ translateY }],
              opacity,
            },
          ]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          <View style={[styles.dot, { backgroundColor: palette.fg }]} />
          <Text style={[styles.text, { color: palette.fg }]} numberOfLines={2}>
            {text}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl + 56, // sits above the cart bar
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 12,
    zIndex: 200,
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
  },
  text: {
    ...typography.caption,
    flex: 1,
    fontWeight: '600',
  },
});

export default ToastProvider;
