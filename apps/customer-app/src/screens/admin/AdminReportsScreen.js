import { adminUi } from '../../theme/adminUi';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { adminApi } from '../../api';
import AppIcon from '../../components/AppIcon';
import { useAdminReportData } from '../../hooks/useAdminReportData';
import { colors, radius, spacing, typography } from '../../theme';
import {
  OVERVIEW_PERIODS, REPORT_PERIODS, reportCount, reportMoney, reportNumber, reportRangeError, reportValue,
} from '../../utils/adminReports';

const unwrap = response => response?.data ?? response;
const val = reportValue;
const money = reportMoney;
const count = reportCount;

function Choice({ label, selected, onPress, disabled = false, tab = false }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive, tab && styles.tab, tab && selected && styles.tabActive, disabled && styles.disabled]}
      onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityState={{ selected, disabled }} accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextActive, tab && styles.tabText]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Section({ title, children }) {
  return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text>{children}</View>;
}

function Row({ label, value, danger = false }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, danger && styles.danger]}>{value}</Text>
    </View>
  );
}

function ResourceState({ resource, label }) {
  if (resource.loading) return <ActivityIndicator accessibilityLabel={`Loading ${label}`} color={colors.saffron} style={styles.loader} />;
  if (!resource.error) return null;
  return (
    <View style={styles.errorBox}>
      <Text style={styles.danger}>Could not load {label}.{resource.data ? ' Showing the last loaded report.' : ''}</Text>
      <TouchableOpacity onPress={resource.refresh} accessibilityRole="button" accessibilityLabel={`Retry ${label}`} style={styles.retry}>
        <Text style={styles.link}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function Breakdown({ title, values }) {
  return (
    <Section title={title}>
      {Object.entries(values || {}).length ? Object.entries(values).map(([key, value]) => (
        <Row key={key} label={key.replace(/_/g, ' ')} value={count(value)} />
      )) : <Text style={styles.note}>No activity for this period.</Text>}
    </Section>
  );
}

function Overview({ data }) {
  const sales = data.sales || {};
  const customers = data.customers || {};
  return (
    <>
      <Section title="Sales overview">
        <Row label="Revenue" value={money(sales.total_revenue)} />
        <Row label="Orders placed" value={count(sales.total_orders)} />
        <Text style={styles.note}>Revenue includes non-cancelled orders, including pending payments.</Text>
      </Section>
      <Breakdown title="Order status" values={sales.status_breakdown} />
      <Breakdown title="Payment methods" values={sales.payment_breakdown} />
      <Breakdown title="Payment status" values={sales.payment_status} />
      <Section title="Food ratings">
        <Text style={styles.note}>Lowest ratings first. Real average uses customer ratings only. Shown is the food-card rating: unrated delivered items count as 5 stars, with a minimum of 3.5.</Text>
        {data.ratings.length ? data.ratings.map(item => (
          <View key={`${item.area_id ?? ''}-${item.item_type}-${item.product_id}`} style={styles.entry}>
            <Text style={styles.entryTitle}>{val(item, 'productName', 'product_name')}</Text>
            <View style={styles.ratingSummary}>
              <View style={styles.ratingBox}>
                <Text style={styles.note}>Real average</Text>
                <Text style={[styles.ratingValue, Number(val(item, 'ratedAvg', 'rated_avg')) <= 2 && val(item, 'ratedAvg', 'rated_avg') != null && styles.danger]}>
                  {reportNumber(val(item, 'ratedAvg', 'rated_avg'))} / 5
                </Text>
              </View>
              <View style={styles.ratingBox}>
                <Text style={styles.note}>Shown to customers</Text>
                <Text style={styles.ratingValue}>★ {reportNumber(item.rating)}</Text>
              </View>
            </View>
            <Row label="Rated / delivered item lines" value={`${count(val(item, 'ratingsCount', 'ratings_count'))} / ${count(val(item, 'ordersCount', 'orders_count'))}`} />
            <Row label="1–2 star ratings" value={count(val(item, 'lowRatings', 'low_ratings'))} danger={Number(val(item, 'lowRatings', 'low_ratings')) > 0} />
          </View>
        )) : <Text style={styles.note}>No delivered food items for this period.</Text>}
      </Section>
      <Section title="Top items">
        {data.products.length ? data.products.map(item => (
          <View key={`${item.area_id ?? ''}-${item.item_type}-${item.product_id}`} style={styles.entry}>
            <Text style={styles.entryTitle}>{item.product_name}</Text>
            <Row label="Units sold" value={count(item.total_quantity)} />
            <Row label="Sales" value={money(item.total_sales)} />
          </View>
        )) : <Text style={styles.note}>No item sales for this period.</Text>}
      </Section>
      <Section title="Customers">
        <Row label="Total customers" value={count(val(customers, 'total_users', 'total_customers'))} />
        <Row label="New customers in this period" value={count(customers.new_customers)} />
        <Row label="Trusted" value={count(val(customers, 'trusted_total', 'trusted_customers'))} />
        <Row label="Blocked" value={count(val(customers, 'blocked_total', 'blocked_customers'))} />
      </Section>
      <Section title="Shop performance">
        {data.shops.length ? data.shops.map(shop => (
          <View key={`${shop.area_id ?? ''}-${shop.shop_id ?? 'house'}`} style={styles.entry}>
            <Text style={styles.entryTitle}>{shop.shop_name}</Text>
            <Row label="Orders" value={count(shop.order_count)} />
            <Row label="Items sold" value={count(shop.total_items_sold)} />
            <Row label="App sales" value={money(shop.total_amount)} />
          </View>
        )) : <Text style={styles.note}>No shop activity for this period.</Text>}
      </Section>
    </>
  );
}

function ProfitSummary({ summary }) {
  const totals = summary.totals || {};
  const warnings = summary.warnings || {};
  const payments = summary.paymentSplit || summary.payment_split || {};
  const netProfit = val(totals, 'netProfit', 'net_profit');
  return (
    <>
      <Section title="Profit & payouts">
        <Text style={styles.note}>Delivered orders only. Net profit is before rider payouts.</Text>
        <Row label="Net profit" value={money(netProfit)} danger={Number(netProfit) < 0} />
        <Row label="App sales" value={money(val(totals, 'appSales', 'app_sales'))} />
        <Row label="Shop payout due" value={money(val(totals, 'shopCost', 'shop_cost'))} />
        <Row label="Customer paid" value={money(val(totals, 'customerPaid', 'customer_paid'))} />
        <Row label="Delivered orders" value={count(val(totals, 'deliveredOrders', 'delivered_orders'))} />
        <Row label="Average order value" value={money(val(totals, 'avgOrderValue', 'avg_order_value'))} />
        <Row label="Average profit per order" value={money(val(totals, 'avgProfitPerOrder', 'avg_profit_per_order'))} />
        <Row label="Margin" value={`${reportNumber(val(totals, 'marginPercent', 'margin_percent'))}%`} />
      </Section>
      <Section title="Profit breakdown">
        {[
          ['Product margin', 'productMargin', 'product_margin'],
          ['Delivery charge', 'deliveryCharge', 'delivery_charge'],
          ['Night charge', 'nightCharge', 'night_charge'],
          ['Rain charge', 'rainCharge', 'rain_charge'],
          ['Fast delivery charge', 'fastDeliveryCharge', 'fast_delivery_charge'],
          ['Charges income', 'chargesIncome', 'charges_income'],
          ['Discounts given', 'discount', 'discount_amount'],
          ['Free delivery waivers (included in discounts)', 'freeDeliveryWaiver', 'free_delivery_waiver'],
        ].map(([label, camel, snake]) => <Row key={camel} label={label} value={money(val(totals, camel, snake))} />)}
        <Row label="In-progress orders (excluded)" value={`${count(summary.pipeline?.orders)} · ${money(summary.pipeline?.value)}`} />
        <Row label="Cancelled orders (excluded)" value={`${count(summary.cancelled?.orders)} · ${money(summary.cancelled?.value)}`} />
        <Row label="Cash payments" value={`${count(payments.cash?.orders)} · ${money(payments.cash?.amount)}`} />
        <Row label="UPI payments" value={`${count(payments.upi?.orders)} · ${money(payments.upi?.amount)}`} />
        {Number(val(warnings, 'unpricedItemsCount', 'unpriced_items_count')) > 0 && (
          <Text style={styles.warning}>{val(warnings, 'unpricedItemsCount', 'unpriced_items_count')} shop items had no shop price. Their cost counts as zero, so profit may be overstated.</Text>
        )}
        {Number(val(warnings, 'rejectedItemsCount', 'rejected_items_count')) > 0 && (
          <Text style={styles.note}>{val(warnings, 'rejectedItemsCount', 'rejected_items_count')} rejected items were excluded from customer totals and shop payouts.</Text>
        )}
      </Section>
      <Section title="Shop payout table">
        {summary.shops?.length ? summary.shops.map(shop => (
          <View key={`${shop.area_id ?? ''}-${val(shop, 'shopId', 'shop_id') ?? 'house'}`} style={styles.entry}>
            <Text style={styles.entryTitle}>{val(shop, 'shopName', 'shop_name')}</Text>
            <Row label="Orders / items" value={`${count(val(shop, 'deliveredOrders', 'delivered_orders'))} / ${count(val(shop, 'itemsSold', 'items_sold'))}`} />
            <Row label="App sales" value={money(val(shop, 'appSales', 'app_sales'))} />
            <Row label="Payable to shop" value={money(val(shop, 'shopCost', 'shop_cost'))} />
            <Row label="Product margin" value={money(shop.margin)} danger={Number(shop.margin) < 0} />
            {Number(val(shop, 'unpricedItems', 'unpriced_items')) > 0 && <Text style={styles.warning}>Includes items with no shop price.</Text>}
          </View>
        )) : <Text style={styles.note}>No shop activity for this period.</Text>}
      </Section>
    </>
  );
}

function Insights({ data }) {
  const customers = data.customers || {};
  const losses = data.losses || {};
  return (
    <>
      <Section title="Customer insights">
        <Row label="Customers with delivered orders" value={count(customers.customers)} />
        <Row label="New / returning customers" value={`${count(customers.newCustomers)} / ${count(customers.returningCustomers)}`} />
        <Row label="Repeat customers" value={count(customers.repeatCustomers)} />
        <Row label="Repeat rate" value={`${reportNumber(customers.repeatRate)}%`} />
        <Row label="Orders per customer" value={reportNumber(customers.ordersPerCustomer)} />
        <Row label="Spend per customer" value={money(customers.spendPerCustomer)} />
        <Row label="Busiest hour (IST)" value={data.busiestHour == null ? '—' : `${String(data.busiestHour).padStart(2, '0')}:00`} />
      </Section>
      <Section title="Cancellations, rejections & discounts">
        <Row label="Cancelled orders" value={count(losses.cancelledOrders)} />
        <Row label="Cancelled value" value={money(losses.cancelledValue)} />
        <Row label="Cancellation rate" value={`${reportNumber(losses.cancelRate)}%`} />
        <Row label="Rejected shop item lines" value={count(losses.rejectedLines)} />
        <Row label="Rejected value" value={money(losses.rejectedValue)} />
        <Row label="Discounts" value={money(losses.discount)} />
        {losses.cancelReasons?.map((reason, index) => <Row key={index} label={reason.reason || 'No cancellation reason'} value={`${count(reason.orders)} · ${money(reason.value)}`} />)}
        {losses.rejectionsByShop?.map(shop => <Row key={shop.shopId} label={shop.shopName} value={`${count(shop.rejectedLines)} rejected · ${money(shop.rejectedValue)}`} />)}
      </Section>
      <Section title="Sales & profit trend">
        {data.trend?.points?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Sales and profit trend">
            <View>
              <View style={styles.trendRow}><Text style={styles.trendDate}>Date</Text><Text style={styles.trendValue}>Orders</Text><Text style={styles.trendValue}>Paid</Text><Text style={styles.trendValue}>Profit</Text></View>
              {data.trend.points.map(point => (
                <View key={point.key} style={styles.trendRow}>
                  <Text style={styles.trendDate}>{point.key}</Text>
                  <Text style={styles.trendValue}>{count(point.deliveredOrders)}</Text>
                  <Text style={styles.trendValue}>{money(point.customerPaid)}</Text>
                  <Text style={[styles.trendValue, Number(point.netProfit) < 0 && styles.danger]}>{money(point.netProfit)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : <Text style={styles.note}>No delivered orders for this period.</Text>}
      </Section>
    </>
  );
}

export default function AdminReportsScreen() {
  const navigation = useNavigation();
  const [view, setView] = useState('profit');
  const [profitPeriod, setProfitPeriod] = useState('today');
  const [overviewPeriod, setOverviewPeriod] = useState('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [range, setRange] = useState(null);
  const [rangeError, setRangeError] = useState(null);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('time');
  const [shopId, setShopId] = useState(null);
  const profitParams = useMemo(() => profitPeriod === 'custom' ? (range ? { period: 'custom', ...range } : null) : { period: profitPeriod }, [profitPeriod, range]);
  const profitActive = view === 'profit' && profitParams != null;
  const loadSummary = useCallback(async () => unwrap(await adminApi.reportProfitSummary(profitParams)), [profitParams]);
  const loadInsights = useCallback(async () => unwrap(await adminApi.reportProfitInsights(profitParams)), [profitParams]);
  const loadOrders = useCallback(() => adminApi.reportProfitOrders({ ...profitParams, page, limit: 20, sort, shopId: shopId || undefined }), [profitParams, page, sort, shopId]);
  const loadOverview = useCallback(async () => {
    const params = { period: overviewPeriod };
    const [sales, products, customers, shops, ratings] = await Promise.all([
      adminApi.reportSales(params), adminApi.reportTopProducts(params), adminApi.reportCustomers(params), adminApi.reportShops(params), adminApi.reportFoodRatings(params),
    ]);
    return { sales: unwrap(sales), products: unwrap(products) || [], customers: unwrap(customers), shops: unwrap(shops) || [], ratings: unwrap(ratings) || [] };
  }, [overviewPeriod]);
  const summary = useAdminReportData(profitActive ? loadSummary : null);
  const insights = useAdminReportData(profitActive ? loadInsights : null);
  const orders = useAdminReportData(profitActive ? loadOrders : null);
  const overview = useAdminReportData(view === 'overview' ? loadOverview : null);
  const refreshing = view === 'overview' ? overview.refreshing : summary.refreshing || insights.refreshing || orders.refreshing;
  const refresh = () => view === 'overview' ? overview.refresh() : Promise.all([summary.refresh(), insights.refresh(), orders.refresh()]);
  const pagination = orders.data?.pagination;
  const deliveredOrders = orders.data?.data || [];

  const selectPeriod = value => {
    if (view === 'overview') setOverviewPeriod(value);
    else { setProfitPeriod(value); setPage(1); setShopId(null); }
  };
  const applyRange = () => {
    const error = reportRangeError(from.trim(), to.trim());
    setRangeError(error);
    if (!error) { setRange({ from: from.trim(), to: to.trim() }); setPage(1); }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} accessibilityLabel="Back to admin home" accessibilityRole="button">
          <AppIcon name="back" size={23} color={colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>Reports</Text><Text style={styles.note}>Sales, profit and customer feedback</Text></View>
      </View>
      <View style={styles.tabs}>
        <Choice tab label="Profit & Payouts" selected={view === 'profit'} onPress={() => setView('profit')} />
        <Choice tab label="Overview" selected={view === 'overview'} onPress={() => setView('overview')} />
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.saffron} />}>
        <ScrollView key={view} horizontal showsHorizontalScrollIndicator style={styles.periodScroll} contentContainerStyle={styles.periodChoices} accessibilityLabel="Report periods">
          {(view === 'overview' ? OVERVIEW_PERIODS : REPORT_PERIODS).map(period => <Choice key={period.value} label={period.label} selected={(view === 'overview' ? overviewPeriod : profitPeriod) === period.value} onPress={() => selectPeriod(period.value)} />)}
        </ScrollView>
        {view === 'profit' && profitPeriod === 'custom' && (
          <Section title="Custom date range">
            <Text style={styles.note}>Use dates in IST. Maximum 366 days.</Text>
            <TextInput style={styles.input} accessibilityLabel="Report start date" placeholder="From: YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={from} onChangeText={setFrom} autoCapitalize="none" maxLength={10} />
            <TextInput style={styles.input} accessibilityLabel="Report end date" placeholder="To: YYYY-MM-DD" placeholderTextColor={colors.textSecondary} value={to} onChangeText={setTo} autoCapitalize="none" maxLength={10} />
            {rangeError && <Text style={styles.danger}>{rangeError}</Text>}
            <Choice label="Apply dates" onPress={applyRange} selected />
            {range && <Text style={styles.note}>Showing {range.from} to {range.to}</Text>}
          </Section>
        )}
        {view === 'overview' ? (
          <>
            <ResourceState resource={overview} label="overview" />
            {overview.data && <Overview data={overview.data} />}
          </>
        ) : profitActive ? (
          <>
            <ResourceState resource={summary} label="profit summary" />
            {summary.data && <>
              <Text style={styles.note}>{summary.data.period?.from ? `${summary.data.period.from} to ${summary.data.period.to} · IST` : 'All time'}</Text>
              <ProfitSummary summary={summary.data} />
            </>}
            <ResourceState resource={insights} label="insights" />
            {insights.data && <Insights data={insights.data} />}
            <Section title="Delivered orders">
              <View style={styles.choices}>
                {[['time', 'Newest'], ['profit', 'Highest profit'], ['value', 'Highest value']].map(([value, label]) => <Choice key={value} label={label} selected={sort === value} onPress={() => { setSort(value); setPage(1); }} />)}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator style={styles.shopFilters}>
                <View style={styles.shopChoiceRow}>
                  <Choice label="All shops" selected={!shopId} onPress={() => { setShopId(null); setPage(1); }} />
                  {summary.data?.shops?.filter(shop => val(shop, 'shopId', 'shop_id') != null).map(shop => (
                    <Choice key={val(shop, 'shopId', 'shop_id')} label={val(shop, 'shopName', 'shop_name')} selected={shopId === val(shop, 'shopId', 'shop_id')} onPress={() => { setShopId(val(shop, 'shopId', 'shop_id')); setPage(1); }} />
                  ))}
                </View>
              </ScrollView>
              <ResourceState resource={orders} label="delivered orders" />
              {!orders.loading && !orders.error && !deliveredOrders.length && <Text style={styles.note}>No delivered orders for this period / shop.</Text>}
              {deliveredOrders.map(order => (
                <TouchableOpacity key={order.id} style={styles.entry} accessibilityRole="button" accessibilityLabel={`Open order ${val(order, 'orderNumber', 'order_number')}`} onPress={() => navigation.navigate('AdminOrderDetail', { orderId: order.id })}>
                  <Text style={[styles.entryTitle, styles.link]}>#{val(order, 'orderNumber', 'order_number')}</Text>
                  <Text style={styles.note}>{val(order, 'customerName', 'customer_name')} · {val(order, 'paymentMethod', 'payment_method')}</Text>
                  <Text style={styles.note}>{val(order, 'createdAt', 'created_at') ? new Date(val(order, 'createdAt', 'created_at')).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—'}</Text>
                  <Row label="App sales" value={money(val(order, 'appItemsTotal', 'app_items_total'))} />
                  <Row label="Shop cost" value={money(val(order, 'shopCost', 'shop_cost'))} />
                  <Row label="Product margin" value={money(val(order, 'productMargin', 'product_margin'))} />
                  <Row label="Charges" value={money(val(order, 'chargesIncome', 'charges_income'))} />
                  <Row label="Discounts" value={money(val(order, 'discount', 'discount_amount'))} />
                  <Row label="Paid / net profit" value={`${money(val(order, 'customerPaid', 'customer_paid'))} / ${money(val(order, 'netProfit', 'net_profit'))}`} danger={Number(val(order, 'netProfit', 'net_profit')) < 0} />
                  {(order.hasUnpricedItems || order.has_unpriced_items) && <Text style={styles.warning}>Includes items with no shop price.</Text>}
                </TouchableOpacity>
              ))}
              <View style={styles.pagination}>
                <Choice label="Previous" onPress={() => setPage(page - 1)} disabled={page <= 1 || orders.loading} />
                <Text style={styles.note}>Page {page} of {pagination?.totalPages ?? 1}</Text>
                <Choice label="Next" onPress={() => setPage(page + 1)} disabled={!pagination || page >= pagination.totalPages || orders.loading} />
              </View>
              {pagination && <Text style={styles.note}>{pagination.total} delivered orders</Text>}
            </Section>
          </>
        ) : <Text style={styles.note}>Enter and apply a date range to load the report.</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminUi.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: adminUi.gutter, paddingVertical: spacing.md },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: { ...typography.display, fontSize: 24, color: adminUi.text },
  tabs: { flexDirection: 'row', gap: 4, marginHorizontal: adminUi.gutter, marginBottom: spacing.md, padding: 4, borderRadius: 16, backgroundColor: adminUi.soft },
  tab: { flex: 1, minHeight: 44, borderWidth: 0, backgroundColor: 'transparent', alignItems: 'center' },
  tabActive: { backgroundColor: adminUi.surface, ...adminUi.shadow },
  tabText: { color: adminUi.text, fontSize: 13 },
  periodScroll: { flexGrow: 0 },
  periodChoices: { gap: spacing.sm, paddingBottom: spacing.sm },
  shopChoiceRow: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm },
  content: { paddingHorizontal: adminUi.gutter, paddingBottom: spacing.xl, gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, borderRadius: adminUi.controlRadius, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: adminUi.border, justifyContent: 'center' },
  chipActive: { backgroundColor: colors.saffronLight, borderColor: colors.saffron },
  chipText: { fontWeight: '700', fontSize: 12, color: adminUi.muted },
  chipTextActive: { color: colors.saffronDark },
  disabled: { opacity: 0.45 },
  card: { padding: spacing.md, borderRadius: adminUi.cardRadius, backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: adminUi.border, gap: spacing.sm },
  cardTitle: { ...typography.h3, fontSize: 17, color: adminUi.text, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 4 },
  rowLabel: { flex: 1, fontSize: 13, color: adminUi.muted },
  rowValue: { flexShrink: 1, maxWidth: '55%', fontSize: 14, color: adminUi.text, fontWeight: '700', textAlign: 'right', fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 18, color: adminUi.muted },
  entry: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: adminUi.border, gap: 4 },
  entryTitle: { ...typography.body, fontWeight: '700', color: adminUi.text },
  ratingSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, paddingVertical: spacing.sm },
  ratingBox: { flex: 1, minWidth: 110, backgroundColor: adminUi.canvas, padding: spacing.sm, borderRadius: radius.md },
  ratingValue: { fontSize: 18, fontWeight: '800', color: adminUi.text, marginTop: 4 },
  danger: { color: colors.error, fontSize: 13 },
  warning: { color: colors.saffronDark, fontSize: 12, lineHeight: 18 },
  errorBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  retry: { alignSelf: 'flex-start', padding: spacing.sm, minHeight: 40 },
  link: { color: colors.saffronDark, fontWeight: '700' },
  loader: { marginVertical: spacing.md },
  input: { backgroundColor: adminUi.canvas, color: adminUi.text, borderWidth: 1, borderColor: adminUi.border, borderRadius: radius.md, padding: spacing.sm, minHeight: 44 },
  shopFilters: { marginVertical: spacing.sm },
  pagination: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'space-between', alignItems: 'center' },
  trendRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: adminUi.border },
  trendDate: { width: 100, color: adminUi.text, fontSize: 12 },
  trendValue: { width: 100, color: adminUi.text, fontSize: 12, textAlign: 'right', fontVariant: ['tabular-nums'] },
});
