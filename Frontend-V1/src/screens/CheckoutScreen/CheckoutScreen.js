import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  TextInputField,
  Button,
} from '../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';
import { useCartStore, useSettingsStore, useAuthStore } from '../../stores';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MOCK_MAP_URL = "https://maps.google.com/?q=28.6139,77.2090";

export default function CheckoutScreen() {
  const navigation = useNavigation();
  const { items, clearCart } = useCartStore();
  const shopStatus = useSettingsStore(state => state.shopStatus);
  const userProfile = useAuthStore(state => state.profile);

  // Form State
  const [address, setAddress] = useState(userProfile?.address || '');
  const [coordinates, setCoordinates] = useState(null);
  const [gpsStatus, setGpsStatus] = useState('idle'); // idle | loading | success | error
  const [paymentMethod, setPaymentMethod] = useState('Cash'); // Cash | UPI

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Animations
  const deliverySlide = useRef(new Animated.Value(20)).current;
  const paymentSlide = useRef(new Animated.Value(20)).current;
  const summarySlide = useRef(new Animated.Value(20)).current;
  const btnScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Staggered entrance
    Animated.stagger(100, [
      Animated.timing(deliverySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(paymentSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.timing(summarySlide, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [deliverySlide, paymentSlide, summarySlide]);

  const handleRequestGPS = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setGpsStatus('loading');
    
    // Simulate GPS fetch
    setTimeout(() => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      // Randomly simulate success or error (For mock purpose, let's stick to success mostly)
      if (Math.random() > 0.8) {
        setGpsStatus('error');
      } else {
        setGpsStatus('success');
        setCoordinates({ lat: 28.6139, lng: 77.2090 });
      }
    }, 1500);
  };

  const handlePlaceOrder = () => {
    if (!address.trim()) {
      setSubmitError('Please enter a delivery address');
      return;
    }
    if (shopStatus === 'closed') {
      setSubmitError('The shop is currently closed. We cannot accept orders right now.');
      return;
    }
    
    setSubmitError(null);
    setIsSubmitting(true);

    // Animate button loading state
    Animated.spring(btnScale, { toValue: 0.95, useNativeDriver: true }).start();

    // Simulate POST /orders
    setTimeout(() => {
      setIsSubmitting(false);
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true }).start();
      
      // On success: clear cart and navigate
      clearCart();
      navigation.navigate('OrderConfirmation');
    }, 2000);
  };

  // Compute Bill Summary Locally for display
  let subtotal = 0;
  items.forEach(item => {
    subtotal += item.product.price * item.quantity;
  });
  const deliveryCharge = subtotal > 200 ? 0 : 30;
  const grandTotal = subtotal + deliveryCharge; // Simplified for checkout screen

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader
        title="Checkout"
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Delivery Details */}
        <Animated.View style={[styles.section, { transform: [{ translateY: deliverySlide }] }]}>
          <Text style={styles.sectionTitle}>Delivery Details</Text>
          
          <TextInputField
            label="Complete Address"
            placeholder="House No, Building, Street, Area"
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              if (submitError) setSubmitError(null);
            }}
            multiline
            numberOfLines={3}
            containerStyle={styles.addressInput}
          />

          <View style={styles.gpsContainer}>
            {gpsStatus === 'idle' || gpsStatus === 'error' ? (
              <Button 
                label={gpsStatus === 'error' ? "Retry GPS Location" : "Use Current Location"}
                variant="outline"
                onPress={handleRequestGPS}
                style={styles.gpsBtn}
              />
            ) : gpsStatus === 'loading' ? (
              <View style={styles.gpsLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.gpsLoadingText}>Fetching location...</Text>
              </View>
            ) : (
              <View style={styles.gpsSuccess}>
                <Text style={styles.gpsSuccessIcon}>Loc</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.gpsSuccessText}>Location Pinned</Text>
                  <Text style={styles.gpsCoords}>{coordinates?.lat}, {coordinates?.lng}</Text>
                </View>
                {/* Simulated Open Map action */}
                <TouchableOpacity style={styles.mapActionBtn}>
                  <Text style={styles.mapActionText}>Map</Text>
                </TouchableOpacity>
              </View>
            )}

            {gpsStatus === 'error' && (
              <Text style={styles.gpsErrorText}>Failed to get location. Please try again.</Text>
            )}
          </View>
        </Animated.View>

        {/* Payment Method */}
        <Animated.View style={[styles.section, { transform: [{ translateY: paymentSlide }] }]}>
          <Text style={styles.sectionTitle}>Payment Method</Text>
          
          <View style={styles.paymentOptions}>
            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.paymentBox, paymentMethod === 'Cash' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('Cash')}
            >
              <Text style={styles.paymentIcon}>Cash</Text>
              <Text style={[styles.paymentText, paymentMethod === 'Cash' && styles.paymentTextActive]}>Cash on Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              activeOpacity={0.8}
              style={[styles.paymentBox, paymentMethod === 'UPI' && styles.paymentBoxActive]}
              onPress={() => setPaymentMethod('UPI')}
            >
              <Text style={styles.paymentIcon}>UPI</Text>
              <Text style={[styles.paymentText, paymentMethod === 'UPI' && styles.paymentTextActive]}>UPI / Online</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={styles.paymentPendingNote}>
            {paymentMethod === 'UPI' ? 'You will be redirected to UPI app after placing the order.' : 'Pay cash to the delivery executive.'}
          </Text>
        </Animated.View>

        {/* Order Summary */}
        <Animated.View style={[styles.section, { transform: [{ translateY: summarySlide }] }]}>
          <Text style={styles.sectionTitle}>Order Summary</Text>
          
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Items ({items.length})</Text>
              <Text style={styles.summaryValue}>Rs. {subtotal}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Delivery</Text>
              <Text style={styles.summaryValue}>{deliveryCharge === 0 ? 'FREE' : `Rs. ${deliveryCharge}`}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>Total to Pay</Text>
              <Text style={styles.summaryTotalValue}>Rs. {grandTotal}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Global Error Banner */}
        {submitError && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError}</Text>
          </View>
        )}

      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <Animated.View style={{ transform: [{ scale: btnScale }] }}>
          <Button 
            label={isSubmitting ? "Processing..." : `Place Order • Rs. ${grandTotal}`}
            onPress={handlePlaceOrder}
            disabled={isSubmitting || items.length === 0}
            style={styles.placeOrderBtn}
          />
        </Animated.View>
        <TouchableOpacity 
          style={styles.backToCartBtn}
          onPress={() => navigation.goBack()}
          disabled={isSubmitting}
        >
          <Text style={styles.backToCartText}>Back to Cart</Text>
        </TouchableOpacity>
      </View>

    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  section: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  addressInput: {
    marginBottom: spacing.md,
  },
  gpsContainer: {
    marginTop: spacing.sm,
  },
  gpsBtn: {
    alignSelf: 'flex-start',
  },
  gpsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gpsLoadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  gpsSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.success + '40',
  },
  gpsSuccessIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  gpsSuccessText: {
    ...typography.labelLarge,
    color: colors.success,
    fontWeight: '600',
  },
  gpsCoords: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  mapActionBtn: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapActionText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  gpsErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.sm,
  },
  paymentOptions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  paymentBox: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgApp,
  },
  paymentBoxActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '0D',
  },
  paymentIcon: {
    fontSize: 28,
    marginBottom: spacing.xs,
  },
  paymentText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  paymentTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  paymentPendingNote: {
    ...typography.caption,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
  summaryBox: {
    backgroundColor: colors.bgApp,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  summaryTotalLabel: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  summaryTotalValue: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  errorBanner: {
    margin: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.error + '1A',
    borderRadius: radius.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
  },
  errorBannerText: {
    ...typography.body,
    color: colors.error,
  },
  bottomBar: {
    backgroundColor: colors.bgSurface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: layout.bottomNavHeight,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.xl,
  },
  placeOrderBtn: {
    marginBottom: spacing.md,
  },
  backToCartBtn: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  backToCartText: {
    ...typography.label,
    color: colors.textSecondary,
  },
});
