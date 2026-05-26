import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  ProductImage,
  QuantityStepper,
  Button,
  PressableScale,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useCartStore, useSettingsStore } from '../../../stores';
import { cartApi } from '../../../api';
import { normalizeCartCalculation } from '../../../utils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CartScreen() {
  const navigation = useNavigation();
  const { items, updateQuantity, removeItem, clearCart } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const minimumOrder = useSettingsStore(state => state.minimumOrder);

  const [isCalculating, setIsCalculating] = useState(false);
  const [bill, setBill] = useState(null);
  const [calcError, setCalcError] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listOpacity = useRef(new Animated.Value(1)).current;
  const arrowAnim = useRef(new Animated.Value(0)).current;
  const validItems = useMemo(
    () => items.filter(item => item?.product?.id),
    [items],
  );

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  useEffect(() => {
    // 1. Pulse chevron arrow animation loop
    const arrowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowAnim, {
          toValue: 5,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(arrowAnim, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );
    arrowLoop.start();

    return () => {
      arrowLoop.stop();
    };
  }, [arrowAnim]);

  const calculateBill = async () => {
    if (validItems.length === 0) {
      setBill(null);
      return;
    }

    setIsCalculating(true);
    setCalcError(null);

    // Crossfade bill area
    Animated.sequence([
      Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
    ]).start();

    try {
      const payload = {
        items: validItems.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          type: item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product'),
          isCombo: (item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product')) === 'combo',
        })),
      };
      const calculatedBill = normalizeCartCalculation(await cartApi.calculate(payload));
      setBill(calculatedBill);
      Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } catch (err) {
      setCalcError(err.message || 'Failed to calculate bill');
      Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } finally {
      setIsCalculating(false);
    }
  };

  useEffect(() => {
    // Recalculate bill whenever items change
    calculateBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, validItems]);

  const handleRemove = (id, type = 'product') => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    removeItem(id, type);
  };

  const handleClear = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearCart();
  };

  const handleCheckout = () => {
    navigation.navigate('Checkout');
  };

  const renderEmptyState = () => (
    <Animated.View style={[styles.emptyState, { opacity: fadeAnim }]}>
      <AppIcon name="cart" size={48} color={colors.textTertiary} style={styles.emptyEmoji} />
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptyDesc}>Looks like you haven't added anything to your cart yet.</Text>
      <Button 
        label="Start Shopping" 
        onPress={() => navigation.navigate('MainTabs', { screen: 'Home' })}
        style={styles.emptyBtn}
      />
    </Animated.View>
  );

  const isCheckoutDisabled = 
    validItems.length === 0 ||
    isCalculating || 
    calcError || 
    shopStatus === 'closed';
  const requiredMinimum = bill?.minimumOrder || minimumOrder || 0;

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Your Cart"
        onBack={() => navigation.goBack()}
        rightActions={validItems.length > 0 ? [
          {
            icon: (
              <>
                <AppIcon name="delete" size={12} color={colors.error} />
                <Text style={styles.clearText}>Clear</Text>
              </>
            ),
            onPress: handleClear,
            label: 'Clear Cart',
            style: styles.clearHeaderBtn,
          }
        ] : []}
      />

      {validItems.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Cart Items */}
            <Animated.View style={[styles.itemsList, { opacity: fadeAnim }]}>
              {validItems.map((item) => {
                const itemType = item.type || (item.product?.isCombo || item.product?.is_combo ? 'combo' : 'product');
                return (
                <View key={`${itemType}-${item.product.id}`} style={styles.cartRow}>
                  <ProductImage
                    uri={item.product.imageUri || item.product.imageUrl}
                    width={64}
                    height={64}
                    borderRadius={radius.md}
                    style={styles.rowImg}
                  />
                  
                  <View style={styles.rowDetails}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={styles.rowUnit}>{item.product.unit}</Text>
                    <Text style={styles.rowPrice}>₹{item.product.price}</Text>
                    
                    {!item.product.available && (
                      <Text style={styles.unavailableWarning}>Currently unavailable</Text>
                    )}
                  </View>

                  <View style={styles.rowActions}>
                    <QuantityStepper
                      compact
                      quantity={item.quantity}
                      onIncrement={() => updateQuantity(item.product.id, item.quantity + 1, itemType)}
                      onDecrement={() => {
                        if (item.quantity <= 1) handleRemove(item.product.id, itemType);
                        else updateQuantity(item.product.id, item.quantity - 1, itemType);
                      }}
                    />
                  </View>

                  <TouchableOpacity 
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.product.id, itemType)}
                    accessibilityRole="button"
                    accessibilityLabel="Remove item"
                  >
                    <AppIcon name="delete" size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>
                );
              })}
            </Animated.View>

            {/* Bill Summary */}
            <Animated.View style={[styles.billSection, { opacity: listOpacity }]}>
              <Text style={styles.billTitle}>Bill Summary</Text>
              
              {isCalculating ? (
                <Text style={styles.calcText}>Calculating totals...</Text>
              ) : calcError ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{calcError}</Text>
                  <Button label="Retry" size="small" variant="outline" onPress={calculateBill} />
                </View>
              ) : bill ? (
                <View style={styles.billDetails}>
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Item Total</Text>
                    <Text style={styles.billValue}>₹{bill.subtotal}</Text>
                  </View>
                  
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivery Charge</Text>
                    <Text style={[styles.billValue, bill.deliveryCharge === 0 && styles.freeDeliveryText]}>
                      {bill.deliveryCharge > 0 ? `₹${bill.deliveryCharge}` : 'FREE'}
                    </Text>
                  </View>

                  {bill.nightCharge > 0 && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Night Charge (post 11 PM)</Text>
                      <Text style={styles.billValue}>₹{bill.nightCharge}</Text>
                    </View>
                  )}

                  {bill.discount > 0 && (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, styles.discountText]}>Discount Applied</Text>
                      <Text style={[styles.billValue, styles.discountText]}>- ₹{bill.discount}</Text>
                    </View>
                  )}

                  <View style={styles.divider} />
                  
                  <View style={styles.billRow}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>₹{bill.grandTotal}</Text>
                  </View>
                </View>
              ) : null}

              {/* Free Delivery Threshold Note */}
              {bill && requiredMinimum > 0 && bill.subtotal < requiredMinimum && (
                <View style={styles.warningBox}>
                  <AppIcon name="box" size={16} color={colors.saffron || '#FF7A3A'} style={styles.warningIcon} />
                  <Text style={styles.warningText}>
                    Add items worth <Text style={styles.warningHighlight}>₹{(requiredMinimum - bill.subtotal).toFixed(0)}</Text> more
                    {bill.freeAboveThresholdActive ? <Text> for <Text style={styles.warningHighlight}>Free Delivery</Text></Text> : null}
                    <Text> (₹{bill.deliveryCharge} delivery fee currently applied).</Text>
                  </Text>
                </View>
              )}
            </Animated.View>
          </ScrollView>

          {/* Bottom Action Bar */}
          <View style={styles.bottomBar}>
            {shopStatus === 'closed' ? (
              <View style={[styles.customCheckoutBtn, styles.customCheckoutBtnDisabled]}>
                <Text style={styles.checkoutBtnTextDisabled}>Shop is Closed</Text>
              </View>
            ) : (
              <PressableScale
                onPress={handleCheckout}
                disabled={isCheckoutDisabled}
                style={[
                  styles.customCheckoutBtn,
                  isCheckoutDisabled && styles.customCheckoutBtnDisabled
                ]}
                scaleTo={0.96}
                accessibilityRole="button"
                accessibilityLabel={bill ? `Proceed to Pay, ₹${bill.grandTotal}` : 'Checkout'}
              >
                <View style={styles.checkoutBtnContent}>
                  <Text style={styles.checkoutBtnText}>
                    {bill ? `Proceed to Pay (₹${bill.grandTotal})` : 'Checkout'}
                  </Text>
                  <Animated.View style={[styles.checkoutBtnArrow, { transform: [{ translateX: arrowAnim }] }]}>
                    <AppIcon name="chevronRight" size={16} color="#FFFFFF" />
                  </Animated.View>
                </View>
              </PressableScale>
            )}
          </View>
        </View>
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  clearHeaderBtn: {
    width: 'auto',
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  clearText: {
    ...typography.labelSmall,
    color: colors.error,
    fontWeight: '700',
    fontSize: 11,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  emptyBtn: {
    minWidth: 200,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl * 2,
  },
  itemsList: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'transparent',
    marginBottom: spacing.md,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  rowImg: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: '#F5F6F8',
    marginRight: spacing.md,
  },
  rowDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  rowName: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
    marginBottom: 2,
  },
  rowUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  rowPrice: {
    ...typography.label,
    color: colors.textPrimary,
    fontWeight: '800',
    fontSize: 13,
  },
  unavailableWarning: {
    ...typography.caption,
    color: colors.error,
    marginTop: 4,
  },
  rowActions: {
    marginLeft: spacing.md,
    alignItems: 'flex-end',
  },
  removeBtn: {
    marginLeft: spacing.md,
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  billSection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    marginTop: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  billTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  calcText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  errorBox: {
    backgroundColor: colors.error + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  billDetails: {
    gap: spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  billLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  billValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  discountText: {
    color: colors.success,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  grandTotalLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  grandTotalValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  warningBox: {
    marginTop: spacing.md,
    backgroundColor: colors.saffronLight || '#FFF2EB',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.saffron || '#FF7A3A',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  warningIcon: {
    marginRight: 2,
  },
  warningText: {
    ...typography.labelSmall,
    color: colors.saffronDark || '#E05A1A',
    flex: 1,
    lineHeight: 16,
  },
  warningHighlight: {
    fontWeight: '800',
    color: colors.saffronDark || '#E05A1A',
  },
  freeDeliveryText: {
    color: colors.success,
    fontWeight: '700',
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1.5,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
    ...shadows.lg,
  },
  customCheckoutBtn: {
    height: 52,
    backgroundColor: colors.success || '#1FB574',
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.sm,
  },
  customCheckoutBtnDisabled: {
    backgroundColor: colors.bgDisabled || '#DFE2E6',
  },
  checkoutBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  checkoutBtnText: {
    ...typography.buttonLarge,
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  checkoutBtnTextDisabled: {
    ...typography.buttonLarge,
    color: colors.textDisabled,
    fontWeight: '800',
    fontSize: 15,
  },
  checkoutBtnArrow: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
