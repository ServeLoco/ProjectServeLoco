import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import ProductImage from '../ProductImage';
import AppIcon from '../AppIcon';
import { colors, spacing } from '../../theme';
import { useReducedMotion } from '../../utils';

const formatPrice = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function SwapTile({ label, name, image, price, regular, accent, highlight }) {
  const shownPrice = formatPrice(price);
  const shownRegular = formatPrice(regular);
  return (
    <View style={[styles.tile, highlight ? { borderColor: accent, backgroundColor: `${accent}0F` } : styles.tileOut]}>
      <Text style={[styles.tileLabel, { color: highlight ? accent : colors.textSecondary }]}>{label}</Text>
      <ProductImage uri={image} width={52} height={52} borderRadius={10} resizeMode="contain" style={styles.tileImage} />
      <Text style={styles.tileName} numberOfLines={2}>{name}</Text>
      <View style={styles.tilePriceRow}>
        {shownPrice ? <Text style={styles.tilePrice}>₹{shownPrice}</Text> : null}
        {shownRegular && shownRegular !== shownPrice ? <Text style={styles.tileStrike}>₹{shownRegular}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Asks before swapping the deal item already in the cart for a new one
 * (the deal gives only `maxItems` items at the deal price). Shows both
 * items side by side so the customer sees what goes out and what comes in.
 *
 * swap: { count, out: { name, image, price, regular }, in: { ... } } or null
 */
function DealSwapModal({ swap, accentColor = '#6C3BF5', onKeep, onReplace }) {
  const visible = Boolean(swap);
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const nudge = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.92);
      return undefined;
    }
    if (reducedMotion) {
      opacity.setValue(1);
      scale.setValue(1);
      return undefined;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 80, useNativeDriver: true }),
    ]).start();
    // The arrow gently points from the old item to the new one.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(nudge, { toValue: 1, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(nudge, { toValue: 0, duration: 450, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, reducedMotion, opacity, scale, nudge]);

  const count = swap?.count || 1;

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onKeep}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onKeep} accessibilityLabel="Keep current item" />
        {swap ? (
          <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
            <View style={[styles.badge, { backgroundColor: `${accentColor}1A` }]}>
              <AppIcon name="sparkles" size={22} color={accentColor} />
            </View>
            <Text style={styles.title}>Swap your deal item?</Text>
            <Text style={styles.subtitle}>
              This offer gives {count} item{count === 1 ? '' : 's'} at the deal price.
            </Text>

            <View style={styles.tiles}>
              <SwapTile label="IN CART" accent={accentColor} {...swap.out} />
              <Animated.View
                style={[
                  styles.arrow,
                  { backgroundColor: accentColor },
                  { transform: [{ translateX: nudge.interpolate({ inputRange: [0, 1], outputRange: [-2, 3] }) }] },
                ]}
              >
                <AppIcon name="chevronRight" size={16} color="#FFFFFF" />
              </Animated.View>
              <SwapTile label="NEW PICK" accent={accentColor} highlight {...swap.in} />
            </View>

            <View style={styles.actions}>
              <Pressable
                onPress={onKeep}
                style={({ pressed }) => [styles.btn, styles.btnKeep, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Keep current item"
              >
                <Text style={styles.btnKeepLabel}>Keep current</Text>
              </Pressable>
              <Pressable
                onPress={onReplace}
                style={({ pressed }) => [styles.btn, { backgroundColor: accentColor }, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel={`Replace with ${swap.in?.name || 'new item'}`}
              >
                <Text style={styles.btnReplaceLabel}>Replace</Text>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}
      </Animated.View>
    </Modal>
  );
}

export default DealSwapModal;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.bgSurface,
    borderRadius: 24,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 28 },
      android: { elevation: 16 },
    }),
  },
  badge: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.2, textAlign: 'center' },
  subtitle: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  tiles: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 18, width: '100%' },
  tile: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    gap: 5,
  },
  tileOut: { borderColor: '#E6E6EA', backgroundColor: '#F7F7F9', opacity: 0.85 },
  tileLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  tileImage: { backgroundColor: '#FFFFFF' },
  tileName: { fontSize: 12.5, lineHeight: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', minHeight: 32 },
  tilePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  tilePrice: { fontSize: 14, fontWeight: '800', color: colors.textPrimary },
  tileStrike: { fontSize: 11, color: '#9A9A9A', textDecorationLine: 'line-through' },
  arrow: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  btn: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  btnPressed: { opacity: 0.7 },
  btnKeep: { backgroundColor: colors.bgApp, borderWidth: 1, borderColor: colors.border },
  btnKeepLabel: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  btnReplaceLabel: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
