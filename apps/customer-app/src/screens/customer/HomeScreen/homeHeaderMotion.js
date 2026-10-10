import { Animated } from 'react-native';

// The location row leaves first, leaving Search pinned at the top. Once the
// mode row reaches Search (pinStart) it pushes Search up and out, scroll for
// scroll, until the modes sit at the top in its place.
export function createHomeHeaderTranslateY(scrollY, { topRowHeight, pinnedHeight }, pinStart = null) {
  const collapseDistance = Math.max(topRowHeight, 1);
  const inputRange = [0, collapseDistance];
  const outputRange = [0, -collapseDistance];
  if (pinStart != null && pinnedHeight > 0) {
    // pinStart is never below collapseDistance; skip a zero-length step.
    if (pinStart > collapseDistance) {
      inputRange.push(pinStart);
      outputRange.push(-collapseDistance);
    }
    inputRange.push(pinStart + pinnedHeight);
    outputRange.push(-collapseDistance - pinnedHeight);
  }
  return scrollY.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
}

// Scroll offset where the mode row reaches the lower edge of what stays
// pinned above it (Search, pinnedHeight), or null when there is no mode row.
export function homeModesPinStart({ topRowHeight, pinnedHeight, shopModesY }) {
  if (shopModesY == null || pinnedHeight <= 0) return null;
  return Math.max(Math.max(topRowHeight, 1), shopModesY - pinnedHeight);
}

// Scroll offset where the mode row has pushed Search out and reaches the top.
export function homeModesTopPin(pinStart, pinnedHeight) {
  return pinStart == null ? null : pinStart + Math.max(pinnedHeight, 0);
}

// How far Search has been pushed up by the mode row at a scroll offset.
export function homeSearchPushed(offset, pinStart, pinnedHeight) {
  if (pinStart == null) return 0;
  return Math.min(Math.max(offset - pinStart, 0), Math.max(pinnedHeight, 0));
}

// Holds the mode row at the top once it gets there: from the pin point on,
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
