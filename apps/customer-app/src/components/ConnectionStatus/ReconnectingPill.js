import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import { useRealtimeConnectionState } from '../../hooks/useRealtimeConnectionState';

/**
 * ReconnectingPill
 * Tiny pill shown in the bottom-left of the home screen when the
 * realtime socket is disconnected. Lets the user know their data
 * might be stale, without blocking the screen.
 */
function ReconnectingPill() {
  const { connected } = useRealtimeConnectionState();
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, {
      toValue: connected ? 0 : 1,
      duration: 200,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [connected, opacity]);

  if (connected) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.container, { opacity }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text style={styles.text}>Reconnecting…</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 86, // above the bottom tab bar (60) with a small gap
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 50,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.saffron,
    marginRight: spacing.sm,
  },
  text: {
    ...typography.caption,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default ReconnectingPill;
