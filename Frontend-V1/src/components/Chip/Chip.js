import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from 'react-native';
import { colors, typography, spacing, radius, layout } from '../../theme';

/**
 * Chip
 * Single filter/tag chip.
 *
 * Props:
 *   label    - chip text
 *   active   - selected state
 *   onPress  - press handler
 *   style    - container style
 */
function Chip({ label, active = false, onPress, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        active ? styles.chipActive : styles.chipInactive,
        style,
      ]}
    >
      <Text
        style={[styles.label, active ? styles.labelActive : styles.labelInactive]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * ChipRow
 * Horizontally scrollable chip row.
 *
 * Props:
 *   chips          - array of { key, label }
 *   activeKey      - the currently selected chip key
 *   onChipPress    - called with key
 *   style          - container style
 *   contentStyle   - ScrollView content container style
 */
function ChipRow({ chips = [], activeKey, onChipPress, style, contentStyle }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={style}
      contentContainerStyle={[styles.row, contentStyle]}
    >
      {chips.map(chip => (
        <Chip
          key={chip.key}
          label={chip.label}
          active={chip.key === activeKey}
          onPress={() => onChipPress && onChipPress(chip.key)}
          style={styles.rowChip}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: layout.chipHeight,
    paddingHorizontal: layout.chipPaddingH,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  chipActive: {
    backgroundColor: colors.primary,
  },
  chipInactive: {
    backgroundColor: colors.bgDisabled,
  },
  label: {
    ...typography.labelSmall,
  },
  labelActive: {
    color: colors.primaryText,
    fontWeight: '600',
  },
  labelInactive: {
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    gap: spacing.chipGap,
  },
  rowChip: {
    flexShrink: 0,
  },
});

export { Chip, ChipRow };
export default Chip;
