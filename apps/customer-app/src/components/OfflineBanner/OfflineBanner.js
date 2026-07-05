import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

/**
 * OfflineBanner
 * Slim banner that appears at the top of the screen when the app cannot
 * reach the server. Auto-dismisses when connectivity is restored.
 *
 * Props:
 *   visible          - whether to show the banner
 *   message          - banner text (default: "Can't reach the server.")
 *   onRetry          - optional retry callback (shows a "Retry" pill)
 */
function OfflineBanner({ visible, message = "Can't reach the server.", onRetry }) {
  const translateYRef = React.useRef(new Animated.Value(-60)).current;
  const [shown, setShown] = React.useState(visible);

  React.useEffect(() => {
    if (visible) setShown(true);
    Animated.timing(translateYRef, {
      toValue: visible ? 0 : -60,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setShown(false);
    });
  }, [visible, translateYRef]);

  if (!shown) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: translateYRef }] }]}
      pointerEvents="box-none"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
      {onRetry ? (
        <Text style={styles.retry} onPress={onRetry}>Retry</Text>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    paddingTop: spacing.xl,
    backgroundColor: '#1F1B16',
    zIndex: 100,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.saffron,
    marginRight: spacing.sm,
  },
  text: {
    ...typography.caption,
    flex: 1,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  retry: {
    ...typography.caption,
    color: colors.saffron,
    fontWeight: '700',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
});

export default OfflineBanner;
