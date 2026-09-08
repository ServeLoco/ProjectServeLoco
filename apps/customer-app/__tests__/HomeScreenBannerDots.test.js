/**
 * Regression test for the offer-banner scroll indicator.
 *
 * Bug: the dot indicator animated `width` off `scrollX`, which forced the
 * whole onScroll `Animated.event` onto `useNativeDriver: false`. Every
 * banner swipe frame then round-tripped through the JS bridge, showing up
 * as excessive slow frames in Play Console vitals during home-screen
 * scrolling. Fix: animate `transform: scaleX` instead (native-driver
 * compatible) against a fixed-width dot, and flip the listener back to
 * `useNativeDriver: true`.
 *
 * There is no @testing-library/react-native in this project — screen
 * tests assert against the component source instead of rendering (see
 * HomeScreenBackExit.test.js), so this follows the same convention.
 */

const fs = require('fs');
const path = require('path');

const homeScreenPath = path.join(
  __dirname, '..', 'src', 'screens', 'customer', 'HomeScreen', 'HomeScreen.js'
);
const source = fs.readFileSync(homeScreenPath, 'utf8');

describe('HomeScreen offer-banner dot indicator runs on the native driver', () => {
  it('drives the onScroll listener with useNativeDriver: true', () => {
    const onScrollMatch = source.match(
      /onScroll=\{Animated\.event\(\s*\[[\s\S]*?\]\s*,\s*\{\s*useNativeDriver:\s*(\w+)\s*\}\s*\)\}/
    );
    expect(onScrollMatch).not.toBeNull();
    expect(onScrollMatch[1]).toBe('true');
  });

  it('does not animate the dot via width interpolation', () => {
    expect(source).not.toMatch(/const dotWidth = scrollX\.interpolate/);
  });

  it('animates the dot via a native-driver-compatible transform: scaleX', () => {
    expect(source).toMatch(/const dotScaleX = scrollX\.interpolate/);
    expect(source).toMatch(/transform:\s*\[\{\s*scaleX:\s*dotScaleX\s*\}\]/);
  });

  it('gives offerDot a fixed base width so scaleX has something to scale', () => {
    const offerDotMatch = source.match(/offerDot:\s*\{([^}]*)\}/);
    expect(offerDotMatch).not.toBeNull();
    expect(offerDotMatch[1]).toMatch(/width:\s*22/);
  });
});
