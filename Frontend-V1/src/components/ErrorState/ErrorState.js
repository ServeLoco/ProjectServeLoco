import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import Button from '../Button';

/**
 * ErrorState
 * Shows an error message with a retry button.
 *
 * Props:
 *   message     - error description
 *   onRetry     - retry handler (shows Retry button when provided)
 *   retryLabel  - custom retry button label (default: 'Retry')
 *   icon        - optional ReactNode icon above message
 *   style       - container style
 */
function ErrorState({ message, onRetry, retryLabel = 'Retry', icon, style }) {
  return (
    <View style={[styles.container, style]}>
      {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
      <Text style={styles.title}>Something went wrong</Text>
      {message ? (
        <Text style={styles.message}>{message}</Text>
      ) : null}
      {onRetry ? (
        <Button
          label={retryLabel}
          onPress={onRetry}
          variant="outline"
          size="md"
          fullWidth={false}
          style={styles.btn}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  iconWrap: {
    marginBottom: spacing.md,
    opacity: 0.6,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  btn: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
});

export default ErrorState;
