import React from 'react';
import { StyleSheet, View, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme';

/**
 * AppScreen
 * Base screen wrapper with safe-area, status bar, and background color.
 *
 * On Android 15+ status/nav bar colors via Window APIs are deprecated (edge-to-edge).
 * We only set barStyle for icon contrast; the SafeAreaView bg draws under the bar.
 *
 * Props:
 *   children       - screen content
 *   style          - additional style for the inner content container
 *   bg             - background color override (default: colors.bgApp)
 *   edges          - SafeAreaView edges (default: ['top','bottom','left','right'])
 *   statusBarStyle - 'dark-content' | 'light-content' (default: 'dark-content')
 *   noPadding      - if true, removes horizontal screen padding
 */
function AppScreen({
  children,
  style,
  bg = colors.bgApp,
  edges,
  safeAreaTop = true,
  safeAreaBottom = true,
  safeAreaLeft = true,
  safeAreaRight = true,
  statusBarStyle = 'dark-content',
  noPadding = false,
}) {
  const resolvedEdges = edges || [
    safeAreaTop && 'top',
    safeAreaBottom && 'bottom',
    safeAreaLeft && 'left',
    safeAreaRight && 'right',
  ].filter(Boolean);

  return (
    <SafeAreaView
      edges={resolvedEdges}
      style={[styles.safeArea, { backgroundColor: bg }]}
    >
      {/* barStyle only — no backgroundColor (deprecated on Android 15+) */}
      <StatusBar barStyle={statusBarStyle} />
      <View style={[styles.content, noPadding && styles.noPadding, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  noPadding: {
    paddingHorizontal: 0,
  },
});

export default AppScreen;
