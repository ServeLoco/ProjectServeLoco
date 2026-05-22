import React from 'react';
import { View } from 'react-native';
import { staggerMs } from '../../theme';
import AnimatedFadeSlide from '../AnimatedFadeSlide';

function StaggeredList({
  children,
  delayStep = staggerMs,
  itemDistance,
  itemStyle,
  style,
}) {
  const items = React.Children.toArray(children).filter(Boolean);

  return (
    <View style={style}>
      {items.map((child, index) => (
        <AnimatedFadeSlide
          key={child.key || `staggered-item-${index}`}
          delay={index * delayStep}
          distance={itemDistance}
          style={itemStyle}
        >
          {child}
        </AnimatedFadeSlide>
      ))}
    </View>
  );
}

export default StaggeredList;
