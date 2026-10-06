import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import AppIcon from '../AppIcon';
import { colors } from '../../theme';

// Same yellow as the Profile screen's star.
const STAR_COLOR = '#FBBF24';
const STARS = [1, 2, 3, 4, 5];

/**
 * Five stars in a row. Tapping the Nth star rates N out of 5.
 * `disabled` shows the saved stars read-only.
 */
function StarRating({ value = 0, onChange, disabled = false, size = 20, style }) {
  const current = Number(value) || 0;

  return (
    <View
      style={[styles.row, style]}
      accessible={disabled}
      accessibilityLabel={disabled ? `Rated ${current} out of 5` : undefined}
    >
      {STARS.map((n) => {
        const filled = n <= current;
        return (
          <Pressable
            key={n}
            onPress={() => onChange?.(n)}
            disabled={disabled}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            style={styles.star}
            accessibilityRole="button"
            accessibilityLabel={`Rate ${n} out of 5`}
            accessibilityState={{ selected: filled, disabled }}
          >
            <AppIcon
              name="star"
              size={size}
              color={filled ? STAR_COLOR : colors.borderStrong}
              fill={filled ? STAR_COLOR : 'none'}
              strokeWidth={2}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  star: {
    padding: 3,
  },
});

export default StarRating;
