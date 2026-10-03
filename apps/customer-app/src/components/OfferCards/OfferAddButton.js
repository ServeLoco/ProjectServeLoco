import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * The ADD button of a product offer card: an outlined pill in the card's
 * button colour, which turns into a filled "− qty +" once the product is in
 * the cart. The count pops a little on every change.
 */
function OfferAddButton({ quantity, color, label = 'ADD', disabled = false, onAdd, onDecrement, name, reducedMotion }) {
  const pop = useRef(new Animated.Value(1)).current;
  const last = useRef(quantity);

  useEffect(() => {
    if (last.current === quantity) return;
    last.current = quantity;
    if (reducedMotion || quantity <= 0) return;
    pop.setValue(1.25);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }).start();
  }, [quantity, pop, reducedMotion]);

  if (disabled) {
    return (
      <View style={[styles.pill, styles.soldOut]}>
        <Text style={styles.soldOutText}>Sold out</Text>
      </View>
    );
  }

  if (quantity <= 0) {
    return (
      <Pressable
        onPress={onAdd}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Add ${name || 'item'} to cart`}
        style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
      >
        <LinearGradient colors={['#FFFFFF', `${color}1F`]} style={[styles.pill, { borderColor: color }]}>
          <Text style={[styles.addText, { color }]}>{label}</Text>
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <View style={[styles.pill, styles.stepper, { backgroundColor: color, borderColor: color }]}>
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
  addText: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  stepper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  step: { width: 22, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', lineHeight: 20 },
  qty: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  soldOut: { borderColor: '#D6D6DB', backgroundColor: '#F4F4F6' },
  soldOutText: { fontSize: 11.5, fontWeight: '700', color: '#8A8A8A' },
});
