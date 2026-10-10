import { Animated } from 'react-native';

// The location row leaves first, leaving Search pinned at the top.
export function createHomeHeaderTranslateY(scrollY, { topRowHeight }) {
  const collapseDistance = Math.max(topRowHeight, 1);
  return scrollY.interpolate({
    inputRange: [0, collapseDistance],
    outputRange: [0, -collapseDistance],
    extrapolate: 'clamp',
  });
}

// Scroll offset where the mode row reaches the lower edge of what stays
// pinned above it (Search, pinnedHeight) and pins there, or null when there
// is no mode row to pin.
export function homeModesPinStart({ topRowHeight, pinnedHeight, shopModesY }) {
  if (shopModesY == null || pinnedHeight <= 0) return null;
  return Math.max(Math.max(topRowHeight, 1), shopModesY - pinnedHeight);
}

// Holds the mode row under Search once it gets there: from the pin point on,
// it moves down exactly as far as the page scrolls up.
export function createHomeModesTranslateY(scrollY, pinStart) {
  if (pinStart == null) return new Animated.Value(0);
  return scrollY.interpolate({
    inputRange: [pinStart, pinStart + 1],
    outputRange: [0, 1],
    extrapolateLeft: 'clamp',
    extrapolateRight: 'extend',
  });
}
