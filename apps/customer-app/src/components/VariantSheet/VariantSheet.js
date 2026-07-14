import React, { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography, spacing, radius, shadows, borderWidth } from '../../theme';
import QuantityStepper from '../QuantityStepper';
import ProductImage from '../ProductImage';
import { useCartStore } from '../../stores/useCartStore';

/**
 * VariantSheet — bottom sheet listing a product's purchasable variants
 * (sizes/types), each with its own price, an Add button, and once added the
 * same +/- stepper used elsewhere. Mirrors CouponSheet's modal mechanics.
 *
 * Reads/writes the cart store directly so quantities live-update while the
 * sheet stays open — no prop drilling needed from the parent screen.
 */
export default function VariantSheet({ visible, product, onClose }) {
  const insets = useSafeAreaInsets();
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const updateQuantity = useCartStore((s) => s.updateQuantity);

  const variants = useMemo(
    () => (product?.variants || []).slice().sort((a, b) => a.displayOrder - b.displayOrder),
    [product],
  );

  const quantityForVariant = (variantId) => {
    if (!product) return 0;
    const item = items.find(
      (i) => i.product.id === product.id && i.type !== 'combo' && (i.variant?.id ?? null) === variantId,
    );
    return item?.quantity || 0;
  };

  if (!product) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}
          onPress={() => {}}
        >
          <View style={styles.header}>
            <ProductImage
              uri={product.imageUrl ?? product.imageUri}
              width={44}
              height={44}
              borderRadius={radius.md}
              resizeMode="cover"
            />
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.subtitle}>{product.variantPrompt || 'Choose an option'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.doneBtn} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={{ paddingBottom: spacing.lg }}
            showsVerticalScrollIndicator={false}
          >
            {variants.map((variant, index) => {
              const quantity = quantityForVariant(variant.id);
              const isOut = variant.available === false;
              return (
                <View
                  key={variant.id}
                  style={[styles.row, index === variants.length - 1 && styles.rowLast]}
                >
                  <View style={styles.rowText}>
                    <Text style={[styles.rowLabel, isOut && styles.rowLabelDisabled]} numberOfLines={1}>
                      {variant.label}
                    </Text>
                    <View style={styles.priceRow}>
                      <Text style={[styles.rowPrice, isOut && styles.rowLabelDisabled]}>₹{variant.price}</Text>
                      {variant.originalPrice ? (
                        <Text style={styles.rowOriginalPrice}>₹{Math.floor(Number(variant.originalPrice))}</Text>
                      ) : null}
                    </View>
                  </View>

                  {isOut ? (
                    <View style={styles.outPill}>
                      <Text style={styles.outPillText}>Out</Text>
                    </View>
                  ) : (
                    <QuantityStepper
                      quantity={quantity}
                      onAdd={() => addItem(product, 1, variant)}
                      onIncrement={() => updateQuantity(product.id, quantity + 1, 'product', variant.id)}
                      onDecrement={() => updateQuantity(product.id, quantity - 1, 'product', variant.id)}
                      compact
                      dense
                    />
                  )}
                </View>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlayDark,
  },
  sheet: {
    backgroundColor: colors.bgApp,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  doneBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
    ...shadows.xs,
  },
  doneBtnText: {
    ...typography.label,
    fontSize: 15,
    color: colors.saffronDark,
    fontWeight: '800',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidth.thin,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowLabel: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  rowLabelDisabled: {
    color: colors.textTertiary,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  rowPrice: {
    ...typography.label,
    color: colors.saffronDark,
    fontWeight: '800',
  },
  rowOriginalPrice: {
    ...typography.caption,
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
  outPill: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: borderWidth.thin,
    borderColor: colors.border,
  },
  outPillText: {
    ...typography.caption,
    color: colors.textTertiary,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});
