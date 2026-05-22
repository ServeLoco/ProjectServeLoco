import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { easing, smallMs } from '../../theme';
import { useReducedMotion } from '../../utils';
import QuantityStepper from '../QuantityStepper';

function AnimatedQuantitySwitcher({ quantity = 0, style, ...props }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(quantity > 0 ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(quantity > 0 ? 1 : 0);
      return;
    }

    Animated.timing(progress, {
      toValue: quantity > 0 ? 1 : 0,
      duration: smallMs,
      easing,
      useNativeDriver: false,
    }).start();
  }, [progress, quantity, reducedMotion]);

  const minWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [72, 104],
  });

  return (
    <Animated.View style={[style, { minWidth, opacity: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.94, 1],
    }) }]}>
      <QuantityStepper quantity={quantity} {...props} />
    </Animated.View>
  );
}

export default AnimatedQuantitySwitcher;
