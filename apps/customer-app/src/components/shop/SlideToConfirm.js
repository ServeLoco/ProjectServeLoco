import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, PanResponder, StyleSheet, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, shadows } from '../../theme';
import AppIcon from '../AppIcon';

const THUMB_SIZE = 52;
const TRACK_PAD = 5;

/**
 * Slide-to-confirm button — same mechanics as the rider offer sheet.
 * Shared by the shop's new-order popup (accept) and the active order card
 * (mark ready) so both confirm gestures feel identical.
 *
 * @param {string} label            text shown on the track
 * @param {boolean} busy            shows a spinner in the thumb
 * @param {boolean} disabled        blocks the gesture
 * @param {() => void} onConfirm    fired once the thumb passes 70% of the track
 * @param {Animated.Value} [progressAnim] 0→1 drain overlay (accept countdown)
 * @param {[string, string]} [gradient]   track gradient colors
 * @param {number} [height]         track height; thumb scales with it
 */
export default function SlideToConfirm({
  label,
  busy,
  disabled,
  onConfirm,
  progressAnim,
  gradient = [colors.btnSuccessStart, colors.btnSuccessEnd],
  height,
}) {
  const thumbSize = height ? height - TRACK_PAD * 2 : THUMB_SIZE;
  const [trackWidth, setTrackWidth] = useState(0);
  const maxTranslate = Math.max(trackWidth - thumbSize - TRACK_PAD * 2, 1);
  const maxTranslateRef = useRef(maxTranslate);
  useEffect(() => { maxTranslateRef.current = maxTranslate; }, [maxTranslate]);

  const translateX = useRef(new Animated.Value(0)).current;
  const wasBusyRef = useRef(false);
  useEffect(() => {
    if (wasBusyRef.current && !busy) {
      Animated.timing(translateX, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    }
    wasBusyRef.current = busy;
  }, [busy, translateX]);

  const arrowAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(arrowAnim, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [arrowAnim]);
  const chevronShift = arrowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current && !busyRef.current,
      onMoveShouldSetPanResponder: (evt, gesture) => (
        !disabledRef.current && !busyRef.current && Math.abs(gesture.dx) > 4
      ),
      onPanResponderMove: (evt, gesture) => {
        const x = Math.min(Math.max(gesture.dx, 0), maxTranslateRef.current);
        translateX.setValue(x);
      },
      onPanResponderRelease: (evt, gesture) => {
        if (gesture.dx >= maxTranslateRef.current * 0.7) {
          Animated.timing(translateX, { toValue: maxTranslateRef.current, duration: 150, useNativeDriver: false }).start();
          onConfirmRef.current();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
        }
      },
    })
  ).current;

  const textOpacity = translateX.interpolate({
    inputRange: [0, Math.max(maxTranslate * 0.6, 1)],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={[
        styles.slideTrack,
        { height: thumbSize + TRACK_PAD * 2, opacity: disabled && !busy ? 0.6 : 1 },
      ]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <LinearGradient
        colors={gradient}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      />
      {progressAnim ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.fillOverlay,
            { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      ) : null}
      <Animated.Text
        style={[styles.slideTrackText, { paddingLeft: thumbSize + TRACK_PAD * 2, opacity: textOpacity }]}
      >
        {label}
      </Animated.Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.slideThumb,
          { width: thumbSize, height: thumbSize, transform: [{ translateX }] },
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.success} />
        ) : (
          <View style={styles.slideThumbChevrons}>
            <Animated.View style={{ transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={colors.success} />
            </Animated.View>
            <Animated.View style={{ marginLeft: -14, transform: [{ translateX: chevronShift }] }}>
              <AppIcon name="chevronRight" size={22} color={colors.success} />
            </Animated.View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slideTrack: {
    flex: 1, borderRadius: radius.circle,
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center', padding: TRACK_PAD,
  },
  fillOverlay: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
  slideTrackText: {
    color: '#FFFFFF', fontWeight: '800', fontSize: 16, textAlign: 'center',
  },
  slideThumb: {
    position: 'absolute', left: TRACK_PAD, top: TRACK_PAD,
    borderRadius: radius.circle, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', ...shadows.sm,
  },
  slideThumbChevrons: { flexDirection: 'row', alignItems: 'center' },
});
