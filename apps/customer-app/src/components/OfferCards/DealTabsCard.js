import React, { memo, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProductImage from '../ProductImage';
import AppIcon from '../AppIcon';
import { useDealCart } from '../../hooks/useDealCart';
import DealSwapModal from './DealSwapModal';
import { useReducedMotion } from '../../utils';

const SHINE_WIDTH = 70;
const SHIMMER_WIDTH = 46;
const UNLOCKED_COLOR = '#1E9E5A';
// The little burst when the deal unlocks: where each spark flies, and its colour.
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => ({
  dx: Math.cos((deg * Math.PI) / 180),
  dy: Math.sin((deg * Math.PI) / 180),
  color: ['#F5B700', UNLOCKED_COLOR, '#FF6B6B', '#6C3BF5'][i % 4],
  size: i % 2 === 0 ? 6 : 4,
}));

// Same defaults as the API (offerCardController DEFAULT_STYLE), so a card
// still draws if a key is missing.
export const DEFAULT_CARD_STYLE = {
  bgColor: '#EDE7FF',
  bgColorEnd: '#FFFFFF',
  accentColor: '#6C3BF5',
  titleColor: '#1F1147',
  subtitleColor: '#4B4470',
  tabColor: '#5B2FD6',
  tabActiveColor: '#FFFFFF',
  tabTextColor: '#FFFFFF',
  buttonColor: '#2F6BFF',
  buttonText: 'Select',
  footerText: 'View items at all prices',
  rowsPerTab: 3,
};

export const cardStyleOf = (card) => ({ ...DEFAULT_CARD_STYLE, ...(card?.style || {}) });

const formatPrice = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function DealRow({ item, look, selected, onSelect }) {
  const unavailable = !item.available || item.shopIsOpen === false || item.shop_is_open === 0;
  const label = item.dealVariantLabel || item.unit || '';
  return (
    <View style={[styles.row, unavailable && styles.rowUnavailable]}>
      <ProductImage uri={item.thumbUrl || item.imageUrl} width={40} height={40} borderRadius={8} resizeMode="contain" style={styles.rowImage} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
        {label ? <Text style={styles.rowUnit} numberOfLines={1}>{label}</Text> : null}
      </View>
      <Pressable
        onPress={() => onSelect(item)}
        disabled={unavailable}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={selected ? `Remove ${item.name}` : `${look.buttonText} ${item.name} for ₹${formatPrice(item.dealPrice)}`}
        style={[
          styles.selectBtn,
          { borderColor: look.buttonColor },
          selected && { backgroundColor: look.buttonColor },
        ]}
      >
        {selected ? (
          <View style={styles.selectedInner}>
            <AppIcon name="check" size={13} color="#FFFFFF" />
            <Text style={[styles.selectText, { color: '#FFFFFF' }]}>Added</Text>
          </View>
        ) : (
          <Text style={[styles.selectText, { color: look.buttonColor }]}>{unavailable ? 'Sold out' : look.buttonText}</Text>
        )}
      </Pressable>
      <View style={styles.priceCol}>
        <Text style={styles.strike}>₹{formatPrice(item.regularPrice)}</Text>
        <Text style={styles.dealPrice}>₹{formatPrice(item.dealPrice)}</Text>
      </View>
    </View>
  );
}

/**
 * "Shop for ₹X more to claim" with its bar. A soft light keeps gliding along
 * the bar, the amount counts down and pops when the cart changes, and when
 * the deal unlocks the line bounces in green with a small sparkle burst.
 */
function DealProgress({ progress, accentColor, reducedMotion }) {
  const fill = useRef(new Animated.Value(progress.ratio)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const counter = useRef(new Animated.Value(progress.amountRemaining)).current;
  const [shownAmount, setShownAmount] = useState(progress.amountRemaining);
  const [trackWidth, setTrackWidth] = useState(0);
  const lastAmount = useRef(progress.amountRemaining);
  const wasUnlocked = useRef(progress.unlocked);
  const color = progress.unlocked ? UNLOCKED_COLOR : accentColor;

  // The bar fills smoothly as the cart grows.
  useEffect(() => {
    Animated.timing(fill, { toValue: progress.ratio, duration: reducedMotion ? 0 : 500, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [fill, progress.ratio, reducedMotion]);

  // A light glides along the bar, again and again.
  useEffect(() => {
    if (reducedMotion || !trackWidth) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(700),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer, trackWidth, reducedMotion]);

  // The amount counts down to its new value and pops.
  useEffect(() => {
    const from = lastAmount.current;
    const to = progress.amountRemaining;
    lastAmount.current = to;
    if (from === to) return undefined;
    if (reducedMotion) {
      setShownAmount(to);
      return undefined;
    }
    counter.setValue(from);
    const id = counter.addListener(({ value }) => setShownAmount(Math.round(value)));
    Animated.timing(counter, { toValue: to, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false })
      .start(() => setShownAmount(to));
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.12, duration: 130, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }),
    ]).start();
    return () => counter.removeListener(id);
  }, [progress.amountRemaining, counter, pop, reducedMotion]);

  // Unlocked: a bigger bounce and the sparkle burst (only on the change, not
  // when the card first shows an already unlocked deal).
  useEffect(() => {
    const before = wasUnlocked.current;
    wasUnlocked.current = progress.unlocked;
    if (!progress.unlocked || before || reducedMotion) return;
    burst.setValue(0);
    Animated.parallel([
      Animated.timing(burst, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(pop, { toValue: 1.22, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, friction: 3, tension: 120, useNativeDriver: true }),
      ]),
    ]).start();
  }, [progress.unlocked, burst, pop, reducedMotion]);

  return (
    <View style={styles.progressWrap} accessibilityLiveRegion="polite">
      <View
        style={[styles.progressTrack, { backgroundColor: `${accentColor}22` }]}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[
            styles.progressFill,
            { backgroundColor: color, width: fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) },
          ]}
        />
        {reducedMotion || !trackWidth ? null : (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.shimmer,
              { transform: [{ translateX: shimmer.interpolate({ inputRange: [0, 1], outputRange: [-SHIMMER_WIDTH, trackWidth] }) }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}
      </View>
      <Animated.View style={[styles.progressLine, { transform: [{ scale: pop }] }]}>
        <Text style={[styles.progressText, { color }]} numberOfLines={1}>
          {progress.unlocked ? 'Unlocked! Pick your deal item' : `Shop for ₹${shownAmount} more to claim`}
        </Text>
        {reducedMotion ? null : (
          <View pointerEvents="none" style={styles.sparkOrigin}>
            {SPARKS.map((spark, i) => (
              <Animated.View
                key={i}
                style={[
                  styles.spark,
                  {
                    width: spark.size,
                    height: spark.size,
                    borderRadius: spark.size / 2,
                    backgroundColor: spark.color,
                    opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, spark.dx * 30] }) },
                      { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, spark.dy * 16] }) },
                      { scale: burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.4, 1.3, 0.6] }) },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * The ₹9 / ₹29 / ₹49 card: a tab per deal price, a few products per tab
 * with Select, and a link to the full Deal page. Every colour and label
 * comes from the card's admin-set style.
 */
function DealTabsCard({ card, width, onViewAll }) {
  const look = cardStyleOf(card);
  const tiers = card?.deal?.tiers || [];
  const [activeIndex, setActiveIndex] = useState(0);
  const { progress, isSelected, toggle, swap, confirmSwap, cancelSwap } = useDealCart(card?.deal);
  const reducedMotion = useReducedMotion();
  const entry = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const shine = useRef(new Animated.Value(0)).current;
  const rowsIn = useRef(new Animated.Value(1)).current;

  // The card rises in once, then a soft light sweeps across it every few seconds.
  useEffect(() => {
    if (reducedMotion) {
      entry.setValue(1);
      return undefined;
    }
    Animated.timing(entry, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(shine, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(shine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [entry, shine, reducedMotion]);

  // Rows slide in when the price tab changes (not on the first draw, so the
  // list is never hidden while the card is still settling).
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) {
      firstTab.current = false;
      return;
    }
    if (reducedMotion) return;
    rowsIn.setValue(0);
    Animated.timing(rowsIn, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [activeIndex, rowsIn, reducedMotion]);

  if (tiers.length === 0) return null;
  const tier = tiers[Math.min(activeIndex, tiers.length - 1)];
  const rows = tier.items.slice(0, Number(look.rowsPerTab) || 3);
  const minOrder = Number(card.deal.minOrder) || 0;

  return (
    <Animated.View
      style={{
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
      style={[styles.card, { width, borderColor: look.tabColor }]}
    >
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={[styles.title, { color: look.titleColor }]} numberOfLines={2}>{card.title}</Text>
          {/* The "Shop for ₹X more" line says the same, so the subtitle shows
              only on a deal without a minimum order. */}
          {card.subtitle && minOrder <= 0 ? (
            <Text style={[styles.subtitle, { color: look.subtitleColor }]} numberOfLines={2}>{card.subtitle}</Text>
          ) : null}
        </View>
        {card.imageUrl ? (
          <ProductImage uri={card.imageUrl} width={44} height={44} borderRadius={0} resizeMode="contain" fallback={null} style={styles.art} />
        ) : null}
      </View>

      {minOrder > 0 ? (
        <DealProgress progress={progress} accentColor={look.accentColor} reducedMotion={reducedMotion} />
      ) : null}

      <View style={[styles.tabs, { backgroundColor: look.tabColor }]}>
        {tiers.map((t, index) => {
          const active = index === activeIndex;
          return (
            <Pressable
              key={t.price}
              onPress={() => setActiveIndex(index)}
              style={[styles.tab, active && { backgroundColor: look.tabActiveColor }]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`₹${formatPrice(t.price)} items`}
            >
              <View style={[styles.chip, { backgroundColor: look.accentColor }]}>
                <Text style={styles.chipText}>₹{formatPrice(t.price)}</Text>
              </View>
              <Text style={[styles.tabText, { color: active ? look.titleColor : look.tabTextColor }]} numberOfLines={1}>Items</Text>
            </Pressable>
          );
        })}
      </View>

      {/* The tab colour wraps the white list on the sides and bottom too, so
          the card keeps its edge on a white page. */}
      <View style={[styles.frame, { backgroundColor: look.tabColor }]}>
        <View style={styles.body}>
          <Animated.View
            style={{
              opacity: rowsIn,
              transform: [{ translateX: rowsIn.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
            }}
          >
            {rows.map((item) => (
              <DealRow key={`${item.id}:${item.dealVariantId || ''}`} item={item} look={look} selected={isSelected(item)} onSelect={toggle} />
            ))}
          </Animated.View>
          <Pressable onPress={onViewAll} style={styles.footer} accessibilityRole="link" hitSlop={6}>
            <Text style={[styles.footerText, { color: look.accentColor }]}>{look.footerText}</Text>
            <AppIcon name="chevronRight" size={14} color={look.accentColor} />
          </Pressable>
        </View>
      </View>

      {reducedMotion ? null : (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shine,
            {
              transform: [
                { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-SHINE_WIDTH * 2, (Number(width) || 320) + SHINE_WIDTH] }) },
                { rotate: '18deg' },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      )}
    </LinearGradient>
    <DealSwapModal swap={swap} accentColor={look.accentColor} onKeep={cancelSwap} onReplace={confirmSwap} />
    </Animated.View>
  );
}

export default memo(DealTabsCard);

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  headText: { flex: 1 },
  title: { fontSize: 16, lineHeight: 20, fontWeight: '800', letterSpacing: -0.2 },
  subtitle: { fontSize: 11.5, lineHeight: 15, marginTop: 2, fontWeight: '500' },
  art: { backgroundColor: 'transparent' },
  progressWrap: { paddingHorizontal: 12, marginTop: 6, gap: 3 },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  shimmer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: SHIMMER_WIDTH },
  progressLine: { alignSelf: 'flex-start', transformOrigin: 'left center' },
  sparkOrigin: { position: 'absolute', left: '50%', top: '50%', width: 0, height: 0 },
  spark: { position: 'absolute', left: -3, top: -3 },
  progressText: { fontSize: 11, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginTop: 8, paddingTop: 5, paddingHorizontal: 6, gap: 4, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  chip: { borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 },
  chipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  tabText: { fontSize: 12, fontWeight: '700' },
  frame: { paddingHorizontal: 6, paddingBottom: 6 },
  body: { backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingBottom: 2, borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  shine: { position: 'absolute', top: -40, bottom: -40, left: 0, width: SHINE_WIDTH },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ECECEC',
  },
  rowUnavailable: { opacity: 0.5 },
  rowImage: { backgroundColor: '#F6F6F8' },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 12.5, lineHeight: 15, fontWeight: '700', color: '#1F1F1F' },
  rowUnit: { fontSize: 11, color: '#8A8A8A', marginTop: 1 },
  selectBtn: {
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#F2F6FF',
    minWidth: 62,
    alignItems: 'center',
  },
  selectedInner: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  selectText: { fontSize: 12, fontWeight: '800' },
  priceCol: { alignItems: 'flex-end', minWidth: 38 },
  strike: { fontSize: 11, color: '#9A9A9A', textDecorationLine: 'line-through' },
  dealPrice: { fontSize: 14, fontWeight: '800', color: '#1F1F1F' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingVertical: 8 },
  footerText: { fontSize: 13, fontWeight: '800' },
});
