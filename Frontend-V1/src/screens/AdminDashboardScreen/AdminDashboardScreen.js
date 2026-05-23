/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { AppScreen, AppHeader, Button } from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useAdminAuthStore } from '../../stores';
import { adminDashboardApi, adminSettingsApi } from '../../api';
import { normalizeDashboard } from '../../utils';

export default function AdminDashboardScreen() {
  const navigation = useNavigation();
  const adminLogout = useAdminAuthStore(state => state.adminLogout);
  const setAdminMode = useAdminAuthStore(state => state.setAdminMode);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [isShopOpen, setIsShopOpen] = useState(false);

  // Animations
  const contentFade = useRef(new Animated.Value(0)).current;
  const metricsAnim = useRef(new Animated.Value(0)).current;
  const ordersAnim = useRef(new Animated.Value(0)).current;

  const loadData = (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    adminDashboardApi.getDashboard().then(response => {
      const res = normalizeDashboard(response);
      setData(res);
      setIsShopOpen(res.isShopOpen);
      if (refresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
        runEnterAnimations();
      }
    }).catch(() => {
      if (refresh) {
        setIsRefreshing(false);
      } else {
        setIsLoading(false);
      }
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  const runEnterAnimations = () => {
    Animated.stagger(150, [
      Animated.timing(contentFade, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(metricsAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(ordersAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();
  };

  const handleLogout = () => {
    adminLogout();
    setAdminMode(false);
  };

  const toggleShop = () => {
    const nextOpen = !isShopOpen;
    setIsShopOpen(nextOpen);
    adminSettingsApi.updateSettings({ shop_open: nextOpen }).catch(() => {
      setIsShopOpen(!nextOpen);
    });
  };

  if (isLoading) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="Admin Dashboard" />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading Dashboard...</Text>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader 
        title="Admin Dashboard" 
        rightNode={
          <TouchableOpacity onPress={handleLogout} style={styles.headerBtn}>
            <Text style={styles.headerIcon}>Out</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => loadData(true)} />}
      >
        <Animated.View style={{ opacity: contentFade }}>
          
          {/* Top Actions & Toggle */}
          <View style={styles.topSection}>
            <View style={styles.shopToggleBox}>
              <View>
                <Text style={styles.sectionTitle}>Shop Status</Text>
                <Text style={[styles.statusText, { color: isShopOpen ? colors.success : colors.error }]}>
                  {isShopOpen ? 'Accepting Orders' : 'Currently Closed'}
                </Text>
              </View>
              <Switch
                value={isShopOpen}
                onValueChange={toggleShop}
                trackColor={{ false: colors.border, true: colors.success + '80' }}
                thumbColor={isShopOpen ? colors.success : colors.textTertiary}
              />
            </View>

            <View style={styles.navRow}>
              <Button label="Manage Orders" variant="outline" onPress={() => navigation.navigate('AdminOrders')} style={styles.navBtn} />
              <Button label="Manage Products" variant="outline" onPress={() => navigation.navigate('AdminProducts')} style={styles.navBtn} />
            </View>
            <Button label="Store Settings" variant="ghost" onPress={() => navigation.navigate('AdminSettings')} style={{ marginTop: 8 }} />
          </View>

          {/* Key Metrics */}
          <Animated.View style={[styles.section, { opacity: metricsAnim, transform: [{ translateY: metricsAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <Text style={styles.sectionTitle}>Today's Overview</Text>
            
            <View style={styles.gridRow}>
              <MetricCard title="Today Orders" value={data.metrics.todayOrders} icon="Bag" />
              <MetricCard title="Today Sales" value={`Rs. ${data.metrics.todaySales}`} icon="Rs" />
            </View>
            
            <View style={styles.gridRow}>
              <MetricCard title="Pending" value={data.metrics.pendingOrders} color={colors.warning} />
              <MetricCard title="Delivered" value={data.metrics.deliveredOrders} color={colors.success} />
            </View>

            <View style={styles.gridRow}>
              <MetricCard title="Cash (COD)" value={`Rs. ${data.metrics.cashTotal}`} />
              <MetricCard title="UPI / Online" value={`Rs. ${data.metrics.upiTotal}`} />
            </View>

          </Animated.View>

          {/* Product Alerts */}
          {data.productAlerts.outOfStock > 0 && (
            <View style={styles.alertBox}>
              <Text style={styles.alertIcon}>!</Text>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>{data.productAlerts.outOfStock} Products Out of Stock</Text>
                <Text style={styles.alertSubtitle}>Please update inventory to accept orders.</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('AdminProducts')}>
                <Text style={styles.alertAction}>View</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Latest Orders */}
          <Animated.View style={[styles.section, { opacity: ordersAnim, transform: [{ translateY: ordersAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Latest Orders</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AdminOrders')}>
                <Text style={styles.linkText}>View All</Text>
              </TouchableOpacity>
            </View>

            {data.latestOrders.map((order, idx) => (
              <View key={order.id} style={styles.orderCard}>
                <View style={styles.orderCardHeader}>
                  <Text style={styles.orderId}>{order.id}</Text>
                  <View style={[styles.badge, { backgroundColor: order.status === 'Pending' ? colors.warning + '1A' : colors.success + '1A' }]}>
                    <Text style={[styles.badgeText, { color: order.status === 'Pending' ? colors.warning : colors.success }]}>{order.status}</Text>
                  </View>
                </View>
                <Text style={styles.orderCustomer}>{order.customer?.name || 'Customer'}</Text>
                <View style={styles.orderCardFooter}>
                  <Text style={styles.orderTotal}>Rs. {order.total} • {order.paymentStatus}</Text>
                  <TouchableOpacity style={styles.openBtn} onPress={() => navigation.navigate('AdminOrderDetail', { orderId: order.id })}>
                    <Text style={styles.openBtnText}>Open</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </Animated.View>

          {/* Top Products */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top 5 Products</Text>
            {data.topProducts.map((p, idx) => (
              <View key={p.id} style={styles.topProductRow}>
                <Text style={styles.topRank}>#{idx + 1}</Text>
                <View style={styles.topProductInfo}>
                  <Text style={styles.topProductName}>{p.name}</Text>
                  <Text style={styles.topProductSales}>{p.sales} sales • Rs. {p.amount}</Text>
                </View>
              </View>
            ))}
          </View>

        </Animated.View>
      </ScrollView>
    </AppScreen>
  );
}

function MetricCard({ title, value, icon, color = colors.primary }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricHeader}>
        {icon && <Text style={styles.metricIcon}>{icon}</Text>}
        <Text style={styles.metricTitle}>{title}</Text>
      </View>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
    </View>
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
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  headerBtn: {
    padding: spacing.xs,
  },
  headerIcon: {
    fontSize: 20,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  topSection: {
    marginBottom: spacing.xl,
  },
  shopToggleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
    marginTop: 2,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navBtn: {
    flex: 1,
  },
  section: {
    marginBottom: spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  linkText: {
    ...typography.button,
    color: colors.primary,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bgSurface,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  metricIcon: {
    marginRight: spacing.xs,
    fontSize: 16,
  },
  metricTitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  metricValue: {
    ...typography.h2,
  },
  alertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error + '1A',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error + '40',
    marginBottom: spacing.xxl,
  },
  alertIcon: {
    fontSize: 24,
    marginRight: spacing.sm,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    ...typography.labelLarge,
    color: colors.error,
  },
  alertSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  alertAction: {
    ...typography.button,
    color: colors.error,
    padding: spacing.sm,
  },
  orderCard: {
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  orderCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  orderId: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: {
    ...typography.caption,
    fontWeight: '700',
  },
  orderCustomer: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  orderTotal: {
    ...typography.label,
    color: colors.textPrimary,
  },
  openBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primary + '1A',
    borderRadius: radius.sm,
  },
  openBtnText: {
    ...typography.button,
    color: colors.primary,
    fontSize: 12,
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  topRank: {
    ...typography.h3,
    color: colors.primary,
    width: 40,
  },
  topProductInfo: {
    flex: 1,
  },
  topProductName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  topProductSales: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
