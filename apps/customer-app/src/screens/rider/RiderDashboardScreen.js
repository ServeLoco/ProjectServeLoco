import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { riderApi } from '../../api';
import ShopToggle from '../../components/shop/ShopToggle';
import AppIcon from '../../components/AppIcon';

/**
 * RiderDashboardScreen (TASK 10 shell)
 * Online toggle + placeholder for active job / offer (TASK 11–12 fill in popup + job card).
 */
export default function RiderDashboardScreen() {
  const rider = useAuthStore((s) => s.rider);
  const setRider = useAuthStore((s) => s.setRider);
  const logout = useAuthStore((s) => s.logout);

  const [isOnline, setIsOnline] = useState(Boolean(rider?.isOnline || rider?.is_online));
  const [toggleBusy, setToggleBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [error, setError] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const me = await riderApi.getMe();
      if (me?.rider) {
        setRider(me.rider);
        setIsOnline(Boolean(me.rider.isOnline || me.rider.is_online));
      }
      setActiveOffer(me?.activeOffer || me?.active_offer || null);
      setAssignment(me?.currentAssignment || me?.current_assignment || null);
    } catch (err) {
      setError(err?.message || 'Could not load rider status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [setRider]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleToggle = useCallback(async (next) => {
    setToggleBusy(true);
    try {
      const res = await riderApi.setOnline(next);
      const r = res?.rider;
      if (r) setRider(r);
      setIsOnline(next);
      await fetchAll();
    } catch (err) {
      Alert.alert('Could not update status', err?.message || 'Try again');
    } finally {
      setToggleBusy(false);
    }
  }, [fetchAll, setRider]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Rider mode</Text>
          <Text style={styles.title}>{rider?.displayName || rider?.display_name || 'Rider'}</Text>
        </View>
        <TouchableOpacity onPress={logout} hitSlop={12}>
          <AppIcon name="logout" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>You are {isOnline ? 'online' : 'offline'}</Text>
            <Text style={styles.cardSub}>
              {isOnline
                ? 'Eligible for new delivery offers'
                : 'Go online to receive order offers'}
            </Text>
          </View>
          <ShopToggle
            value={isOnline}
            onValueChange={handleToggle}
            disabled={toggleBusy || loading}
            activeColor={colors.success}
          />
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.saffron} />
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {activeOffer ? (
            <View style={[styles.card, styles.offerCard]}>
              <Text style={styles.cardTitle}>Pending offer</Text>
              <Text style={styles.cardSub}>
                Order #{activeOffer.orderNumber || activeOffer.order_number}
                {activeOffer.secondsRemaining != null
                  ? ` · ${activeOffer.secondsRemaining}s left`
                  : ''}
              </Text>
              <Text style={styles.hint}>Full accept/reject popup arrives in the next task.</Text>
            </View>
          ) : null}

          {assignment ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Active delivery</Text>
              <Text style={styles.cardSub}>
                #{assignment.orderNumber || assignment.order_number} · {assignment.status}
              </Text>
              <Text style={styles.hint}>{assignment.address}</Text>
            </View>
          ) : (
            !activeOffer && (
              <View style={styles.empty}>
                <AppIcon name="orders" size={36} color={colors.grey300} />
                <Text style={styles.emptyTitle}>No active job</Text>
                <Text style={styles.emptySub}>
                  Stay online. New offers appear here when shops accept orders.
                </Text>
              </View>
            )
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kicker: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  title: { ...typography.h2, color: colors.textPrimary, marginTop: 2 },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  offerCard: { borderWidth: 1, borderColor: colors.saffron },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardTitle: { ...typography.bodyBold, color: colors.textPrimary },
  cardSub: { ...typography.caption, color: colors.textSecondary, marginTop: 4 },
  hint: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  body: { flex: 1 },
  error: { color: colors.error, margin: spacing.lg },
  empty: {
    alignItems: 'center',
    marginTop: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: { ...typography.bodyBold, color: colors.textPrimary, marginTop: spacing.md },
  emptySub: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
