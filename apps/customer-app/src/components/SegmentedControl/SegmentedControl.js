import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../../theme';

/**
 * SegmentedControl
 * Two-option segmented toggle — used for Packed Items / Fast Food switcher.
 * Now featuring hardware-accelerated fluid spring animation and modern styling.
 *
 * Props:
 *   options    - array of exactly 2 strings e.g. ['Packed Items', 'Fast Food']
 *   value      - current selected option (string)
 *   selectedOption - fallback current selected option
 *   onChange   - called with the newly selected option string
 *   onSelect   - fallback change handler
 *   style      - container style override
 *   disabled   - disable interactivity
 */
function SegmentedControl({
  options = [],
  value,
  selectedOption,
  onChange,
  onSelect,
  style,
  disabled,
}) {
  if (!options || options.length !== 2) return null;
  const activeValue = value ?? selectedOption;
  const handleChange = onChange || onSelect;

  const [trackWidth, setTrackWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(options.indexOf(activeValue) === 1 ? 1 : 0)).current;

  useEffect(() => {
    const selectedIndex = options.indexOf(activeValue);
    const targetValue = selectedIndex === -1 ? 0 : selectedIndex;
    Animated.spring(slideAnim, {
      toValue: targetValue,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start();
  }, [activeValue, options, slideAnim]);

  // Indicator width is half of the container width minus the padding/borders
  const indicatorWidth = trackWidth ? (trackWidth - 6) / 2 : 0;
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, indicatorWidth],
  });

  return (
    <View
      style={[styles.track, style, disabled && styles.disabledTrack]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {trackWidth > 0 && (
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              width: indicatorWidth,
              transform: [{ translateX }],
            },
          ]}
        />
      )}
      {options.map((opt) => {
        const isActive = opt === activeValue;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => !disabled && handleChange && handleChange(opt)}
            disabled={disabled}
            style={styles.segment}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt}
          >
            <Text
              style={[
                styles.label,
                isActive && styles.activeLabel,
                disabled && styles.disabledLabel,
              ]}
              numberOfLines={1}
            >
              {opt}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6', // Extra clean off-white background
    borderRadius: radius.pill,
    padding: 3,
    height: 42,
    borderWidth: 1.5,
    borderColor: colors.borderStrong || '#DFE2E6',
    position: 'relative',
  },
  disabledTrack: {
    opacity: 0.6,
  },
  activeIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    backgroundColor: colors.primary || '#0E1116',
    borderRadius: radius.pill,
    ...shadows.sm,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    zIndex: 2,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeLabel: {
    ...typography.labelLarge,
    color: colors.primaryText || '#FFFFFF',
    fontWeight: '700',
  },
  disabledLabel: {
    color: colors.textDisabled,
  },
});

export default SegmentedControl;
