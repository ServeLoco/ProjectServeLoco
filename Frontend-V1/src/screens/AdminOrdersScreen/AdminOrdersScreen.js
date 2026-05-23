/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Linking,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  PressableScale,
  SkeletonRow,
} from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';

// Mock API
const fetchAdminOrders = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 'OD-101', customer: 'Rahul Sharma', phone: '+919876543210', date: 'Today, 08:30 PM', total: 450, paymentStatus: 'Paid', paymentMethod: 'UPI', status: 'Pending', address: 'A-12, Sector 4, Rohini' },
        { id: 'OD-102', customer: 'Sneha Patel', phone: '+919876543211', date: 'Today, 08:45 PM', total: 1200, paymentStatus: 'Pending', paymentMethod: 'Cash', status: 'Pending', address: 'B-4, Vasant Kunj' },
        { id: 'OD-100', customer: 'Priya Singh', phone: '+919876543212', date: 'Today, 07:15 PM', total: 320, paymentStatus: 'Paid', paymentMethod: 'UPI', status: 'Preparing', address: 'C-2, Dwarka Sector 12' },
        { id: 'OD-099', customer: 'Amit Gupta', phone: '+919876543213', date: 'Today, 06:00 PM', total: 850, paymentStatus: 'Pending', paymentMethod: 'Cash', status: 'Out for Delivery', address: 'D-9, South Ex' },
        { id: 'OD-098', customer: 'Karan Mehra', phone: '+919876543214', date: 'Today, 05:30 PM', total: 210, paymentStatus: 'Paid', paymentMethod: 'UPI', status: 'Delivered', address: 'E-5, Lajpat Nagar' },
        { id: 'OD-097', customer: 'Vikram Das', phone: '+919876543215', date: 'Today, 04:00 PM', total: 1500, paymentStatus: 'Pending', paymentMethod: 'Cash', status: 'Cancelled', address: 'F-1, Pitampura' },
      ]);
    }, 800);
  });
};

const STATUS_FILTERS = ['Pending', 'Preparing', 'Out for Delivery', 'Delivered', 'Cancelled', 'All'];
const PAYMENT_FILTERS = ['All Payments', 'Pending', 'Paid', 'Cash', 'UPI'];

export default function AdminOrdersScreen() {
  const navigation = useNavigation();

  const [orders, setOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  const [activeStatus, setActiveStatus] = useState('Pending');
  const [activePayment, setActivePayment] = useState('All Payments');

  const listOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = () => {
    setIsLoading(true);
    setIsError(false);
    fetchAdminOrders()
      .then(data => {
        setOrders(data);
        setIsLoading(false);
        animateList();
      })
      .catch(() => {
        setIsError(true);
        setIsLoading(false);
      });
  };

  const animateList = () => {
    listOpacity.setValue(0);
    Animated.timing(listOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  };

  const handleStatusFilter = (status) => {
    setActiveStatus(status);
    animateList();
  };

  const handlePaymentFilter = (payment) => {
    setActivePayment(payment);
    animateList();
  };

  const filteredOrders = orders.filter(order => {
    const statusMatch = activeStatus === 'All' || order.status === activeStatus;
    
    let paymentMatch = true;
    if (activePayment === 'Pending') paymentMatch = order.paymentStatus === 'Pending';
    else if (activePayment === 'Paid') paymentMatch = order.paymentStatus === 'Paid';
    else if (activePayment === 'Cash') paymentMatch = order.paymentMethod === 'Cash';
    else if (activePayment === 'UPI') paymentMatch = order.paymentMethod === 'UPI';

    return statusMatch && paymentMatch;
  });

  const handleCall = (phone) => {
    Linking.openURL(`tel:${phone}`);
  };

  const handleWhatsApp = (phone) => {
    Linking.openURL(`whatsapp://send?phone=${phone}`);
  };

  const handleMap = (address) => {
    const query = encodeURIComponent(address);
    const url = Platform.OS === 'ios' ? `maps:0,0?q=${query}` : `geo:0,0?q=${query}`;
    Linking.openURL(url);
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader 
        title="Admin Orders" 
        onBack={() => navigation.goBack()}
        rightNode={
          <TouchableOpacity style={styles.headerBtn}>
            <Text style={styles.headerIcon}>Search</Text>
          </TouchableOpacity>
        }
      />

      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {STATUS_FILTERS.map(status => (
            <TouchableOpacity 
              key={`status-${status}`} 
              style={[styles.chip, activeStatus === status && styles.chipActive]}
              onPress={() => handleStatusFilter(status)}
            >
              <Text style={[styles.chipText, activeStatus === status && styles.chipTextActive]}>
                {status}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.filterScroll, { marginTop: spacing.sm }]}>
          {PAYMENT_FILTERS.map(payment => (
            <TouchableOpacity 
              key={`payment-${payment}`} 
              style={[styles.chipLine, activePayment === payment && styles.chipLineActive]}
              onPress={() => handlePaymentFilter(payment)}
            >
              <Text style={[styles.chipTextLine, activePayment === payment && styles.chipTextLineActive]}>
                {payment}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.skeletonList}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={styles.emptyMarker}>!</Text>
          <Text style={styles.emptyTitle}>Failed to load orders</Text>
          <Text style={styles.emptyText}>Please check your connection and try again.</Text>
          <PressableScale style={styles.retryBtn} onPress={loadOrders}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </PressableScale>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyMarker}>Empty</Text>
          <Text style={styles.emptyTitle}>No Orders Found</Text>
          <Text style={styles.emptyText}>
            No orders match the selected status and payment filters.
          </Text>
        </View>
      ) : (
        <Animated.ScrollView 
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          style={{ opacity: listOpacity }}
        >
          {filteredOrders.map((order, index) => {
            const isPending = order.status === 'Pending';
            const isPaid = order.paymentStatus === 'Paid';

            return (
              <AdminOrderCard 
                key={order.id}
                order={order}
                isPending={isPending}
                isPaid={isPaid}
                onCall={() => handleCall(order.phone)}
                onWhatsApp={() => handleWhatsApp(order.phone)}
                onMap={() => handleMap(order.address)}
                onOpen={() => navigation.navigate('AdminOrderDetail', { orderId: order.id })}
                index={index}
              />
            );
          })}
        </Animated.ScrollView>
      )}

    </AppScreen>
  );
}

function AdminOrderCard({ order, isPending, isPaid, onCall, onWhatsApp, onMap, onOpen, index }) {
  const slideAnim = useRef(new Animated.Value(20)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 50, useNativeDriver: true }).start();
    Animated.timing(slideAnim, { toValue: 0, duration: 300, delay: index * 50, useNativeDriver: true }).start();
  }, [index, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[styles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.orderId}>{order.id}</Text>
          <Text style={styles.orderDate}>{order.date}</Text>
        </View>
        <View style={[styles.statusBadge, isPending && styles.statusBadgeWarning]}>
          <Text style={[styles.statusText, isPending && styles.statusTextWarning]}>{order.status}</Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <View style={styles.customerRow}>
          <Text style={styles.customerIcon}>User</Text>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>{order.customer}</Text>
            <Text style={styles.customerPhone}>{order.phone}</Text>
          </View>
          <View style={styles.actionRow}>
            <PressableScale style={styles.iconBtn} onPress={onCall}>
              <Text style={styles.iconBtnText}>Call</Text>
            </PressableScale>
            <PressableScale style={styles.iconBtn} onPress={onWhatsApp}>
              <Text style={styles.iconBtnText}>Msg</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.addressRow}>
          <Text style={styles.customerIcon}>Loc</Text>
          <Text style={styles.addressText} numberOfLines={2}>{order.address}</Text>
          <PressableScale style={styles.iconBtnSmall} onPress={onMap}>
            <Text style={styles.iconBtnTextSmall}>Map</Text>
          </PressableScale>
        </View>
      </View>

      <View style={styles.cardFooter}>
        <View>
          <Text style={styles.totalText}>Rs. {order.total}</Text>
          <Text style={[styles.paymentText, { color: isPaid ? colors.success : colors.warning }]}>
            {order.paymentStatus} • {order.paymentMethod}
          </Text>
        </View>
        <TouchableOpacity style={styles.openBtn} onPress={onOpen}>
          <Text style={styles.openBtnText}>Open</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  headerIcon: {
    fontSize: 20,
  },
  filterSection: {
    backgroundColor: colors.bgSurface,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    ...shadows.sm,
  },
  filterScroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
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
    ...typography.label,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
    fontWeight: '600',
  },
  chipLine: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipLineActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '1A',
  },
  chipTextLine: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  chipTextLineActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  emptyMarker: {
    ...typography.h2,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  retryBtnText: {
    ...typography.button,
    color: colors.textInverse,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  orderId: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  orderDate: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    backgroundColor: colors.primary + '1A',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusBadgeWarning: {
    backgroundColor: colors.warning + '1A',
  },
  statusText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '700',
  },
  statusTextWarning: {
    color: colors.warning,
  },
  cardBody: {
    marginBottom: spacing.md,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  customerInfo: {
    flex: 1,
  },
  customerIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  customerName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  customerPhone: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnText: {
    fontSize: 14,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressText: {
    flex: 1,
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 20,
    marginRight: spacing.sm,
  },
  iconBtnSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBtnTextSmall: {
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalText: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  paymentText: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: 2,
  },
  openBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  openBtnText: {
    ...typography.button,
    color: colors.textInverse,
    fontSize: 14,
  },
});
