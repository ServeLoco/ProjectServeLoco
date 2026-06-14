import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { easing, tapMs } from '../../theme';
import { useReducedMotion } from '../../utils';

function PressableScale({
  children,
  disabled = false,
  onPress,
  scaleTo = 0.97,
  style,
  accessibilityState,
  ...pressableProps
}) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = value => {
    if (reducedMotion) return;
    Animated.timing(scale, {
      toValue: value,
      duration: tapMs,
      easing,
      useNativeDriver: true,
    }).start();
  };

  // Ensure disabled is always a boolean
  const isDisabled = Boolean(disabled);

  return (
    <Pressable
      {...pressableProps}
      disabled={isDisabled}
      onPress={onPress}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
      accessibilityState={accessibilityState ? { ...accessibilityState, disabled: isDisabled } : undefined}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            style,
            isDisabled && styles.disabled,
            pressed && reducedMotion && styles.pressedReducedMotion,
            {
              transform: [{ scale }],
            },
          ]}
        >
          {typeof children === 'function' ? children({ pressed }) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.5,
  },
  pressedReducedMotion: {
    opacity: 0.78,
  },
});

export default PressableScale;
