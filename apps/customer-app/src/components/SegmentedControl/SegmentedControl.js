import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, Animated } from 'react-native';
import { colors, typography, spacing } from '../../theme';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * SegmentedControl
 * Two-option segmented toggle with premium animation:
 *   - Smooth spring-animated saffron slider
 *   - Per-option press scale feedback
 *   - Subtle "land" pulse on the slider when it snaps into place
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
  const activeIndex = Math.max(0, options.indexOf(activeValue));

  const [trackWidth, setTrackWidth] = useState(0);
  const slideAnim = useRef(new Animated.Value(activeIndex === 1 ? 1 : 0)).current;
  const landAnim = useRef(new Animated.Value(1)).current;
  const pressScales = useRef(options.map(() => new Animated.Value(1))).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: activeIndex,
      tension: 90,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slideAnim]);

  // Subtle "land" pulse on the slider when the active option changes
  useEffect(() => {
    landAnim.setValue(0.92);
    Animated.spring(landAnim, {
      toValue: 1,
      friction: 4,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, landAnim]);

  const animatePress = (idx, toValue) => {
    Animated.spring(pressScales[idx], {
      toValue,
      friction: 5,
      tension: 220,
      useNativeDriver: true,
    }).start();
  };

  // Indicator width is half of the container width minus the padding (2 * inset)
  const indicatorWidth = trackWidth ? (trackWidth - 14) / 2 : 0;
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
              transform: [{ translateX }, { scale: landAnim }],
            },
          ]}
        >
          {/* Base saffron gradient — lighter on the left, deeper on the right */}
          <LinearGradient
            colors={[colors.saffron, colors.saffronDark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 17 }]}
          />
          {/* Top-left highlight wash — adds a glossy lift */}
          <LinearGradient
            colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 17 }]}
            pointerEvents="none"
          />
          {/* Bottom edge darkening — adds depth */}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(122, 36, 0, 0.18)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[StyleSheet.absoluteFillObject, { borderRadius: 17 }]}
            pointerEvents="none"
          />
        </Animated.View>
      )}
      {options.map((opt, idx) => {
        const isActive = idx === activeIndex;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => !disabled && handleChange && handleChange(opt)}
            disabled={disabled}
            activeOpacity={1}
            onPressIn={() => animatePress(idx, 0.95)}
            onPressOut={() => animatePress(idx, 1)}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt}
          >
            <Animated.View
              style={[
                styles.segmentInner,
                { transform: [{ scale: pressScales[idx] }] },
              ]}
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
            </Animated.View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 4,
    height: 48,
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  disabledTrack: {
    opacity: 0.6,
  },
  activeIndicator: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    left: 7,
    backgroundColor: colors.saffron,
    borderRadius: 17,
    shadowColor: '#C8490F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 21,
    paddingHorizontal: spacing.sm,
    zIndex: 2,
  },
  segmentInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.body,
    color: '#6B7280',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  activeLabel: {
    ...typography.body,
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  disabledLabel: {
    color: colors.textDisabled,
  },
});

export default SegmentedControl;
