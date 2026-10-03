import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProductImage from '../ProductImage';
import AppIcon from '../AppIcon';
import OfferAddButton from './OfferAddButton';
import { useOfferProductCart } from '../../hooks/useOfferProductCart';
import { useReducedMotion } from '../../utils';

const SHINE_WIDTH = 64;
// The header picture is wide art, 3 : 1 (the admin is asked for 900 × 300).
const BANNER_RATIO = 3;

// Same defaults as the API (offerCardController DEFAULT_STYLES.deals_of_day),
// so a card still draws if a key is missing.
export const DEFAULT_DAY_STYLE = {
  bgColor: '#FFF6D8',
  bgColorEnd: '#FFE7A3',
  accentColor: '#E8590C',
  titleColor: '#D9480F',
  subtitleColor: '#8A5A12',
  buttonColor: '#2F6BFF',
  buttonText: 'ADD',
  footerText: 'See all',
  rowsPerTab: 4,
};

export const dayCardStyleOf = (card) => ({ ...DEFAULT_DAY_STYLE, ...(card?.style || {}) });

export const formatPrice = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

export const isOfferItemUnavailable = (item) =>
  !item.available || item.shopIsOpen === false || item.shopIsOpen === 0 || item.shop_is_open === 0;

/**
 * The header of a product offer card / its page: the admin's wide picture,
 * or the title in big bold letters with a soft light sweeping across.
 */
export function DayCardHeader({ card, look, width, big = false, reducedMotion }) {
  const shine = useRef(new Animated.Value(0)).current;
  const [headWidth, setHeadWidth] = useState(width || 0);

  useEffect(() => {
    if (reducedMotion || card.imageUrl) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2600),
        Animated.timing(shine, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shine, reducedMotion, card.imageUrl]);

  if (card.imageUrl) {
    const bannerWidth = width || headWidth;
    return (
      <View onLayout={width ? undefined : (e) => setHeadWidth(e.nativeEvent.layout.width)}>
        {bannerWidth ? (
          <ProductImage
            uri={card.imageUrl}
            width={bannerWidth}
            height={Math.round(bannerWidth / BANNER_RATIO)}
            borderRadius={0}
            resizeMode="cover"
            fallback={null}
            style={styles.banner}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.head, big && styles.headBig]} onLayout={(e) => setHeadWidth(e.nativeEvent.layout.width)}>
      <View style={styles.titleRow}>
        <AppIcon name="sparkles" size={big ? 18 : 14} color={look.accentColor} />
        <Text
          style={[
            styles.title,
            big && styles.titleBig,
            { color: look.titleColor, textShadowColor: `${look.accentColor}40` },
          ]}
          numberOfLines={2}
        >
          {card.title}
        </Text>
        <AppIcon name="sparkles" size={big ? 18 : 14} color={look.accentColor} />
      </View>
      {card.subtitle ? (
        <Text style={[styles.subtitle, big && styles.subtitleBig, { color: look.subtitleColor }]} numberOfLines={2}>{card.subtitle}</Text>
      ) : null}
      {reducedMotion || !headWidth ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            { transform: [{ translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-SHINE_WIDTH, headWidth + SHINE_WIDTH] }) }, { rotate: '20deg' }] },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </View>
  );
}

function DayRow({ item, look, quantity, onAdd, onDecrement, reducedMotion }) {
  const unavailable = isOfferItemUnavailable(item);
  const label = item.offerVariantLabel || item.unit || '';
  return (
    <View style={[styles.row, unavailable && styles.rowUnavailable]}>
      <ProductImage uri={item.thumbUrl || item.imageUrl} width={50} height={50} borderRadius={10} resizeMode="contain" style={styles.rowImage} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
        {label ? <Text style={styles.rowUnit} numberOfLines={1}>{label}</Text> : null}
      </View>
      <OfferAddButton
        quantity={quantity}
        color={look.buttonColor}
        label={look.buttonText}
        disabled={unavailable}
        name={item.name}
        onAdd={() => onAdd(item)}
        onDecrement={() => onDecrement(item)}
        reducedMotion={reducedMotion}
      />
      <View style={styles.priceCol}>
        {item.offerMrp ? <Text style={styles.strike}>₹{formatPrice(item.offerMrp)}</Text> : null}
        <Text style={styles.price}>₹{formatPrice(item.offerPrice)}</Text>
      </View>
    </View>
  );
}

/**
 * Home offer card, template 2 "Deals of the day": a header (picture or
 * styled title), a few products the admin picked, each at its own price
 * with the MRP struck through and an ADD button, and "See all". All colours
 * and labels come from the card's admin-set style.
 */
function DealsOfDayCard({ card, width, onViewAll }) {
  const look = dayCardStyleOf(card);
  const reducedMotion = useReducedMotion();
  const { quantityOf, add, decrement } = useOfferProductCart();
  const entry = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  // The card rises in once.
  useEffect(() => {
    if (reducedMotion) {
      entry.setValue(1);
      return;
    }
    Animated.timing(entry, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [entry, reducedMotion]);

  const products = (card?.products || []).slice(0, Number(look.rowsPerTab) || DEFAULT_DAY_STYLE.rowsPerTab);
  if (products.length === 0) return null;

  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: entry,
        transform: [
          { translateY: entry.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
          { scale: entry.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }}
    >
      <LinearGradient
        colors={[look.bgColor, look.bgColorEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={[styles.card, { width, borderColor: `${look.accentColor}40` }]}
      >
        <DayCardHeader card={card} look={look} width={width - 2} reducedMotion={reducedMotion} />
        <View style={styles.divider} />

        <View style={styles.list}>
          {products.map((item) => (
            <DayRow
              key={`${item.id}:${item.offerVariantId || ''}`}
              item={item}
              look={look}
              quantity={quantityOf(item)}
              onAdd={add}
              onDecrement={decrement}
              reducedMotion={reducedMotion}
            />
          ))}
        </View>

        <Pressable
          onPress={onViewAll}
          style={({ pressed }) => [styles.footer, pressed && styles.footerPressed]}
          accessibilityRole="button"
          accessibilityLabel={`${look.footerText}: ${card.title}`}
        >
          <Text style={[styles.footerText, { color: look.accentColor }]}>{look.footerText}</Text>
          <View style={styles.chevrons}>
            <AppIcon name="chevronRight" size={14} color={look.accentColor} />
            <View style={styles.chevronTwo}>
              <AppIcon name="chevronRight" size={14} color={look.accentColor} />
            </View>
          </View>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  );
}

export default memo(DealsOfDayCard);

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 18, overflow: 'hidden', borderWidth: 1 }, // as tall as the tallest card in the row
  banner: { backgroundColor: 'transparent' },
  head: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 9, alignItems: 'center', overflow: 'hidden' },
  headBig: { paddingTop: 4, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    fontStyle: 'italic',
    textTransform: 'uppercase',
    letterSpacing: -0.3,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
  },
  titleBig: { fontSize: 28, lineHeight: 33 },
  subtitle: { fontSize: 11.5, lineHeight: 15, marginTop: 2, fontWeight: '600', textAlign: 'center' },
  subtitleBig: { fontSize: 14, lineHeight: 19, marginTop: 4 },
  shine: { position: 'absolute', top: -30, bottom: -30, left: 0, width: SHINE_WIDTH },
  divider: { height: 1, backgroundColor: 'rgba(255, 255, 255, 0.8)' },
  list: { flex: 1, paddingHorizontal: 10, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  rowUnavailable: { opacity: 0.5 },
  rowImage: { backgroundColor: '#FFFFFF' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13, lineHeight: 16, fontWeight: '600', color: '#1F1F1F' },
  rowUnit: { fontSize: 11.5, color: '#8A8A8A', marginTop: 2 },
  priceCol: { alignItems: 'flex-end', minWidth: 42 },
  strike: { fontSize: 11.5, color: '#9A9A9A', textDecorationLine: 'line-through' },
  price: { fontSize: 15, fontWeight: '800', color: '#1F1F1F' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6, paddingBottom: 10 },
  footerPressed: { opacity: 0.6 },
  footerText: { fontSize: 14, fontWeight: '800' },
  chevrons: { flexDirection: 'row' },
  chevronTwo: { marginLeft: -8 },
});
