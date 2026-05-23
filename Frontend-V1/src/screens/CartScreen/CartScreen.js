import React, { useState, useEffect, useRef } from 'react';
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
  Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  QuantityStepper,
  Button,
  IconButton,
} from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useCartStore, useSettingsStore } from '../../stores';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MINIMUM_ORDER_VALUE = 99;

export default function CartScreen() {
  const navigation = useNavigation();
  const { items, totalItems, displayTotal, updateQuantity, removeItem, clearCart } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const activeOffer = useSettingsStore(state => state.activeOffer);

  const [isCalculating, setIsCalculating] = useState(false);
  const [bill, setBill] = useState(null);
  const [calcError, setCalcError] = useState(null);

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const listOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [fadeAnim]);

  const calculateBill = () => {
    if (items.length === 0) {
      setBill(null);
      return;
    }

    setIsCalculating(true);
    setCalcError(null);

    // Crossfade bill area
    Animated.sequence([
      Animated.timing(listOpacity, { toValue: 0.5, duration: 100, useNativeDriver: true }),
    ]).start();

    // Mock API call to POST /cart/calculate
    setTimeout(() => {
      try {
        let subtotal = 0;
        items.forEach(item => {
          subtotal += item.product.price * item.quantity;
        });

        const deliveryCharge = subtotal > 200 ? 0 : 30;
        const nightCharge = new Date().getHours() >= 23 ? 20 : 0;
        const discount = activeOffer ? Math.floor(subtotal * 0.1) : 0; // 10% mock discount
        
        const grandTotal = subtotal + deliveryCharge + nightCharge - discount;

        setBill({
          subtotal,
          deliveryCharge,
          nightCharge,
          discount,
          grandTotal,
        });

        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
        setIsCalculating(false);
      } catch (err) {
        setIsCalculating(false);
        setCalcError('Failed to calculate bill');
        Animated.timing(listOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      }
    }, 800);
  };

  useEffect(() => {
    // Recalculate bill whenever items change
    calculateBill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeOffer]);

  const handleRemove = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    removeItem(id);
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
      <Text style={styles.emptyEmoji}>Cart</Text>
      <Text style={styles.emptyTitle}>Your cart is empty</Text>
      <Text style={styles.emptyDesc}>Looks like you haven't added anything to your cart yet.</Text>
      <Button 
        label="Start Shopping" 
        onPress={() => navigation.navigate('Home')}
        style={styles.emptyBtn}
      />
    </Animated.View>
  );

  const isCheckoutDisabled = 
    items.length === 0 || 
    isCalculating || 
    calcError || 
    shopStatus === 'closed' || 
    (bill && bill.subtotal < MINIMUM_ORDER_VALUE);

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Your Cart"
        onBack={() => navigation.goBack()}
        rightActions={items.length > 0 ? [
          {
            icon: <Text style={styles.clearText}>Clear</Text>,
            onPress: handleClear,
            label: 'Clear Cart'
          }
        ] : []}
      />

      {items.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Cart Items */}
            <Animated.View style={[styles.itemsList, { opacity: fadeAnim }]}>
              {items.map((item) => (
                <View key={item.product.id} style={styles.cartRow}>
                  <Image source={{ uri: item.product.imageUri }} style={styles.rowImg} />
                  
                  <View style={styles.rowDetails}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.product.name}</Text>
                    <Text style={styles.rowUnit}>{item.product.unit}</Text>
                    <Text style={styles.rowPrice}>Rs. {item.product.price}</Text>
                    
                    {!item.product.available && (
                      <Text style={styles.unavailableWarning}>Currently unavailable</Text>
                    )}
                  </View>

                  <View style={styles.rowActions}>
                    <QuantityStepper
                      compact
                      quantity={item.quantity}
                      onIncrement={() => updateQuantity(item.product.id, item.quantity + 1)}
                      onDecrement={() => {
                        if (item.quantity <= 1) handleRemove(item.product.id);
                        else updateQuantity(item.product.id, item.quantity - 1);
                      }}
                    />
                  </View>

                  <TouchableOpacity 
                    style={styles.removeBtn}
                    onPress={() => handleRemove(item.product.id)}
                  >
                    <Text style={styles.removeIcon}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
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
                    <Text style={styles.billValue}>Rs. {bill.subtotal}</Text>
                  </View>
                  
                  <View style={styles.billRow}>
                    <Text style={styles.billLabel}>Delivery Charge</Text>
                    <Text style={styles.billValue}>
                      {bill.deliveryCharge > 0 ? `Rs. ${bill.deliveryCharge}` : 'FREE'}
                    </Text>
                  </View>

                  {bill.nightCharge > 0 && (
                    <View style={styles.billRow}>
                      <Text style={styles.billLabel}>Night Charge (post 11 PM)</Text>
                      <Text style={styles.billValue}>Rs. {bill.nightCharge}</Text>
                    </View>
                  )}

                  {bill.discount > 0 && (
                    <View style={styles.billRow}>
                      <Text style={[styles.billLabel, styles.discountText]}>Discount Applied</Text>
                      <Text style={[styles.billValue, styles.discountText]}>- Rs. {bill.discount}</Text>
                    </View>
                  )}

                  <View style={styles.divider} />
                  
                  <View style={styles.billRow}>
                    <Text style={styles.grandTotalLabel}>Grand Total</Text>
                    <Text style={styles.grandTotalValue}>Rs. {bill.grandTotal}</Text>
                  </View>
                </View>
              ) : null}

              {/* Minimum Order Warning */}
              {bill && bill.subtotal < MINIMUM_ORDER_VALUE && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningText}>
                    Add items worth Rs. {MINIMUM_ORDER_VALUE - bill.subtotal} more to checkout.
                  </Text>
                </View>
              )}
            </Animated.View>
          </ScrollView>

          {/* Bottom Action Bar */}
          <View style={styles.bottomBar}>
            {shopStatus === 'closed' ? (
              <Button label="Shop is Closed" disabled style={styles.checkoutBtn} />
            ) : (
              <Button 
                label={bill ? `Proceed to Pay (Rs. ${bill.grandTotal})` : 'Checkout'} 
                onPress={handleCheckout}
                disabled={isCheckoutDisabled}
                style={styles.checkoutBtn}
              />
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
  clearText: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '600',
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
    backgroundColor: colors.bgSurface,
    marginBottom: spacing.lg,
  },
  cartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowImg: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    backgroundColor: colors.bgDisabled,
    marginRight: spacing.md,
  },
  rowDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  rowName: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '600',
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
    fontWeight: '700',
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
  },
  removeIcon: {
    fontSize: 24,
    color: colors.textTertiary,
    lineHeight: 24,
  },
  billSection: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
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
    backgroundColor: colors.primary + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
  },
  warningText: {
    ...typography.caption,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xxl,
    ...shadows.xl,
  },
  checkoutBtn: {
    width: '100%',
  },
});
