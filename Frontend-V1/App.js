import React from 'react';
import { StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { assertNoEmoji } from './src/utils/noEmojiCheck';
import { colors, typography, spacing, radius, shadows } from './src/theme';

function App() {
  const message = 'Welcome to ServeLoco';
  assertNoEmoji(message, 'App Title');

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" backgroundColor={colors.bgApp} />
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>V1</Text>
          </View>
          <Text style={styles.title}>{message}</Text>
          <Text style={styles.subtitle}>
            App shell and theme tokens are ready. Tasks F-01 and F-02 complete.
          </Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.screenPaddingH,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    padding: spacing.cardPadding,
    width: '100%',
    alignItems: 'center',
    ...shadows.card,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
  },
  badgeText: {
    ...typography.captionMedium,
    color: colors.primaryDark,
    letterSpacing: 1,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default App;
