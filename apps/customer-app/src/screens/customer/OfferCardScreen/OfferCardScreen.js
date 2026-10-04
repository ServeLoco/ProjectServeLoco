import React, { useCallback, useEffect, useState } from 'react';
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
import OfferAddButton from '../../../components/OfferCards/OfferAddButton';
import {
  DayCardHeader,
  dayCardStyleOf,
  formatPrice,
  isOfferItemUnavailable,
} from '../../../components/OfferCards/DealsOfDayCard';
import { useOfferProductCart } from '../../../hooks/useOfferProductCart';
import { useCartStore, useDeliveryLocationStore } from '../../../stores';
import { useReducedMotion } from '../../../utils';
import { dashboardApi } from '../../../api';

const GUTTER = 12;
const GAP = 10;

function OfferTile({ item, look, width, quantity, onAdd, onDecrement, reducedMotion }) {
  const unavailable = isOfferItemUnavailable(item);
  const label = item.offerVariantLabel || item.unit || '';
  const saving = item.offerMrp ? Math.round(Number(item.offerMrp) - Number(item.offerPrice)) : 0;
  return (
    <View style={[styles.tile, { width }, unavailable && styles.tileUnavailable]}>
      <View style={styles.tileImageBox}>
        <ProductImage uri={item.imageUrl} width={width} height={width} borderRadius={14} resizeMode="contain" style={styles.tileImage} />
        <View style={styles.tileAdd}>
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
        </View>
      </View>
      {label ? <Text style={styles.tileUnit} numberOfLines={1}>{label}</Text> : null}
      <Text style={styles.tileName} numberOfLines={2}>{item.name}</Text>
      <View style={styles.tilePriceRow}>
        <Text style={styles.tilePrice}>₹{formatPrice(item.offerPrice)}</Text>
        {item.offerMrp ? <Text style={styles.tileStrike}>₹{formatPrice(item.offerMrp)}</Text> : null}
      </View>
      {saving > 0 ? <Text style={[styles.tileSaving, { color: look.accentColor }]}>₹{saving} OFF</Text> : null}
    </View>
  );
}

/**
 * The "See all" page of a product offer card (template 2, "Deals of the
 * day"): the card's header in its colours, then every product it lists in a
 * 3-column grid, each with ADD at its own price.
 */
export default function OfferCardScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const cardId = route.params?.cardId;
  const coords = useDeliveryLocationStore((s) => s.coords);
  const cartItemCount = useCartStore((s) => s.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0));
  const { quantityOf, add, decrement } = useOfferProductCart();

  const [card, setCard] = useState(route.params?.card || null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!cardId) return;
    if (!silent) setLoading(true);
    try {
      const res = await dashboardApi.getOfferCard(cardId, {
        include_closed_shops: 1,
        latitude: coords?.lat,
        longitude: coords?.lng,
      });
      const body = res?.data ?? res;
      if (body?.card) setCard(body.card);
      setProducts(Array.isArray(body?.products) ? body.products : []);
      setError(null);
    } catch (err) {
      setError(err?.status === 404 ? 'gone' : (err?.message || 'Could not load this offer'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cardId, coords?.lat, coords?.lng]);

  useEffect(() => { load(); }, [load]);

  const look = dayCardStyleOf(card);
  const tileWidth = Math.floor((windowWidth - GUTTER * 2 - GAP * 2) / 3);

  const header = (
    <LinearGradient colors={[look.bgColor, look.bgColorEnd]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ paddingTop: insets.top }}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <AppIcon name="back" size={22} color={look.titleColor} />
      </Pressable>
      {card ? <DayCardHeader card={card} look={look} width={windowWidth} big reducedMotion={reducedMotion} /> : null}
    </LinearGradient>
  );

  let content;
  if (loading) {
    content = (
      <View style={styles.loadingBox}>
        <LoadingSkeleton width="100%" height={200} borderRadius={14} />
        <LoadingSkeleton width="100%" height={200} borderRadius={14} />
      </View>
    );
  } else if (error === 'gone' || (!error && products.length === 0)) {
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
    <AppScreen safeAreaTop={false} bg="#FFFFFF" statusBarStyle="dark-content">
      {content ? (
        <View style={styles.flex}>
          {header}
          {content}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load({ silent: true }); }} />}
        >
          {header}
          <View style={styles.grid}>
            {products.map((item) => (
              <OfferTile
                key={`${item.id}:${item.offerVariantId || ''}`}
                item={item}
                look={look}
                width={tileWidth}
                quantity={quantityOf(item)}
                onAdd={add}
                onDecrement={decrement}
                reducedMotion={reducedMotion}
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
  back: { width: 40, height: 40, justifyContent: 'center', marginLeft: GUTTER },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: GUTTER, paddingTop: 14, columnGap: GAP, rowGap: 18 },
  tile: {},
  tileUnavailable: { opacity: 0.5 },
  tileImageBox: { borderRadius: 14, backgroundColor: '#F4F4F6', marginBottom: 14 },
  tileImage: { backgroundColor: '#F4F4F6' },
  tileAdd: { position: 'absolute', right: 4, bottom: -12 },
  tileUnit: { fontSize: 12, color: '#6B6B6B' },
  tileName: { marginTop: 3, fontSize: 13.5, lineHeight: 17, fontWeight: '600', color: '#1F1F1F', minHeight: 34 },
  tilePriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 },
  tilePrice: { fontSize: 16, fontWeight: '800', color: '#1F1F1F' },
  tileStrike: { fontSize: 12.5, color: '#9A9A9A', textDecorationLine: 'line-through' },
  tileSaving: { fontSize: 11.5, fontWeight: '800', marginTop: 2 },
  loadingBox: { padding: GUTTER, gap: 12 },
});
