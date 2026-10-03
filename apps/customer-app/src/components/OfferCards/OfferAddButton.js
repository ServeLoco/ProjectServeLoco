import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The ADD button of a product offer card: an outlined pill in the card's
 * button colour, which turns into a filled "− qty +" once the product is in
 * the cart. The count pops a little on every change. `small` is the size
 * used on the Home card. `glow` (an animated 0 → 1) sends a ring in the
 * button colour out from ADD once as it runs, like a ripple.
 */
function OfferAddButton({ quantity, color, label = 'ADD', disabled = false, onAdd, onDecrement, name, reducedMotion, small = false, glow = null }) {
  const pop = useRef(new Animated.Value(1)).current;
  const last = useRef(quantity);
  const ring = useMemo(() => glow && {
    opacity: glow.interpolate({ inputRange: [0, 0.1, 0.75, 1], outputRange: [0, 1, 1, 0] }),
    transform: [{ scaleX: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) }, { scaleY: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] }) }],
  }, [glow]);

  useEffect(() => {
    if (last.current === quantity) return;
    last.current = quantity;
    if (reducedMotion || quantity <= 0) return;
    pop.setValue(1.25);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [quantity, pop, reducedMotion]);

  if (disabled) {
    return (
      <View style={[styles.pill, small && styles.pillSmall, styles.soldOut]}>
        <Text style={styles.soldOutText}>Sold out</Text>
      </View>
    );
  }

  if (quantity <= 0) {
    return (
      <View>
        {ring ? (
          <Animated.View pointerEvents="none" style={[styles.ring, small && styles.ringSmall, { borderColor: color }, ring]} />
        ) : null}
        <Pressable
          onPress={onAdd}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`Add ${name || 'item'} to cart`}
          style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
        >
          <LinearGradient colors={['#FFFFFF', `${color}1F`]} style={[styles.pill, small && styles.pillSmall, { borderColor: color }]}>
            <Text style={[styles.addText, small && styles.addTextSmall, { color }]}>{label}</Text>
          </LinearGradient>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.pill, small && styles.pillSmall, styles.stepper, { backgroundColor: color, borderColor: color }]}>
      <Pressable onPress={onDecrement} hitSlop={8} style={styles.step} accessibilityRole="button" accessibilityLabel={`Remove one ${name || 'item'}`}>
        <Text style={styles.stepText}>−</Text>
      </Pressable>
      <Animated.Text style={[styles.qty, { transform: [{ scale: pop }] }]}>{quantity}</Animated.Text>
      <Pressable onPress={onAdd} hitSlop={8} style={styles.step} accessibilityRole="button" accessibilityLabel={`Add one more ${name || 'item'}`}>
        <Text style={styles.stepText}>+</Text>
      </Pressable>
    </View>
  );
}

export default OfferAddButton;

const styles = StyleSheet.create({
  pressable: { borderRadius: 10 },
  pressed: { transform: [{ scale: 0.95 }] },
  pill: {
    width: 72,
    height: 32,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF', // under the see-through tint, so it stays solid on a picture
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillSmall: { width: 60, height: 28, borderRadius: 9 },
  ring: { ...StyleSheet.absoluteFillObject, borderRadius: 10, borderWidth: 2 },
  ringSmall: { borderRadius: 9 },
  addText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  addTextSmall: { fontSize: 12.5 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  step: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 20 },
  qty: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  soldOut: { borderColor: '#D6D6DB', backgroundColor: '#F4F4F6' },
  soldOutText: { fontSize: 11.5, fontWeight: '700', color: '#8A8A8A' },
});
