import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';
import AppIcon from '../AppIcon';
import Button from '../Button';

/**
 * ErrorBoundary
 * Catches render-time errors anywhere in the tree below and shows a
 * friendly recovery screen instead of crashing to a white screen.
 *
 * Props:
 *   children     - the tree to guard
 *   fallback     - optional custom fallback (receives { error, reset })
 *   onError      - optional callback (error, stack) -> analytics hook
 *   onReset      - optional callback when the user taps Restart
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] Caught render error:', error, info?.componentStack);
    if (typeof this.props.onError === 'function') {
      try { this.props.onError(error, info?.componentStack); } catch (_) { /* ignore */ }
    }
  }

  reset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === 'function') {
      try { this.props.onReset(); } catch (_) { /* ignore */ }
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === 'function') {
      try {
        return this.props.fallback({ error, reset: this.reset });
      } catch (_) {
        // Fall through to default UI if the custom fallback itself throws.
      }
    }

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.iconWrap}>
            <AppIcon name="box" size={48} color={colors.saffronDark} />
          </View>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.subtitle}>
            The app hit an unexpected error. You can safely try again — your
            cart, account, and recent activity are saved on the device.
          </Text>
          {__DEV__ && error?.message ? (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>Dev info</Text>
              <Text style={styles.debugText} numberOfLines={8}>
                {String(error.message)}
              </Text>
            </View>
          ) : null}
          <Button
            label="Restart"
            onPress={this.reset}
            variant="primary"
            size="md"
            style={styles.btn}
          />
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    maxWidth: 360,
  },
  debugBox: {
    width: '100%',
    maxWidth: 480,
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.lg,
  },
  debugTitle: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
  },
  debugText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'monospace',
  },
  btn: {
    minWidth: 180,
  },
});

export default ErrorBoundary;
