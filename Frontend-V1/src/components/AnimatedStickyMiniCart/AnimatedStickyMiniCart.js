import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { easing, layout, smallMs } from '../../theme';
import { useReducedMotion } from '../../utils';
import StickyMiniCart from '../StickyMiniCart';

function AnimatedStickyMiniCart({ visible = true, itemCount = 0, style, ...props }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(visible && itemCount > 0 ? 1 : 0)).current;
  const isVisible = visible && itemCount > 0;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(isVisible ? 1 : 0);
      return;
    }

    Animated.timing(progress, {
      toValue: isVisible ? 1 : 0,
      duration: smallMs,
      easing,
      useNativeDriver: true,
    }).start();
  }, [isVisible, progress, reducedMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [layout.stickyCartHeight + 32, 0],
  });

  if (!isVisible && progress.__getValue?.() === 0) return null;

  return (
    <Animated.View
      pointerEvents={isVisible ? 'auto' : 'none'}
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY }],
        },
      ]}
    >
      <StickyMiniCart {...props} visible itemCount={itemCount} />
    </Animated.View>
  );
}

export default AnimatedStickyMiniCart;
