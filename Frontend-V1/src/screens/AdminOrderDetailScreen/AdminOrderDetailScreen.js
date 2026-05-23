/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { AppScreen, AppHeader, Button } from '../../components';
import { colors, typography, spacing, radius, shadows, layout } from '../../theme';

// Mock API Call
const fetchAdminOrderDetails = (id) => new Promise(res => {
  setTimeout(() => {
    res({
      id: id || 'OD-101',
      date: 'Today, 08:30 PM',
      customer: {
        name: 'Rahul Sharma',
        phone: '+919876543210',
        whatsapp: '+919876543210',
        address: 'A-12, Sector 4, Rohini\nNew Delhi',
      },
      items: [
        { id: '1', name: 'Farmhouse Pizza', quantity: 1, price: 250, unit: 'Regular' },
        { id: '2', name: 'Garlic Bread', quantity: 1, price: 70, unit: '1 Pack' },
      ],
      bill: {
        subtotal: 320,
        delivery: 30,
        discount: 0,
        grandTotal: 350,
      },
      status: 'Pending',
      paymentStatus: 'Pending',
      paymentMethod: 'UPI'
    });
  }, 600);
});

const ORDER_STATUSES = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled'];
const PAYMENT_STATUSES = ['Pending', 'Paid', 'Failed', 'Refunded'];

export default function AdminOrderDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const orderId = route.params?.orderId || 'OD-101';

  const [order, setOrder] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Edit States
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');

  // Loading States for Updates
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Animations
  const animCust = useRef(new Animated.Value(0)).current;
  const animItems = useRef(new Animated.Value(0)).current;
  const animBill = useRef(new Animated.Value(0)).current;
  const animControls = useRef(new Animated.Value(0)).current;

  // Highlight Animations
  const statusHighlight = useRef(new Animated.Value(0)).current;
  const paymentHighlight = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchAdminOrderDetails(orderId).then(data => {
      setOrder(data);
      setSelectedStatus(data.status);
      setSelectedPayment(data.paymentStatus);
      setIsLoading(false);

      Animated.stagger(100, [
        Animated.timing(animCust, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(animItems, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(animBill, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(animControls, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    });
  }, [orderId]);

  const handleUpdateStatus = () => {
    if (selectedStatus === order.status) return;
    setIsUpdatingStatus(true);
    // Mock PATCH /admin/orders/:id/status
    setTimeout(() => {
      setIsUpdatingStatus(false);
      setOrder(prev => ({ ...prev, status: selectedStatus }));
      triggerHighlight(statusHighlight);
    }, 1000);
  };

  const handleUpdatePayment = () => {
    if (selectedPayment === order.paymentStatus) return;
    setIsUpdatingPayment(true);
    // Mock PATCH /admin/orders/:id/payment
    setTimeout(() => {
      setIsUpdatingPayment(false);
      setOrder(prev => ({ ...prev, paymentStatus: selectedPayment }));
      triggerHighlight(paymentHighlight);
    }, 1000);
  };

  const triggerHighlight = (animVal) => {
    animVal.setValue(0);
    Animated.sequence([
      Animated.timing(animVal, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.delay(1000),
      Animated.timing(animVal, { toValue: 0, duration: 400, useNativeDriver: false })
    ]).start();
  };

  const handleCall = () => Linking.openURL(`tel:${order.customer.phone}`);
  const handleWhatsApp = () => Linking.openURL(`whatsapp://send?phone=${order.customer.whatsapp}`);
  const handleMap = () => {
    const query = encodeURIComponent(order.customer.address);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${query}` : `geo:0,0?q=${query}`;
    Linking.openURL(url);
  };

  if (isLoading || !order) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Order Details" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </AppScreen>
    );
  }

  const interpolateBg = (animVal) => animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.bgSurface, colors.success + '33']
  });

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title={order.id} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Customer Section */}
        <Animated.View style={[styles.section, { opacity: animCust, transform: [{ translateY: animCust.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.customerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{order.customer.name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{order.customer.name}</Text>
              <Text style={styles.customerPhone}>{order.customer.phone}</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.iconBtn} onPress={handleCall}>
                <Text style={styles.iconBtnText}>Call</Text>
              </TouchableOpacity>
              {order.customer.whatsapp && (
                <TouchableOpacity style={styles.iconBtn} onPress={handleWhatsApp}>
                  <Text style={styles.iconBtnText}>Msg</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          <View style={styles.addressBox}>
            <View style={styles.addressRow}>
              <Text style={styles.addressIcon}>Loc</Text>
              <Text style={styles.addressText}>{order.customer.address}</Text>
            </View>
            <TouchableOpacity onPress={handleMap}>
              <Text style={styles.mapLink}>Open Map</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Items Section */}
        <Animated.View style={[styles.section, { opacity: animItems, transform: [{ translateY: animItems.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.sectionTitle}>Order Items</Text>
          {order.items.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{item.quantity}x</Text>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemUnit}>{item.unit}</Text>
              </View>
              <Text style={styles.itemPrice}>Rs. {item.price * item.quantity}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Bill Summary */}
        <Animated.View style={[styles.section, { opacity: animBill, transform: [{ translateY: animBill.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.sectionTitle}>Bill Summary</Text>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Subtotal</Text>
            <Text style={styles.billValue}>Rs. {order.bill.subtotal}</Text>
          </View>
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Charge</Text>
            <Text style={styles.billValue}>Rs. {order.bill.delivery}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.billRow}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>Rs. {order.bill.grandTotal}</Text>
          </View>
        </Animated.View>

        {/* Controls Section */}
        <Animated.View style={[styles.section, { opacity: animControls, transform: [{ translateY: animControls.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.sectionTitle}>Manage Order</Text>

          {/* Status Control */}
          <Animated.View style={[styles.controlBox, { backgroundColor: interpolateBg(statusHighlight) }]}>
            <Text style={styles.controlLabel}>Order Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {ORDER_STATUSES.map(s => (
                <TouchableOpacity 
                  key={s} 
                  style={[styles.chip, selectedStatus === s && styles.chipActive]}
                  onPress={() => setSelectedStatus(s)}
                >
                  <Text style={[styles.chipText, selectedStatus === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedStatus !== order.status && (
              <Button 
                label={isUpdatingStatus ? "Updating..." : "Update Status"} 
                onPress={handleUpdateStatus} 
                disabled={isUpdatingStatus}
                style={styles.updateBtn}
              />
            )}
          </Animated.View>

          {/* Payment Control */}
          <Animated.View style={[styles.controlBox, { backgroundColor: interpolateBg(paymentHighlight), marginTop: spacing.md }]}>
            <Text style={styles.controlLabel}>Payment Status • {order.paymentMethod}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {PAYMENT_STATUSES.map(s => (
                <TouchableOpacity 
                  key={s} 
                  style={[styles.chip, selectedPayment === s && styles.chipActive]}
                  onPress={() => setSelectedPayment(s)}
                >
                  <Text style={[styles.chipText, selectedPayment === s && styles.chipTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {selectedPayment !== order.paymentStatus && (
              <Button 
                label={isUpdatingPayment ? "Updating..." : "Update Payment"} 
                variant="outline"
                onPress={handleUpdatePayment} 
                disabled={isUpdatingPayment}
                style={styles.updateBtn}
              />
            )}
          </Animated.View>

        </Animated.View>

      </ScrollView>
    </AppScreen>
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
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarText: {
    ...typography.h3,
    color: colors.primary,
  },
  customerName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  customerPhone: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnText: {
    fontSize: 18,
  },
  addressBox: {
    backgroundColor: colors.bgApp,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },
  addressIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  addressText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
  },
  mapLink: {
    ...typography.button,
    color: colors.primary,
    marginLeft: 24,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  itemQty: {
    ...typography.labelLarge,
    color: colors.primary,
    fontWeight: '700',
    width: 24,
  },
  itemName: {
    ...typography.body,
    color: colors.textPrimary,
  },
  itemUnit: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemPrice: {
    ...typography.labelLarge,
    color: colors.textPrimary,
    fontWeight: '600',
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
  controlBox: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controlLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  chipScroll: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgApp,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  updateBtn: {
    marginTop: spacing.md,
  },
});
