import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { easing, entryDistance, screenMs } from '../../theme';
import { useReducedMotion } from '../../utils';

function AnimatedFadeSlide({
  children,
  delay = 0,
  distance = entryDistance,
  duration = screenMs,
  direction = 'up',
  style,
  visible = true,
}) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(visible ? 0 : 1)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }

    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration,
      delay: visible ? delay : 0,
      easing,
      useNativeDriver: true,
    }).start();
  }, [delay, duration, progress, reducedMotion, visible]);

  const axis = direction === 'left' || direction === 'right' ? 'translateX' : 'translateY';
  const startDistance = direction === 'down' || direction === 'right' ? -distance : distance;
  const translate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [startDistance, 0],
  });

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ [axis]: translate }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export default AnimatedFadeSlide;
