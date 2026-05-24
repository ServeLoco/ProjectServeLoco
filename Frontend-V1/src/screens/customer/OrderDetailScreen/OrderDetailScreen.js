import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  AppIcon,
  Button,
} from '../../../components';
import { colors, typography, spacing, radius, shadows } from '../../../theme';
import { useSettingsStore } from '../../../stores';
import { ordersApi } from '../../../api';
import { normalizeOrder } from '../../../utils';

const STATUS_STEPS = [
  { id: 'Received', label: 'Order Received' },
  { id: 'Preparing', label: 'Preparing' },
  { id: 'OutForDelivery', label: 'Out for Delivery' },
  { id: 'Delivered', label: 'Delivered' }
];

export default function OrderDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const orderId = route.params?.orderId;
  const supportPhone = useSettingsStore(state => state.supportPhone);

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Modal State
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  // Modal Animations
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    setIsLoading(true);
    setLoadError('');
    ordersApi.getOrder(orderId)
      .then(response => {
        setOrder(normalizeOrder(response?.order || response?.data || response));
      })
      .catch(error => setLoadError(error.message || 'Failed to load order'))
      .finally(() => setIsLoading(false));
  }, [orderId]);

  const openModal = () => {
    setShowCancelModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 1, friction: 6, useNativeDriver: true })
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.8, duration: 200, useNativeDriver: true })
    ]).start(() => {
      setShowCancelModal(false);
    });
  };

  const confirmCancel = () => {
    setIsCancelling(true);
    ordersApi.cancelOrder(order.id)
      .then(response => {
        const cancelled = normalizeOrder(response?.order || response?.data || response || {});
        setOrder(prev => ({
          ...prev,
          ...cancelled,
          id: prev.id,
          status: cancelled.status || 'Cancelled',
          canCancel: false,
        }));
        closeModal();
      })
      .finally(() => setIsCancelling(false));
  };

  const handleContact = () => {
    if (supportPhone) {
      Linking.openURL(`tel:${supportPhone}`);
    }
  };

  if (isLoading) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Order Details" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AppScreen>
    );
  }

  if (loadError || !order) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Order Details" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.infoValue}>{loadError || 'Order not found'}</Text>
          <Button label="Retry" onPress={() => navigation.replace('OrderDetail', { orderId })} fullWidth={false} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title={order.id} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Status Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Track Order</Text>
          {order.status === 'Cancelled' ? (
            <View style={styles.cancelledBox}>
              <Text style={styles.cancelledEmoji}>Cancelled</Text>
              <Text style={styles.cancelledText}>This order was cancelled.</Text>
            </View>
          ) : (
            <View style={styles.timeline}>
              {STATUS_STEPS.map((step, index) => {
                const stepIndex = STATUS_STEPS.findIndex(s => s.id === order.status);
                const isCompleted = index <= stepIndex;
                const isActive = index === stepIndex;

                return (
                  <TimelineStep 
                    key={step.id} 
                    label={step.label} 
                    isCompleted={isCompleted}
                    isActive={isActive}
                    isLast={index === STATUS_STEPS.length - 1}
                    index={index}
                  />
                );
              })}
            </View>
          )}
        </View>

        {/* Item List */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          {order.items.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemQtyBox}>
                <Text style={styles.itemQty}>{item.quantity}x</Text>
              </View>
              <View style={styles.itemDetails}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemUnit}>{item.unit}</Text>
              </View>
              <Text style={styles.itemPrice}>Rs. {item.price * item.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Delivery & Payment */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Delivery & Payment</Text>
          
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Address</Text>
            <Text style={styles.infoValue}>{order.address}</Text>
            <TouchableOpacity disabled={!order.mapUrl} onPress={() => order.mapUrl && Linking.openURL(order.mapUrl)}>
              <Text style={styles.mapLink}>View on Map</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.infoGroup}>
            <Text style={styles.infoLabel}>Payment Method</Text>
            <Text style={styles.infoValue}>{order.paymentMethod} • <Text style={{ color: order.paymentStatus === 'Paid' ? colors.success : colors.warning }}>{order.paymentStatus}</Text></Text>
          </View>

          {order.deliveryDistanceKm !== null && order.deliveryDistanceKm !== undefined ? (
            <View style={styles.infoGroup}>
              <Text style={styles.infoLabel}>Delivery Distance</Text>
              <Text style={styles.infoValue}>{Number(order.deliveryDistanceKm).toFixed(2)} km</Text>
            </View>
          ) : null}
        </View>

        {/* Bill Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill Summary</Text>
          
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Subtotal</Text>
            <Text style={styles.billValue}>Rs. {order.bill.subtotal}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Charge</Text>
            <Text style={styles.billValue}>Rs. {order.bill.delivery}</Text>
          </View>
          {order.bill.discount > 0 && (
            <View style={styles.billRow}>
              <Text style={[styles.billLabel, { color: colors.success }]}>Discount</Text>
              <Text style={[styles.billValue, { color: colors.success }]}>- Rs. {order.bill.discount}</Text>
            </View>
          )}
          <View style={styles.divider} />
          <View style={styles.billRow}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>Rs. {order.bill.grandTotal}</Text>
          </View>
        </View>

      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.bottomBar}>
        {order.canCancel && (
          <Button 
            label="Cancel Order" 
            variant="outline" 
            onPress={openModal} 
            style={styles.actionBtn} 
          />
        )}
        {supportPhone && (
          <Button 
            label="Contact Store" 
            variant="outline" 
            onPress={handleContact} 
            style={styles.actionBtn} 
          />
        )}
        <Button 
          label="Continue Shopping" 
          onPress={() => navigation.navigate('Home')} 
          style={styles.primaryActionBtn} 
        />
      </View>

      {/* Cancel Modal */}
      <Modal visible={showCancelModal} transparent animationType="none" onRequestClose={closeModal}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]} />
          <Animated.View style={[styles.modalContent, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
            <AppIcon name="orders" size={34} color={colors.warning} style={styles.modalIcon} />
            <Text style={styles.modalTitle}>Cancel Order?</Text>
            <Text style={styles.modalDesc}>Are you sure you want to cancel this order? This action cannot be undone.</Text>
            
            <View style={styles.modalActions}>
              <Button 
                label="Keep Order" 
                onPress={closeModal} 
                disabled={isCancelling}
                style={styles.modalBtn} 
              />
              <Button 
                label={isCancelling ? "Cancelling..." : "Cancel Order"} 
                variant="outline"
                onPress={confirmCancel} 
                disabled={isCancelling}
                style={[styles.modalBtn, { borderColor: colors.error }]} 
                textStyle={{ color: colors.error }}
              />
            </View>
          </Animated.View>
        </View>
      </Modal>

    </AppScreen>
  );
}

function TimelineStep({ label, isCompleted, isActive, isLast, index }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 150,
      useNativeDriver: true,
    }).start();
  }, [anim, index]);

  const color = isCompleted ? colors.primary : colors.border;
  const dotScale = isCompleted ? 1.2 : 1;

  return (
    <Animated.View style={[styles.stepRow, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
      <View style={styles.stepIndicator}>
        <View style={[styles.stepDot, { backgroundColor: color, transform: [{ scale: dotScale }] }]} />
        {!isLast && <View style={[styles.stepLine, { backgroundColor: isCompleted && !isActive ? colors.primary : colors.border }]} />}
      </View>
      <View style={styles.stepContent}>
        <Text style={[styles.stepLabel, { color: isCompleted ? colors.textPrimary : colors.textTertiary, fontWeight: isActive ? '700' : '400' }]}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
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
  timeline: {
    paddingVertical: spacing.xs,
  },
  stepRow: {
    flexDirection: 'row',
  },
  stepIndicator: {
    alignItems: 'center',
    width: 24,
    marginRight: spacing.md,
  },
  stepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 2,
  },
  stepLine: {
    width: 2,
    height: 40,
    marginTop: -2,
    marginBottom: -2,
    zIndex: 1,
  },
  stepContent: {
    flex: 1,
    paddingBottom: spacing.xxl,
  },
  stepLabel: {
    ...typography.body,
    marginTop: -4,
  },
  cancelledBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  cancelledEmoji: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  cancelledText: {
    ...typography.labelLarge,
    color: colors.error,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  itemQtyBox: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.bgApp,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemQty: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '700',
  },
  itemDetails: {
    flex: 1,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  itemUnit: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  itemPrice: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  infoGroup: {
    marginBottom: spacing.md,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  infoValue: {
    ...typography.body,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  mapLink: {
    ...typography.label,
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.xs,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  billLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  billValue: {
    ...typography.body,
    color: colors.textPrimary,
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
  bottomBar: {
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    paddingBottom: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  actionBtn: {
    marginBottom: spacing.xs,
  },
  primaryActionBtn: {
    marginTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '85%',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadows.xl,
  },
  modalIcon: {
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  modalActions: {
    width: '100%',
    gap: spacing.md,
  },
  modalBtn: {
    width: '100%',
  },
});
