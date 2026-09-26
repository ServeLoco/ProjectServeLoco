import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ProductCard from '../ProductCard';
import VariantSheet from '../VariantSheet';
import AppIcon from '../AppIcon';
import { SkeletonCard } from '../LoadingSkeleton';
import { useCartStore, useDeliveryLocationStore } from '../../stores';
import { cartApi } from '../../api';
import { trackEvent } from '../../api/analyticsClient';
import { asArray, normalizeProduct, useReducedMotion } from '../../utils';
import { colors, spacing, easing, screenMs } from '../../theme';

// The cart's "People also ordered" row: products that go with what is in
// the cart (learned by the server from what people ordered together), then
// the area's most ordered, to at least SUGGESTION_LIMIT. Draws nothing
// when there is nothing to suggest or the request fails — it must never get
// in the way of checking out.

const SUGGESTION_LIMIT = 9;
// Wait for the stepper taps to settle before asking again.
const REFETCH_DEBOUNCE_MS = 400;
const CARD_WIDTH_SHARE = 0.38;
const SIDE_PADDING = 20;
// Cards glide in from the right one after another.
const CARD_ENTRY_SHIFT = 28;
const CARD_STAGGER_MS = 70;
// Warm top of the panel, fading to the white of the other cart cards.
const PANEL_TINT = [colors.saffronLight, colors.bgSurface];

const isComboLine = (line) => (line.type || 'product') === 'combo';

function quantityOf(items, productId) {
  let total = 0;
  for (const line of items) {
    if (isComboLine(line) || String(line.product?.id) !== String(productId)) continue;
    total += Number(line.quantity) || 0;
  }
  return total;
}

// Reads its own quantity, so a Buy tap re-draws only this card.
const SuggestionCard = React.memo(function SuggestionCard({ item, index, width, reduceMotion, onAdd, onIncrement, onDecrement }) {
  const quantity = useCartStore((state) => quantityOf(state.items, item.id));
  const entry = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) return undefined;
    const animation = Animated.timing(entry, {
      toValue: 1,
      duration: screenMs,
      delay: index * CARD_STAGGER_MS,
      easing,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // Mount only: a card that stays in the row does not replay its entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View
      style={{
        width,
        marginRight: spacing.md,
        opacity: entry,
        transform: [{ translateX: entry.interpolate({ inputRange: [0, 1], outputRange: [CARD_ENTRY_SHIFT, 0] }) }],
      }}
    >
      <ProductCard
        product={item}
        name={item.name}
        price={item.price}
        originalPrice={item.originalPrice}
        discountLabel={item.discountLabel}
        unit={item.unit}
        imageUri={item.imageUri}
        quantity={quantity}
        onAdd={() => onAdd(item)}
        onIncrement={() => onIncrement(item)}
        onDecrement={() => onDecrement(item)}
        disabled={!item.available}
        compact
      />
    </Animated.View>
  );
});

export default function CartSuggestions() {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor((windowWidth - SIDE_PADDING) * CARD_WIDTH_SHARE);
  const reduceMotion = useReducedMotion();

  const items = useCartStore((state) => state.items);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const coords = useDeliveryLocationStore((state) => state.coords);

  const [products, setProducts] = useState(null); // null = first load running
  const [variantProduct, setVariantProduct] = useState(null);
  const hasLoadedRef = useRef(false);
  // Products added from this row don't count as "the cart changed": the
  // row keeps them in place with a stepper instead of reloading and
  // swapping the card out from under the customer's thumb.
  const addedFromRowRef = useRef(new Set());
  const shownRef = useRef(new Set());

  const cartKey = useMemo(() => {
    const all = new Set();
    for (const line of items) {
      if (isComboLine(line) || line.product?.id == null) continue;
      all.add(Number(line.product.id));
    }
    let ids = [...all].filter((id) => !addedFromRowRef.current.has(id));
    if (ids.length === 0 && all.size > 0) {
      // Everything the row was suggesting FOR is gone (say the burger was
      // removed) and only row picks are left: they become what the row
      // suggests for, instead of the row going blank.
      addedFromRowRef.current.clear();
      ids = [...all];
    }
    return ids.sort((a, b) => a - b).join(',');
  }, [items]);

  // Row picks still in the cart — the header says so. After cartKey, which
  // may just have handed the row picks back to the cart.
  const addedCount = useMemo(() => {
    const picked = new Set();
    for (const line of items) {
      const id = Number(line.product?.id);
      if (!isComboLine(line) && addedFromRowRef.current.has(id)) picked.add(id);
    }
    return picked.size;
  }, [items]);

  useEffect(() => {
    if (!cartKey) {
      setProducts([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      cartApi.suggestions({
        productIds: cartKey.split(','),
        latitude: coords?.lat,
        longitude: coords?.lng,
        limit: SUGGESTION_LIMIT,
      })
        .then((response) => {
          if (cancelled) return;
          hasLoadedRef.current = true;
          setProducts(asArray(response, ['products']).map(normalizeProduct));
        })
        .catch(() => {
          if (cancelled) return;
          // Keep what is showing; hide the row only if nothing ever loaded.
          if (!hasLoadedRef.current) setProducts([]);
        });
    }, hasLoadedRef.current ? REFETCH_DEBOUNCE_MS : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cartKey, coords?.lat, coords?.lng]);

  // One "shown" per product per visit to the cart — the server learns which
  // suggestions people skip.
  useEffect(() => {
    if (!products) return;
    for (const product of products) {
      const id = Number(product.id);
      if (shownRef.current.has(id)) continue;
      shownRef.current.add(id);
      trackEvent('suggestion_impression', { productId: id });
    }
  }, [products]);

  // Quantity when the size sheet opened — "added" is only counted if it grew.
  const sheetStartQtyRef = useRef(0);

  const handleAdd = useCallback((product) => {
    const id = Number(product.id);
    addedFromRowRef.current.add(id);
    if ((product.variants?.length ?? 0) > 1) {
      sheetStartQtyRef.current = quantityOf(useCartStore.getState().items, product.id);
      setVariantProduct(product);
    } else {
      trackEvent('suggestion_add', { productId: id, price: Number(product.price) || 0 });
      addItem(product, 1, product.variants?.[0] ?? null);
    }
  }, [addItem]);

  const handleIncrement = useCallback((product) => {
    const existing = useCartStore.getState().items
      .find((line) => line.product.id === product.id && !isComboLine(line));
    addItem(product, 1, existing?.variant ?? product.variants?.[0] ?? null);
  }, [addItem]);

  const handleDecrement = useCallback((product) => {
    const existing = useCartStore.getState().items
      .find((line) => line.product.id === product.id && !isComboLine(line));
    if (!existing) return;
    const variantId = existing.variant?.id ?? null;
    if ((existing.quantity || 0) <= 1) removeItem(product.id, 'product', variantId);
    else updateQuantity(product.id, existing.quantity - 1, 'product', variantId);
  }, [removeItem, updateQuantity]);

  // A size picked → count the add. Sheet closed without one → no "added"
  // event, and the product is not treated as a row pick.
  const closeVariantSheet = useCallback(() => {
    if (variantProduct) {
      const id = Number(variantProduct.id);
      const quantity = quantityOf(useCartStore.getState().items, variantProduct.id);
      if (quantity > sheetStartQtyRef.current) {
        trackEvent('suggestion_add', { productId: id, price: Number(variantProduct.price) || 0 });
      } else if (quantity === 0) {
        addedFromRowRef.current.delete(id);
      }
    }
    setVariantProduct(null);
  }, [variantProduct]);

  if (products && products.length === 0) return null;

  return (
    <View style={styles.section} testID="cart-suggestions">
      <View style={styles.panel}>
        <LinearGradient
          colors={PANEL_TINT}
          locations={[0, 0.6]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        <View style={styles.header}>
          <LinearGradient
            colors={[colors.btnHighlightStart, colors.btnHighlightEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.badge}
          >
            <AppIcon name="sparkles" size={16} color={colors.white} strokeWidth={2.4} />
          </LinearGradient>
          <View style={styles.headerText}>
            <Text style={styles.title} accessibilityRole="header">People also ordered</Text>
            {addedCount > 0 ? (
              <View style={styles.addedLine} accessibilityLiveRegion="polite">
                <AppIcon name="check" size={12} color={colors.successDark} strokeWidth={3} />
                <Text style={styles.addedText}>
                  {addedCount === 1 ? '1 item added from here' : `${addedCount} items added from here`}
                </Text>
              </View>
            ) : (
              <Text style={styles.subtitle}>Goes well with your cart</Text>
            )}
          </View>
        </View>

        {products === null ? (
          <View style={styles.skeletonRow}>
            {[0, 1, 2].map((key) => (
              <SkeletonCard key={key} style={{ width: cardWidth, marginRight: spacing.md }} />
            ))}
          </View>
        ) : (
          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.rowContent}
            renderItem={({ item, index }) => (
              <SuggestionCard
                item={item}
                index={index}
                width={cardWidth}
                reduceMotion={reduceMotion}
                onAdd={handleAdd}
                onIncrement={handleIncrement}
                onDecrement={handleDecrement}
              />
            )}
          />
        )}
      </View>
      <VariantSheet visible={!!variantProduct} product={variantProduct} onClose={closeVariantSheet} />
    </View>
  );
}

// Same outline and shadow as the cart's other cards, so the page reads as one.
const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
    borderRadius: 16,
    backgroundColor: colors.bgSurface,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F7E1D3',
    overflow: 'hidden',
    paddingTop: 14,
    paddingBottom: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 1,
  },
  addedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  addedText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.successDark,
  },
  rowContent: {
    paddingLeft: 14,
    paddingRight: 0, // the last card's own margin closes the row
    paddingBottom: 2,
  },
  skeletonRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
  },
});
