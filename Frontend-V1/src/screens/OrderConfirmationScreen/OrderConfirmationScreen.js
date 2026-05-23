import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppScreen, Button } from '../../components';
import { colors, typography, spacing, radius } from '../../theme';

export default function OrderConfirmationScreen() {
  const navigation = useNavigation();

  // Animations
  const iconScale = useRef(new Animated.Value(0)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const detailsFade = useRef(new Animated.Value(0)).current;
  const detailsSlide = useRef(new Animated.Value(20)).current;
  const btnSlide = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    // Prevent back navigation to checkout
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.navigate('Home');
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

  const handleViewOrder = () => {
    navigation.navigate('OrderDetail', { orderId: 'OD-123456789' });
  };

  const handleContinueShopping = () => {
    navigation.navigate('Home');
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <View style={styles.content}>
        
        {/* Success Icon */}
        <Animated.View 
          style={[
            styles.iconWrapper, 
            { opacity: iconOpacity, transform: [{ scale: iconScale }] }
          ]}
        >
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>Done</Text>
          </View>
        </Animated.View>

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
              <Text style={styles.value}>OD-123456789</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Total Amount</Text>
              <Text style={styles.value}>Rs. 320 (Cash on Delivery)</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.col}>
              <Text style={styles.label}>Delivery Address</Text>
              <Text style={styles.addressValue}>
                A-12, Sector 4, Rohini, New Delhi
              </Text>
            </View>
          </View>
        </Animated.View>
        
        <View style={{ flex: 1 }} />

        {/* Actions */}
        <Animated.View style={[styles.actions, { transform: [{ translateY: btnSlide }] }]}>
          <Button 
            label="View Order" 
            onPress={handleViewOrder} 
            style={styles.primaryBtn} 
          />
          <TouchableOpacity 
            activeOpacity={0.7} 
            onPress={handleContinueShopping}
            style={styles.secondaryBtn}
          >
            <Text style={styles.secondaryBtnText}>Continue Shopping</Text>
          </TouchableOpacity>
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
    marginBottom: spacing.xxl,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.success + '1A', // transparent success green
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.success + '40',
  },
  iconText: {
    fontSize: 48,
    lineHeight: 56, // to center emoji vertically better on some androids
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
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
  actions: {
    paddingBottom: spacing.xxxl, // safe area padding
    gap: spacing.md,
  },
  primaryBtn: {
    width: '100%',
  },
  secondaryBtn: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryBtnText: {
    ...typography.labelLarge,
    color: colors.primary,
    fontWeight: '600',
  },
});
