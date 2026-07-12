import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { adminApi, getAdminRealtimeConnectionState, subscribeAdminRealtime, subscribeAdminRealtimeLifecycle } from '../../api';

// Poll fallback for the REST-backed sections (summary/products/window
// shoppers) — `live` itself is socket-pushed (analytics.live, every 5s
// server-side) and needs no polling; this just keeps the rest of the screen
// from going stale if the admin leaves it open a long time (ADMIN TASK 14.1).
const POLL_MS = 30000;
const DAY_PRESETS = [1, 7, 30];
const WINDOW_PRESETS = [
  { label: '1h', minutes: 60 },
  { label: '6h', minutes: 6 * 60 },
  { label: '24h', minutes: 24 * 60 },
  { label: '7d', minutes: 7 * 24 * 60 },
];

function fmtAgo(iso) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function fmtMin(totalMin) {
  const m = Math.round(totalMin);
  return m < 1 ? '<1 min' : `${m} min`;
}

/**
 * AdminAnalyticsScreen (ADMIN TASK 14) — live presence + summary lists, no
 * chart library (14.3 — daily-visitors bar chart and active-hours heatmap
 * from web are dropped, everything else is plain lists/cards). User
 * drill-down (AnalyticsUserDetail on web) is skipped per 14.5 — stays web-only.
 */
export default function AdminAnalyticsScreen() {
  const [days, setDays] = useState(7);
  const [live, setLive] = useState(null);
  const [connected, setConnected] = useState(false);
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState(null);
  const [windowShoppers, setWindowShoppers] = useState(null);
  const [loading, setLoading] = useState(false);

  const [findSearch, setFindSearch] = useState('');
  const [findMinutes, setFindMinutes] = useState(60);
  const [findResults, setFindResults] = useState(null);
  const [findLoading, setFindLoading] = useState(false);

  const fetchData = useCallback(async (d) => {
    try {
      setLoading(true);
      const [s, p, w] = await Promise.all([
        adminApi.analyticsSummary(d),
        adminApi.analyticsProducts(d),
        adminApi.analyticsWindowShoppers(7),
      ]);
      setSummary(s);
      setProducts(p);
      setWindowShoppers(w);
    } catch (_) {
      // best-effort — live panel + find-users still work independently
    } finally {
      setLoading(false);
    }
  }, []);

  // useFocusEffect only fires on focus/blur transitions, not on `days`
  // changing while already focused — a plain effect drives the actual
  // day-preset refetch; useFocusEffect just covers "came back to this tab".
  useFocusEffect(useCallback(() => { fetchData(days); }, [days, fetchData]));

  useEffect(() => {
    fetchData(days);
  }, [days, fetchData]);

  useEffect(() => {
    const id = setInterval(() => fetchData(days), POLL_MS);
    return () => clearInterval(id);
  }, [days, fetchData]);

  useEffect(() => {
    const unsub = subscribeAdminRealtime('analytics.live', (payload) => setLive(payload));
    const unsubLifecycle = subscribeAdminRealtimeLifecycle(({ eventName }) => {
      if (eventName === 'connected' || eventName === 'reconnected') setConnected(true);
      if (eventName === 'disconnected') setConnected(false);
    });
    setConnected(getAdminRealtimeConnectionState().connected);
    return () => {
      unsub();
      unsubLifecycle();
    };
  }, []);

  useEffect(() => {
    setFindLoading(true);
    const t = setTimeout(() => {
      adminApi.analyticsActiveUsers(findMinutes, findSearch || undefined)
        .then((res) => setFindResults(res?.data || []))
        .catch(() => setFindResults([]))
        .finally(() => setFindLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [findMinutes, findSearch]);

  const today = summary?.today || {};
  const windowLabel = WINDOW_PRESETS.find((p) => p.minutes === findMinutes)?.label || `${findMinutes}m`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Live</Text>
          <View style={styles.dayChips}>
            {DAY_PRESETS.map((d) => (
              <TouchableOpacity key={d} style={[styles.dayChip, days === d && styles.dayChipActive]} onPress={() => setDays(d)}>
                <Text style={[styles.dayChipText, days === d && styles.dayChipTextActive]}>{d}d</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Live presence */}
        <View style={styles.card}>
          <View style={styles.liveTop}>
            <View>
              <Text style={styles.liveNum}>{live?.online ?? '—'}</Text>
              <Text style={styles.liveLabel}>Online now</Text>
            </View>
            <View style={styles.socketStatus}>
              <View style={[styles.dot, { backgroundColor: connected ? colors.success : colors.error }]} />
              <Text style={styles.socketStatusText}>{connected ? 'Live' : 'Disconnected'}</Text>
            </View>
          </View>
          <Text style={styles.peakText}>Peak today: {live?.peakToday ?? '—'}</Text>
          {live ? (
            <View style={styles.chipsRow}>
              {Object.entries(live.byScreen || {}).map(([screen, count]) => (
                <View key={screen} style={styles.infoChip}>
                  <Text style={styles.infoChipText}>{screen}: {count}</Text>
                </View>
              ))}
              <View style={styles.infoChip}><Text style={styles.infoChipText}>Android: {live.byPlatform?.android || 0}</Text></View>
              <View style={styles.infoChip}><Text style={styles.infoChipText}>iOS: {live.byPlatform?.ios || 0}</Text></View>
            </View>
          ) : null}

          {live?.users?.length > 0 ? (
            live.users.map((u) => (
              <View key={u.userId} style={styles.userRow}>
                <Text style={styles.userName}>User {u.userId}</Text>
                <Text style={styles.userMeta}>{u.screen || '—'} · {u.platform || '—'} · {fmtMin(u.connectedMin)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>{connected ? 'No customers online right now.' : 'Connect to see live data.'}</Text>
          )}
        </View>

        {/* Find users */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Find users</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Search name or phone number…"
            placeholderTextColor={colors.textTertiary}
            value={findSearch}
            onChangeText={setFindSearch}
          />
          <View style={styles.chipsRow}>
            {WINDOW_PRESETS.map((p) => (
              <TouchableOpacity key={p.label} style={[styles.chip, findMinutes === p.minutes && styles.chipActive]} onPress={() => setFindMinutes(p.minutes)}>
                <Text style={[styles.chipText, findMinutes === p.minutes && styles.chipTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.hint}>
            {findSearch ? `Results for "${findSearch}" — active in last ${windowLabel}` : `Opened the app in the last ${windowLabel}`}
          </Text>
          {findLoading ? (
            <ActivityIndicator color={colors.saffron} style={{ marginTop: spacing.sm }} />
          ) : findResults && findResults.length > 0 ? (
            findResults.map((u) => (
              <View key={u.userId} style={styles.userRow}>
                <Text style={styles.userName}>{u.name || `User ${u.userId}`}</Text>
                <Text style={styles.userMeta}>{u.phone || '—'} · {u.sessions} sessions · {fmtAgo(u.lastActiveAt)}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No users found for this window{findSearch ? ' and search' : ''}.</Text>
          )}
        </View>

        {/* Today so far */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today so far</Text>
          {loading && !summary ? (
            <ActivityIndicator color={colors.saffron} />
          ) : (
            <View style={styles.statsGrid}>
              <Stat label="Visitors" value={today.visitors || 0} />
              <Stat label="Sessions" value={today.sessions || 0} />
              <Stat label="Orders" value={today.orders || 0} />
              <Stat label="Conversion" value={`${today.conversionPct || 0}%`} />
              <Stat label="Cart adds" value={today.cartAdds || 0} />
              <Stat label="Cart removes" value={today.cartRemoves || 0} />
            </View>
          )}
        </View>

        {/* Product behavior */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Product behavior</Text>
          <ProductList title="Most added" items={products?.topAdded} />
          <ProductList title="Most removed" items={products?.topRemoved} />
          <ProductList title="Most viewed" items={products?.topViewed} />
        </View>

        {/* Window shoppers */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Window shoppers (7d, never ordered)</Text>
          {(windowShoppers?.data || []).length > 0 ? (
            windowShoppers.data.map((w) => (
              <View key={w.userId} style={styles.userRow}>
                <Text style={styles.userName}>{w.name || `User ${w.userId}`}</Text>
                <Text style={styles.userMeta}>{w.phone || '—'} · {w.cartAdds} adds · {w.cartRemoves} removes</Text>
              </View>
            ))
          ) : (
            <Text style={styles.emptyText}>No window shoppers in this period.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ProductList({ title, items }) {
  const list = items || [];
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Text style={styles.subhead}>{title}</Text>
      {list.length === 0 ? (
        <Text style={styles.mutedText}>No data</Text>
      ) : (
        list.map((p) => (
          <View key={p.productId} style={styles.productRow}>
            <Text style={styles.productName}>{p.name || `#${p.productId}`}</Text>
            <Text style={styles.productCount}>{p.count}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { ...typography.display, fontSize: 24, color: colors.textPrimary },
  dayChips: { flexDirection: 'row', gap: spacing.xs },
  dayChip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  dayChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  dayChipTextActive: { color: colors.textInverse },
  card: {
    backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: spacing.md,
    borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md, ...shadows.sm,
  },
  cardTitle: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.sm },
  liveTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  liveNum: { fontSize: 32, fontWeight: '800', color: colors.textPrimary },
  liveLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  socketStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.circle },
  socketStatusText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  peakText: { fontSize: 12, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  infoChip: { backgroundColor: colors.bgApp, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  infoChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  chip: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, backgroundColor: colors.bgApp, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.saffron, borderColor: colors.saffron },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  chipTextActive: { color: colors.textInverse },
  searchInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 10, color: colors.textPrimary, marginBottom: spacing.sm },
  hint: { fontSize: 11, color: colors.textTertiary, marginBottom: spacing.sm },
  userRow: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  userName: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  userMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  emptyText: { fontSize: 13, color: colors.textSecondary, marginTop: spacing.xs },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { flexBasis: '30%', flexGrow: 1, backgroundColor: colors.bgApp, borderRadius: radius.lg, padding: spacing.sm, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  statLabel: { fontSize: 11, color: colors.textSecondary, marginTop: 2, textAlign: 'center' },
  subhead: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  mutedText: { fontSize: 12, color: colors.textTertiary },
  productRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  productName: { fontSize: 13, color: colors.textPrimary, flex: 1 },
  productCount: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
});
