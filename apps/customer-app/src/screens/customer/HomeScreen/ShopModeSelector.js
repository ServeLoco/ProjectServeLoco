import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppIcon from '../../../components/AppIcon';
import PressableScale from '../../../components/PressableScale';
import RetryingImage from '../../../components/ProductImage/RetryingImage';
import { resolveModeStyle } from '../../../components/SegmentedControl/modeStyles';
import { useReducedMotion } from '../../../utils/motionPreferences';
import NativeGlassView from '../../../utils/nativeGlass';

const GUTTER = 16;
const GAP = 10;
// Home pins this row under Search with a native-driven transform. On Android
// React's idea of its position does not follow that (it measured offscreen
// while pinned), so a finger moving a pixel looked like it left the card and
// cancelled the tap. Never cancel on vertical movement; scrolling the page
// still cancels.
const PINNED_PRESS_RETENTION = Platform.OS === 'android'
  ? { top: 100000, bottom: 100000, left: 20, right: 20 }
  : undefined;

function ShopModeCard({ mode, index, width, selected, onSelect, reducedMotion }) {
  const selection = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const look = resolveModeStyle(mode.slug, index);
  const iconUrl = mode.iconImageUrl || mode.icon_image_url;
  const label = mode.label || mode.slug;

  useEffect(() => {
    selection.stopAnimation();
    if (reducedMotion) {
      selection.setValue(selected ? 1 : 0);
      return undefined;
    }
    const animation = Animated.spring(selection, {
      toValue: selected ? 1 : 0,
      friction: 9,
      tension: 100,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, reducedMotion, selection]);

  return (
    <PressableScale
      onPress={() => { if (!selected) onSelect(mode.slug); }}
      pressRetentionOffset={PINNED_PRESS_RETENTION}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ width }}
    >
      <Animated.View
        style={[
          styles.card,
          NativeGlassView ? styles.glassCard : selected && styles.selectedCard,
          { transform: [{ translateY: selection.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
        ]}
      >
        {/* iPhone (Liquid Glass): the same native glass as the tab bar; the
            selected card gets a white tint instead of a solid white card. */}
        {NativeGlassView ? (
          <NativeGlassView
            glassEffectStyle="regular"
            colorScheme="light"
            isInteractive
            tintColor={selected ? 'rgba(255,255,255,0.6)' : undefined}
            style={styles.glass}
          />
        ) : null}
        <LinearGradient
          pointerEvents="none"
          colors={selected ? [look.color + '26', look.color + '05'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
          style={styles.cardTint}
        />
        <View style={[styles.iconBadge, { backgroundColor: iconUrl ? '#FFFFFF' : look.color }]}>
          {iconUrl ? (
            <RetryingImage uri={iconUrl} style={styles.iconImage} contentFit="cover" />
          ) : (
            <>
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0)']}
                style={StyleSheet.absoluteFill}
              />
              <AppIcon name={look.icon} size={28} color={look.iconColor || '#FFFFFF'} strokeWidth={2.2} />
            </>
          )}
        </View>
        <View style={styles.labelSlot}>
          <Text style={[styles.label, selected && styles.selectedLabel]} numberOfLines={2}>
            {label}
          </Text>
        </View>
        <Animated.View pointerEvents="none" style={[styles.selectionLine, { opacity: selection }]} />
      </Animated.View>
    </PressableScale>
  );
}

// The Home selector lives on the offer area's backdrop. Only the products
// below it change: Home owns the selected slug and the catalog request.
const ShopModeSelector = forwardRef(function ShopModeSelector({ modes = [], selectedMode, onSelect }, ref) {
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const rail = useRef(null);
  const railX = useRef(0);
  const canScroll = modes.length > 3;
  const count = Math.max(1, Math.min(modes.length, 3));
  const availableWidth = screenWidth - GUTTER * 2;
  const cardWidth = canScroll
    ? Math.max(96, Math.floor(availableWidth / 3.15))
    : Math.floor((availableWidth - (count - 1) * GAP) / count);
  const selectedIndex = modes.findIndex(mode => mode.slug === selectedMode);

  useEffect(() => {
    if (!canScroll || selectedIndex < 0) return;
    rail.current?.scrollTo({
      x: Math.max(0, selectedIndex * (cardWidth + GAP) - (availableWidth - cardWidth) / 2),
      animated: !reducedMotion,
    });
  }, [canScroll, selectedIndex, cardWidth, availableWidth, reducedMotion]);

  // Home calls this with a tap's screen x when the page's scroll view took
  // the tap before the card could (see HomeScreen). The row spans the screen.
  useImperativeHandle(ref, () => ({
    pressAt(pageX) {
      const x = pageX + railX.current - GUTTER;
      const step = cardWidth + GAP;
      const index = Math.floor(x / step);
      const mode = modes[index];
      if (!mode || x < 0 || x - index * step > cardWidth) return;
      if (mode.slug !== selectedMode) onSelect(mode.slug);
    },
  }), [modes, cardWidth, selectedMode, onSelect]);

  if (!modes.length) return null;

  return (
    <View style={styles.container}>
      <ScrollView
        ref={rail}
        horizontal
        scrollEnabled={canScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
        keyboardShouldPersistTaps="handled"
        onScroll={({ nativeEvent }) => { railX.current = nativeEvent.contentOffset.x; }}
        scrollEventThrottle={16}
      >
        {modes.map((mode, index) => (
          <ShopModeCard
            key={mode.slug}
            mode={mode}
            index={index}
            width={cardWidth}
            selected={mode.slug === selectedMode}
            onSelect={onSelect}
            reducedMotion={reducedMotion}
          />
        ))}
      </ScrollView>
    </View>
  );
});

export default React.memo(ShopModeSelector);

const styles = StyleSheet.create({
  container: { paddingTop: 6 },
  rail: { gap: GAP, paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 4 },
  card: {
    height: 104,
    borderRadius: 20,
    paddingTop: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  selectedCard: { backgroundColor: '#FFFFFF', borderColor: 'rgba(32,36,49,0.18)' },
  // Native glass needs a see-through card; the glass draws its own edge.
  glassCard: { backgroundColor: 'transparent', borderColor: 'rgba(255,255,255,0.88)', borderWidth: StyleSheet.hairlineWidth },
  glass: { ...StyleSheet.absoluteFillObject, borderRadius: 20 },
  cardTint: { ...StyleSheet.absoluteFillObject, borderRadius: 19 },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: { width: '100%', height: '100%' },
  labelSlot: { height: 30, justifyContent: 'center', paddingHorizontal: 5, marginTop: 2 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center', color: '#535A69' },
  selectedLabel: { color: '#202431', fontWeight: '800' },
  selectionLine: {
    position: 'absolute',
    bottom: 6,
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#202431',
  },
});
