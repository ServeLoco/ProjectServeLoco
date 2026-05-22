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

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
    >
      {({ pressed }) => (
        <Animated.View
          style={[
            style,
            disabled && styles.disabled,
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
