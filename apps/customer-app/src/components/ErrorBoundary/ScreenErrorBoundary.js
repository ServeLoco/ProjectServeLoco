import React, { useCallback, useContext, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import ErrorBoundary from './ErrorBoundary';
import AppIcon from '../AppIcon';
import Button from '../Button';
import { colors, spacing, typography } from '../../theme';
import { recordHandledError, logBreadcrumb } from '../../utils/crashReporting';

/**
 * A crash barrier around ONE screen.
 *
 * The app had a single ErrorBoundary, at the root. That meant any render
 * error — a product with a missing field, an order whose items came back
 * null — replaced the ENTIRE app with the recovery screen: tab bar gone,
 * navigation history gone, cart screen unreachable, nothing to do but
 * restart. One malformed row in one list took out everything.
 *
 * Wired in through each navigator's `screenLayout`, so every screen gets its
 * own barrier without touching 30 individual registrations. A screen that
 * throws now shows this card in its own place; every other screen, the tab
 * bar and the back stack keep working.
 *
 * The root boundary in App.js stays as the last line of defence for anything
 * outside a screen (the navigation container itself, the toast host).
 */
function ScreenFallback({ routeName, error, reset }) {
  // Read the context directly rather than useNavigation(): that hook THROWS
  // when there is no navigator above it. A fallback that can throw defeats the
  // whole point — the boundary would fail to render its own recovery UI and
  // the error would escape to the root boundary, blanking the app exactly as
  // before. Undefined here just means no back button.
  const navigation = useContext(NavigationContext);
  let canGoBack = false;
  try {
    canGoBack = typeof navigation?.canGoBack === 'function' && navigation.canGoBack();
  } catch (_) {
    canGoBack = false;
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <AppIcon name="warning" size={32} color={colors.saffronDark} />
      </View>
      <Text style={styles.title}>This screen ran into a problem</Text>
      <Text style={styles.subtitle}>
        The rest of the app is still working. Go back and try again.
      </Text>
      {__DEV__ && error?.message ? (
        <Text style={styles.debugText} numberOfLines={6}>
          {routeName ? `[${routeName}] ` : ''}{String(error.message)}
        </Text>
      ) : null}
      <View style={styles.actions}>
        {canGoBack ? (
          <Button
            label="Go back"
            onPress={() => {
              // Reset first: the boundary is still holding the error, and the
              // screen stays mounted underneath while it pops. Without this it
              // would re-render the broken tree on the way out.
              reset();
              try {
                navigation.goBack();
              } catch (_) {
                // Nothing to go back to — the reset above already re-rendered.
              }
            }}
            variant="primary"
            size="md"
            style={styles.btn}
          />
        ) : null}
        <Button
          label="Try again"
          onPress={reset}
          variant={canGoBack ? 'secondary' : 'primary'}
          size="md"
          style={styles.btn}
        />
      </View>
    </View>
  );
}

export default function ScreenErrorBoundary({ routeName, children }) {
  // Counts retries so the breadcrumb says "attempt 3" — a screen that throws
  // again the moment it re-renders looks identical to a one-off in the crash
  // report otherwise, and the two need very different fixes.
  const failuresRef = useRef(0);

  const handleError = useCallback(
    (error, componentStack) => {
      failuresRef.current += 1;
      logBreadcrumb(
        `Screen render error: ${routeName || 'unknown'} (attempt ${failuresRef.current})`
      );
      if (componentStack) {
        logBreadcrumb(`Component: ${String(componentStack).split('\n')[1] || ''}`.trim());
      }
      recordHandledError(error, `ScreenRenderError:${routeName || 'unknown'}`);
    },
    [routeName]
  );

  const renderFallback = useCallback(
    ({ error, reset }) => <ScreenFallback routeName={routeName} error={error} reset={reset} />,
    [routeName]
  );

  return (
    <ErrorBoundary onError={handleError} fallback={renderFallback}>
      {children}
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.bgApp,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.saffronLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 320,
  },
  debugText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  btn: {
    minWidth: 140,
  },
});
