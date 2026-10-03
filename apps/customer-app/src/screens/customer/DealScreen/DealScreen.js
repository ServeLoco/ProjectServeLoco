import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AppScreen,
  AppIcon,
  ProductImage,
  StickyMiniCart,
  ErrorState,
  EmptyState,
  LoadingSkeleton,
} from '../../../components';
import { cardStyleOf } from '../../../components/OfferCards/DealTabsCard';
import { useCartStore, useDeliveryLocationStore } from '../../../stores';
import { useDealCart } from '../../../hooks/useDealCart';
import { dashboardApi } from '../../../api';

const GUTTER = 12;
const GAP = 10;

const formatPrice = (value) => {
  const n = Number(value) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function DealTile({ item, look, width, selected, progress, onSelect }) {
  const unavailable = !item.available || item.shopIsOpen === false || item.shop_is_open === 0;
  const label = item.dealVariantLabel || item.unit || '';
  return (
    <View style={[styles.tile, { width }, unavailable && styles.tileUnavailable]}>
      <View style={styles.tileImageBox}>
        <ProductImage uri={item.imageUrl} width={width} height={width} borderRadius={14} resizeMode="contain" style={styles.tileImage} />
        <Pressable
          onPress={() => onSelect(item)}
          disabled={unavailable}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={selected ? `Remove ${item.name}` : `${look.buttonText} ${item.name} for ₹${formatPrice(item.dealPrice)}`}
          style={[styles.tileSelect, { borderColor: look.buttonColor }, selected && { backgroundColor: look.buttonColor }]}
        >
          {selected ? (
            <AppIcon name="check" size={14} color="#FFFFFF" />
          ) : (
            <Text style={[styles.tileSelectText, { color: look.buttonColor }]}>{unavailable ? 'Sold out' : look.buttonText}</Text>
          )}
        </Pressable>
      </View>
      {label ? <Text style={styles.tileUnit} numberOfLines={1}>{label}</Text> : null}
      <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
      <View style={[styles.tileTrack, { backgroundColor: `${look.accentColor}22` }]}>
        <View style={[styles.tileFill, { backgroundColor: look.accentColor, width: `${Math.round(progress.ratio * 100)}%` }]} />
      </View>
      <View style={styles.tileClaimRow}>
        <AppIcon name={progress.unlocked ? 'check' : 'lock'} size={12} color={look.accentColor} />
        <Text style={[styles.tileClaim, { color: look.accentColor }]} numberOfLines={2}>
          {progress.unlocked ? 'Unlocked' : `Shop for ₹${progress.amountRemaining} more to claim`}
        </Text>
      </View>
      <View style={styles.tilePriceRow}>
        <Text style={styles.tileDeal}>₹{formatPrice(item.dealPrice)}</Text>
        <Text style={styles.tileStrike}>₹{formatPrice(item.regularPrice)}</Text>
      </View>
    </View>
  );
}

/**
 * The "View all" page of a deal price offer: a header in the card's
 * colours, a sticky tab per deal price, and every product of that price in
 * a 3-column grid, each with its own Select and "Shop for ₹X more" line.
 */
export default function DealScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const couponId = route.params?.couponId;
  const coords = useDeliveryLocationStore((s) => s.coords);
  const cartItemCount = useCartStore((s) => s.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0));

  const [deal, setDeal] = useState(null);
  const [card, setCard] = useState(route.params?.card || null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!couponId) return;
    if (!silent) setLoading(true);
    try {
      const res = await dashboardApi.getDeal(couponId, {
        include_closed_shops: 1,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      const body = res?.data ?? res;
      setDeal(body?.deal || null);
      if (body?.card) setCard(body.card);
      setError(null);
    } catch (err) {
      setError(err?.status === 404 ? 'gone' : (err?.message || 'Could not load this offer'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [couponId, coords?.lat, coords?.lng]);

  useEffect(() => { load(); }, [load]);

  const look = cardStyleOf(card);
  const { progress, isSelected, toggle } = useDealCart(deal);
  const tiers = useMemo(() => deal?.tiers || [], [deal]);
  const tier = tiers[Math.min(activeIndex, Math.max(0, tiers.length - 1))];
  const tileWidth = Math.floor((windowWidth - GUTTER * 2 - GAP * 2) / 3);
  const title = card?.title || deal?.title || 'Deals';
  const subtitle = card?.subtitle || (deal && Number(deal.minOrder) > 0
    ? `Get any ${deal.maxItems} item${deal.maxItems === 1 ? '' : 's'} when you shop for ₹${formatPrice(deal.minOrder)}`
    : '');

  const header = (
    <LinearGradient colors={[look.tabColor, look.accentColor]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <AppIcon name="back" size={22} color="#FFFFFF" />
      </Pressable>
      <View style={styles.heroRow}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
          {subtitle ? <Text style={styles.heroSubtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        {card?.imageUrl ? (
          <ProductImage uri={card.imageUrl} width={72} height={72} borderRadius={0} resizeMode="contain" fallback={null} style={styles.heroArt} />
        ) : null}
      </View>
    </LinearGradient>
  );

  let content;
  if (loading) {
    content = (
      <View style={styles.loadingBox}>
        <LoadingSkeleton width="100%" height={220} borderRadius={14} />
        <LoadingSkeleton width="100%" height={220} borderRadius={14} />
      </View>
    );
  } else if (error === 'gone' || (!error && tiers.length === 0)) {
    content = (
      <EmptyState
        title="This offer has ended"
        subtitle="Check Home for today's deals."
        actionLabel="Back to Home"
        onAction={() => navigation.goBack()}
      />
    );
  } else if (error) {
    content = <ErrorState message={error} onRetry={() => load()} />;
  }

  return (
    <AppScreen safeAreaTop={false} bg="#FFFFFF" statusBarStyle="light-content">
      {content ? (
        <View style={styles.flex}>
          {header}
          {content}
        </View>
      ) : (
        <ScrollView
          stickyHeaderIndices={[1]}
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }); }} />}
        >
          {header}
          {/* The sticky header wrapper replaces its direct child's style, so
              the tab row needs a plain View around it to keep its layout. */}
          <View>
          <View style={[styles.tabs, { backgroundColor: look.tabColor }]}>
            {tiers.map((t, index) => {
              const active = index === activeIndex;
              return (
                <Pressable
                  key={t.price}
                  onPress={() => setActiveIndex(index)}
                  style={[styles.tab, active && { backgroundColor: '#FFFFFF' }]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.chip, { backgroundColor: active ? look.accentColor : '#FFFFFF' }]}>
                    <Text style={[styles.chipText, { color: active ? '#FFFFFF' : look.tabColor }]}>₹{formatPrice(t.price)}</Text>
                  </View>
                  <Text style={[styles.tabText, { color: active ? look.titleColor : '#FFFFFF' }]}>Items</Text>
                </Pressable>
              );
            })}
          </View>
          </View>
          <View style={styles.grid}>
            {(tier?.items || []).map((item) => (
              <DealTile
                key={`${item.id}:${item.dealVariantId || ''}`}
                item={item}
                look={look}
                width={tileWidth}
                selected={isSelected(item)}
                progress={progress}
                onSelect={toggle}
              />
            ))}
          </View>
        </ScrollView>
      )}

      <StickyMiniCart itemCount={cartItemCount} onPress={() => navigation.navigate('Cart')} />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { paddingHorizontal: GUTTER, paddingBottom: 18 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  heroText: { flex: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 31, fontWeight: '900', fontStyle: 'italic', letterSpacing: -0.4 },
  heroSubtitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 19, marginTop: 6, opacity: 0.95, fontWeight: '500' },
  heroArt: { backgroundColor: 'transparent' },
  tabs: { flexDirection: 'row', paddingHorizontal: 8, paddingTop: 8, gap: 6 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  chip: { borderRadius: 7, paddingHorizontal: 6, paddingVertical: 2 },
  chipText: { fontSize: 15, fontWeight: '900' },
  tabText: { fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER, paddingTop: 12, columnGap: GAP, rowGap: 18, backgroundColor: '#FFFFFF' },
  tile: {},
  tileUnavailable: { opacity: 0.5 },
  tileImageBox: { borderRadius: 14, backgroundColor: '#F4F4F6' },
  tileImage: { backgroundColor: '#F4F4F6' },
  tileSelect: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 58,
    height: 30,
    paddingHorizontal: 8,
    borderWidth: 1.5,
    borderRadius: 10,
    backgroundColor: '#F2F6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileSelectText: { fontSize: 13, fontWeight: '800' },
  tileUnit: {
    alignSelf: 'stretch',
    textAlign: 'center',
    backgroundColor: '#F4F4F6',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginTop: -6,
    paddingTop: 8,
    paddingBottom: 4,
    fontSize: 12,
    color: '#555',
  },
  tileName: { marginTop: 6, fontSize: 13.5, lineHeight: 17, fontWeight: '600', color: '#1F1F1F', minHeight: 34 },
  tileTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  tileFill: { height: 4, borderRadius: 2 },
  tileClaimRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 5 },
  tileClaim: { flex: 1, fontSize: 11.5, lineHeight: 15, fontWeight: '600' },
  tilePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 },
  tileDeal: { fontSize: 16, fontWeight: '800', color: '#1F1F1F' },
  tileStrike: { fontSize: 12.5, color: '#9A9A9A', textDecorationLine: 'line-through' },
  loadingBox: { padding: GUTTER, gap: 12 },
});
