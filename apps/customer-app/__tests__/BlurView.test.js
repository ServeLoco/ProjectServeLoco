/**
 * src/components/BlurView — expo-blur on iOS, a plain tinted View on Android.
 *
 * On Android, without experimentalBlurMethod, expo-blur only paints a
 * translucent background colour, but its native view also asks for the
 * current Activity whenever it attaches — which crashed the app when the
 * Activity was gone (Crashlytics, 1.9.5). The Android view must paint exactly
 * what expo-blur painted, so the screens look the same.
 */
import React from 'react';
import { Text, View, Platform } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { BlurView as ExpoBlurView } from 'expo-blur';
import BlurView, { androidTintColor } from '../src/components/BlurView';

const ORIGINAL_OS = Platform.OS;

function render(element) {
  let root;
  act(() => {
    root = ReactTestRenderer.create(element);
  });
  return root;
}

describe('androidTintColor', () => {
  // Expected values computed with expo-blur 15.0.8's own TintStyle.kt formula
  // on the JVM (Float/Double rules included), for every tint/intensity pair
  // the app uses. A full sweep of all 21 tints × 0–100 matched as well.
  it.each([
    ['dark', 28, '#19191931'],
    ['dark', 30, '#19191934'],
    ['dark', 32, '#19191938'],
    ['dark', 35, '#1919193d'],
    ['dark', 40, '#19191946'],
    ['light', 22, '#f9f9f92b'],
    ['light', 40, '#f9f9f94f'],
  ])('%s at %i is %s', (tint, intensity, colour) => {
    expect(androidTintColor(tint, intensity)).toBe(colour);
  });

  it('uses expo-blur defaults: tint "default", intensity 50', () => {
    expect(androidTintColor()).toBe('#ffffff38');
  });

  it('folds aliased tints onto the colour expo-blur uses for them', () => {
    expect(androidTintColor('systemMaterialDark', 40)).toBe(androidTintColor('dark', 40));
    expect(androidTintColor('extraLight', 22)).toBe(androidTintColor('light', 22));
  });
});

describe('BlurView', () => {
  afterEach(() => {
    Platform.OS = ORIGINAL_OS;
  });

  it('on Android renders no expo-blur view, just the tint behind the children', () => {
    Platform.OS = 'android';
    const root = render(
      <BlurView intensity={35} tint="dark" style={{ height: 10 }} testID="glass">
        <Text>inside</Text>
      </BlurView>
    );

    expect(root.root.findAllByType(ExpoBlurView)).toHaveLength(0);

    // The View it renders, not the BlurView element that also carries testID.
    const box = root.root.find((node) => node.type === View && node.props.testID === 'glass');
    expect(box.props.style).toEqual([{ backgroundColor: 'transparent' }, { height: 10 }]);

    // Tint first (behind), then the caller's children.
    const [tintLayer, child] = box.props.children;
    expect(tintLayer.type).toBe(View);
    expect(tintLayer.props.pointerEvents).toBe('none');
    expect(tintLayer.props.style[1]).toEqual({ backgroundColor: '#1919193d' });
    expect(child.props.children).toBe('inside');
  });

  it('on iOS renders the real expo-blur view with the same props', () => {
    Platform.OS = 'ios';
    const root = render(<BlurView intensity={22} tint="light" />);

    const blur = root.root.findByType(ExpoBlurView);
    expect(blur.props).toMatchObject({ intensity: 22, tint: 'light' });
  });
});
