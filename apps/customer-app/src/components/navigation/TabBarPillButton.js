import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius } from '../../theme';
import AppIcon from '../AppIcon';

/**
 * Bottom-tab button: the active tab grows a brand-gradient pill holding its
 * icon and label side by side, idle tabs show the same pair in the muted
 * navigation colour.
 *
 * Shared by the rider and shop-owner shells so both bars behave identically —
 * only the tabs themselves differ.
 *
 * @param {string} name    AppIcon name
 * @param {string} label   text beside the icon
 * @param {boolean} hideIcon  text-only pill, no icon (shop-owner bar)
 */
export default function TabBarPillButton({
  name,
  label,
  hideIcon,
  onPress,
  onLongPress,
  accessibilityState,
  testID,
  ...rest
}) {
  // v7 reports selection via aria-selected; older releases via accessibilityState.
  const focused = Boolean(accessibilityState?.selected ?? rest['aria-selected']);
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    // Opacity/transform only, so this runs on the UI thread and a tab switch
    // never waits on JS. Animating the pill's width instead would relayout
    // every frame on the JS thread, which is what made switching feel laggy.
    Animated.timing(anim, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, focused]);

  const inverse = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      style={styles.tabButton}
    >
      <View style={styles.tabItem}>
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: anim }]}>
          <LinearGradient
            colors={[colors.brandGradientStart, colors.brandGradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {!hideIcon && (
          <View style={styles.iconStack}>
            <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, { opacity: inverse }]}>
              <AppIcon name={name} color={colors.navInactive} size={21} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.iconLayer, { opacity: anim }]}>
              <AppIcon name={name} color={colors.textInverse} size={21} />
            </Animated.View>
          </View>
        )}

        <View style={[styles.labelSlot, hideIcon && styles.labelSlotNoIcon]}>
          <Animated.Text
            style={[styles.tabLabel, styles.tabLabelIdle, { opacity: inverse }]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
          <Animated.Text
            style={[styles.tabLabel, styles.tabLabelActive, { opacity: anim }]}
            numberOfLines={1}
          >
            {label}
          </Animated.Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 36,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  iconStack: {
    width: 24,
    height: 24,
  },
  iconLayer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelSlot: {
    height: 18,
    marginLeft: 7,
    justifyContent: 'center',
  },
  labelSlotNoIcon: {
    marginLeft: 0,
  },
  tabLabel: {
    fontWeight: '900',
    fontSize: 13,
  },
  // Stacked so the two colours cross-fade without changing layout.
  tabLabelIdle: { color: colors.navInactive },
  tabLabelActive: { ...StyleSheet.absoluteFillObject, color: colors.textInverse },
});
