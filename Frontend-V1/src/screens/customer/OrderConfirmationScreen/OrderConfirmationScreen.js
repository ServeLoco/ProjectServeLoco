import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  BackHandler,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppScreen, AppIcon } from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { normalizeOrder } from '../../../utils';

export default function OrderConfirmationScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const order = normalizeOrder(route.params?.order || {});
  const orderId = route.params?.orderId || order.id;
  const orderLabel = order.orderNumber || order.order_number || orderId || 'Pending';
  const total = order.total || order.bill?.grandTotal || 0;
  const deliveryCharge = order.bill?.delivery || 0;
  const deliveryLabel = order.bill?.belowThresholdDelivery ? 'Delivery Charge (Below Minimum)' : 'Delivery Charge';
  const paymentMethod = order.paymentMethod || 'Cash';
  const address = order.address || order.customer?.address || 'Delivery address saved with your order';

  // Animations
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const detailsFade = useRef(new Animated.Value(0)).current;
  const detailsSlide = useRef(new Animated.Value(20)).current;
  const btnSlide = useRef(new Animated.Value(40)).current;

  const ringScale1 = useRef(new Animated.Value(1)).current;
  const ringOpacity1 = useRef(new Animated.Value(0)).current;
  const ringScale2 = useRef(new Animated.Value(1)).current;
  const ringOpacity2 = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Keep completed checkout out of the back stack.
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.replace('MainTabs', { screen: 'Orders' });
      return true;
    });

    Animated.sequence([
      // 1. Pop the success icon
      Animated.parallel([
        Animated.spring(iconScale, { toValue: 1, friction: 5, useNativeDriver: true }),
        Animated.timing(iconOpacity, { toValue: 1, duration: 300, useNativeDriver: true })
      ]),
      // 2. Fade/slide details & buttons
      Animated.parallel([
        Animated.timing(detailsFade, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(detailsSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(btnSlide, { toValue: 0, duration: 400, delay: 100, useNativeDriver: true })
      ])
    ]).start();

    return () => backHandler.remove();
  }, [iconScale, iconOpacity, detailsFade, detailsSlide, btnSlide, navigation]);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    }).start();

    const redirectTimer = setTimeout(() => {
      if (orderId) {
        navigation.replace('OrderDetail', { orderId });
      } else {
        navigation.replace('MainTabs', { screen: 'Orders' });
      }
    }, 3000);

    return () => clearTimeout(redirectTimer);
  }, [navigation, orderId, progress]);

  useEffect(() => {
    const runRing1 = () => {
      ringScale1.setValue(1);
      ringOpacity1.setValue(0.5);
      Animated.parallel([
        Animated.timing(ringScale1, {
          toValue: 1.8,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity1, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        })
      ]).start(() => runRing1());
    };

    const runRing2 = () => {
      ringScale2.setValue(1);
      ringOpacity2.setValue(0.5);
      Animated.parallel([
        Animated.timing(ringScale2, {
          toValue: 1.8,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(ringOpacity2, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
          })
      ]).start(() => runRing2());
    };

    const t1 = setTimeout(() => runRing1(), 600);
    const t2 = setTimeout(() => runRing2(), 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [ringScale1, ringOpacity1, ringScale2, ringOpacity2]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <View style={styles.content}>
        
        {/* Success Icon */}
        <View style={styles.iconWrapper}>
          <Animated.View style={[styles.rippleRing, { opacity: ringOpacity1, transform: [{ scale: ringScale1 }] }]} />
          <Animated.View style={[styles.rippleRing, { opacity: ringOpacity2, transform: [{ scale: ringScale2 }] }]} />
          <Animated.View 
            style={[
              styles.iconCircle, 
              { opacity: iconOpacity, transform: [{ scale: iconScale }] }
            ]}
          >
            <AppIcon name="check" size={42} color={colors.success} strokeWidth={3} />
          </Animated.View>
        </View>

        {/* Order Details */}
        <Animated.View 
          style={[
            styles.detailsWrapper,
            { opacity: detailsFade, transform: [{ translateY: detailsSlide }] }
          ]}
        >
          <Text style={styles.title}>Order Placed Successfully!</Text>
          <Text style={styles.statusLabel}>Preparing your order...</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Order ID</Text>
              <Text style={styles.value}>{orderLabel}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Total Amount</Text>
              <Text style={styles.value}>₹{total} ({paymentMethod})</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>{deliveryLabel}</Text>
              <Text style={styles.value}>{deliveryCharge > 0 ? `₹${deliveryCharge}` : 'FREE'}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.col}>
              <Text style={styles.label}>Delivery Address</Text>
              <Text style={styles.addressValue}>
                {address}
              </Text>
            </View>
          </View>
        </Animated.View>
        
        <View style={{ flex: 1 }} />

        <Animated.View style={[styles.redirectBox, { transform: [{ translateY: btnSlide }] }]}>
          <Text style={styles.redirectText}>Opening order details...</Text>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
        </Animated.View>

      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxxl * 2,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 140,
    marginBottom: spacing.xl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.success,
    ...shadows.sm,
  },
  rippleRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: colors.success,
    backgroundColor: colors.successLight,
  },
  detailsWrapper: {
    alignItems: 'center',
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  statusLabel: {
    ...typography.body,
    color: colors.success,
    fontWeight: '600',
    marginBottom: spacing.xl,
  },
  card: {
    width: '100%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...shadows.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  col: {
    gap: spacing.xs,
  },
  label: {
    ...typography.body,
    color: colors.textSecondary,
  },
  value: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  addressValue: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  redirectBox: {
    paddingBottom: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  redirectText: {
    ...typography.label,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.bgInput,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: radius.pill,
    backgroundColor: colors.success,
  },
});
