import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AppIcon from '../../../components/AppIcon';
import PressableScale from '../../../components/PressableScale';
import RetryingImage from '../../../components/ProductImage/RetryingImage';
import { resolveModeStyle } from '../../../components/SegmentedControl/modeStyles';
import { useReducedMotion } from '../../../utils/motionPreferences';

const GUTTER = 16;
const GAP = 10;

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
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ width }}
    >
      <Animated.View
        style={[
          styles.card,
          selected && styles.selectedCard,
          { transform: [{ translateY: selection.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }] },
        ]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={selected ? [look.color + '26', look.color + '05'] : ['rgba(255,255,255,0.3)', 'rgba(255,255,255,0)']}
          style={styles.cardTint}
        />
        <Animated.View pointerEvents="none" style={[styles.check, { opacity: selection }]}>
          <AppIcon name="check" size={10} color="#FFFFFF" strokeWidth={3} />
        </Animated.View>
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
              <AppIcon name={look.icon} size={38} color={look.iconColor || '#FFFFFF'} strokeWidth={2.2} />
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
function ShopModeSelector({ modes = [], selectedMode, onSelect }) {
  const { width: screenWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const rail = useRef(null);
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
}

export default React.memo(ShopModeSelector);

const styles = StyleSheet.create({
  container: { paddingTop: 6 },
  rail: { gap: GAP, paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: 4 },
  card: {
    height: 130,
    borderRadius: 24,
    paddingTop: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  selectedCard: { backgroundColor: '#FFFFFF', borderColor: 'rgba(32,36,49,0.18)' },
  cardTint: { ...StyleSheet.absoluteFillObject, borderRadius: 23 },
  check: {
    position: 'absolute',
    zIndex: 1,
    top: 7,
    right: 7,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#202431',
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: 22,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImage: { width: '100%', height: '100%' },
  labelSlot: { height: 32, justifyContent: 'center', paddingHorizontal: 5, marginTop: 4 },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center', color: '#535A69' },
  selectedLabel: { color: '#202431', fontWeight: '800' },
  selectionLine: {
    position: 'absolute',
    bottom: 8,
    width: 22,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#202431',
  },
});
