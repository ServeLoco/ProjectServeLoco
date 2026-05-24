import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, typography, spacing, radius, shadows } from '../../theme';

/**
 * SegmentedControl
 * Two-option segmented toggle — used for Packed Items / Fast Food switcher.
 *
 * Props:
 *   options    - array of exactly 2 strings e.g. ['Packed Items', 'Fast Food']
 *   value      - current selected option (string)
 *   onChange   - called with the newly selected option string
 *   style      - container style override
 */
function SegmentedControl({
  options = [],
  value,
  selectedOption,
  onChange,
  onSelect,
  style,
}) {
  if (!options || options.length !== 2) return null;
  const activeValue = value ?? selectedOption;
  const handleChange = onChange || onSelect;

  return (
    <View style={[styles.track, style]}>
      {options.map(opt => {
        const isActive = opt === activeValue;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => handleChange && handleChange(opt)}
            style={[styles.segment, isActive && styles.activeSegment]}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={opt}
          >
            <Text
              style={[styles.label, isActive && styles.activeLabel]}
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
    backgroundColor: colors.bgInput,
    borderRadius: radius.pill,
    padding: 2,
    height: 40,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
  },
  activeSegment: {
    backgroundColor: colors.primary,
    ...shadows.xs,
  },
  label: {
    ...typography.label,
    color: colors.textSecondary,
  },
  activeLabel: {
    ...typography.labelLarge,
    color: colors.primaryText,
    fontWeight: '700',
  },
});

export default SegmentedControl;
