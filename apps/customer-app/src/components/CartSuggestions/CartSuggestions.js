import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, StyleSheet, useWindowDimensions } from 'react-native';
import ProductCard from '../ProductCard';
import VariantSheet from '../VariantSheet';
import { SkeletonCard } from '../LoadingSkeleton';
import { useCartStore, useDeliveryLocationStore } from '../../stores';
import { cartApi } from '../../api';
import { trackEvent } from '../../api/analyticsClient';
import { asArray, normalizeProduct } from '../../utils';
import { colors, spacing } from '../../theme';

// The cart's "Add more" row: products that go with what is in the cart,
// learned by the server from what people ordered together. Draws nothing
// when there is nothing to suggest or the request fails — it must never get
// in the way of checking out.

const SUGGESTION_LIMIT = 5;
// Wait for the stepper taps to settle before asking again.
const REFETCH_DEBOUNCE_MS = 400;
const CARD_WIDTH_SHARE = 0.38;
const SIDE_PADDING = 20;

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
const SuggestionCard = React.memo(function SuggestionCard({ item, width, onAdd, onIncrement, onDecrement }) {
  const quantity = useCartStore((state) => quantityOf(state.items, item.id));
  return (
    <View style={{ width, marginRight: spacing.md }}>
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
    </View>
  );
});

export default function CartSuggestions() {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.floor((windowWidth - SIDE_PADDING) * CARD_WIDTH_SHARE);

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

  const handleAdd = useCallback((product) => {
    const id = Number(product.id);
    addedFromRowRef.current.add(id);
    trackEvent('suggestion_add', { productId: id, price: Number(product.price) || 0 });
    if ((product.variants?.length ?? 0) > 1) {
      setVariantProduct(product);
    } else {
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

  const closeVariantSheet = useCallback(() => setVariantProduct(null), []);

  if (products && products.length === 0) return null;

  return (
    <View style={styles.section} testID="cart-suggestions">
      <Text style={styles.title}>Add more</Text>
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
          renderItem={({ item }) => (
            <SuggestionCard
              item={item}
              width={cardWidth}
              onAdd={handleAdd}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
            />
          )}
        />
      )}
      <VariantSheet visible={!!variantProduct} product={variantProduct} onClose={closeVariantSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 10,
    marginLeft: 2,
  },
  skeletonRow: {
    flexDirection: 'row',
  },
});
