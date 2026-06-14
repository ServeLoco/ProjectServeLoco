import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, easing, smallMs, typography } from '../../theme';
import { useReducedMotion } from '../../utils';

function ValidationMessage({ message, shakeKey, style }) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(message ? 1 : 0)).current;
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: message ? 1 : 0,
      duration: reducedMotion ? 0 : smallMs,
      easing,
      useNativeDriver: true,
    }).start();
  }, [message, opacity, reducedMotion]);

  useEffect(() => {
    if (!message || reducedMotion) return;

    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }, [message, reducedMotion, shake, shakeKey]);

  if (!message) return null;

  const translateX = shake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [-5, 0, 5],
  });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Text style={[styles.message, style]}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  message: {
    ...typography.caption,
    color: colors.error,
  },
});

export default ValidationMessage;
