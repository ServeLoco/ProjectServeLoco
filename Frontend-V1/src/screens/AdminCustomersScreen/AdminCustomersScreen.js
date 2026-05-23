/* eslint-disable react-hooks/exhaustive-deps */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AnimatedModalView,
  AppHeader,
  AppScreen,
  Button,
  PressableScale,
  SkeletonRow,
} from '../../components';
import { adminCustomersApi } from '../../api';
import {
  colors,
  entryDistance,
  motionConfig,
  radius,
  shadows,
  spacing,
  staggerMs,
  typography,
} from '../../theme';

function pickFirst(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return ['true', 'trusted', 'blocked', 'active', 'yes', '1'].includes(normalized);
  }
  return false;
}

function getCustomersFromResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.customers)) return payload.customers;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.customers)) return payload.data.customers;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
}

function normalizeCustomer(customer, index = 0) {
  const id = String(pickFirst(
    customer.id,
    customer._id,
    customer.customerId,
    customer.userId,
    customer.phone,
    `customer-${index}`,
  ));

  return {
    ...customer,
    id,
    name: pickFirst(customer.name, customer.fullName, customer.customerName, 'Customer'),
    phone: pickFirst(customer.phone, customer.mobile, customer.phoneNumber, ''),
    whatsappNumber: pickFirst(
      customer.whatsappNumber,
      customer.whatsAppNumber,
      customer.whatsapp,
      customer.phone,
      '',
    ),
    address: pickFirst(
      customer.deliveryAddress,
      customer.address,
      customer.defaultAddress,
      customer.shortAddress,
      'No address saved',
    ),
    trusted: asBoolean(pickFirst(customer.trusted, customer.isTrusted, customer.trustStatus)),
    blocked: asBoolean(pickFirst(customer.blocked, customer.isBlocked, customer.blockStatus)),
  };
}

function formatShortAddress(address) {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return 'No address saved';

  return [
    address.line1,
    address.line2,
    address.area,
    address.city,
    address.pincode,
  ].filter(Boolean).join(', ') || 'No address saved';
}

function getActionError(error) {
  return error?.message || 'Action failed. Please try again.';
}

function AdminCustomersScreen() {
  const navigation = useNavigation();
  const [customers, setCustomers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [updatingCustomerId, setUpdatingCustomerId] = useState(null);
  const [pendingBlockAction, setPendingBlockAction] = useState(null);
  const listOpacity = useRef(new Animated.Value(0)).current;

  const animateList = useCallback(() => {
    listOpacity.setValue(0);
    Animated.timing(listOpacity, {
      ...motionConfig.screen,
      toValue: 1,
    }).start();
  }, [listOpacity]);

  const loadCustomers = useCallback((refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError('');
    setActionError('');

    adminCustomersApi.getCustomers()
      .then(payload => {
        setCustomers(getCustomersFromResponse(payload).map(normalizeCustomer));
        animateList();
      })
      .catch(loadError => {
        setError(loadError?.message || 'Unable to load customers.');
      })
      .finally(() => {
        setIsLoading(false);
        setIsRefreshing(false);
      });
  }, [animateList]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return customers;

    return customers.filter(customer => {
      const searchable = [
        customer.name,
        customer.phone,
        customer.whatsappNumber,
        formatShortAddress(customer.address),
      ].join(' ').toLowerCase();

      return searchable.includes(query);
    });
  }, [customers, searchQuery]);

  const updateCustomer = useCallback((customerId, updater) => {
    setCustomers(prev => prev.map(customer => (
      customer.id === customerId ? updater(customer) : customer
    )));
  }, []);

  const handleTrustToggle = useCallback(customer => {
    const nextTrusted = !customer.trusted;
    setUpdatingCustomerId(customer.id);
    setActionError('');
    updateCustomer(customer.id, current => ({ ...current, trusted: nextTrusted }));

    adminCustomersApi.updateTrust(customer.id, { trusted: nextTrusted })
      .then(payload => {
        const responseCustomer = payload?.customer || payload?.data || payload;
        const updatedCustomer = responseCustomer?.id || responseCustomer?._id
          ? normalizeCustomer(responseCustomer)
          : null;
        updateCustomer(customer.id, current => ({
          ...current,
          ...(updatedCustomer || {}),
          id: current.id,
          trusted: nextTrusted,
        }));
      })
      .catch(updateError => {
        updateCustomer(customer.id, current => ({ ...current, trusted: customer.trusted }));
        setActionError(getActionError(updateError));
      })
      .finally(() => setUpdatingCustomerId(null));
  }, [updateCustomer]);

  const requestBlockToggle = useCallback(customer => {
    setPendingBlockAction({
      customer,
      nextBlocked: !customer.blocked,
    });
  }, []);

  const closeBlockModal = useCallback(() => {
    if (!updatingCustomerId) {
      setPendingBlockAction(null);
    }
  }, [updatingCustomerId]);

  const confirmBlockToggle = useCallback(() => {
    if (!pendingBlockAction) return;

    const { customer, nextBlocked } = pendingBlockAction;
    setUpdatingCustomerId(customer.id);
    setActionError('');

    adminCustomersApi.updateBlock(customer.id, { blocked: nextBlocked })
      .then(payload => {
        const responseCustomer = payload?.customer || payload?.data || payload;
        const updatedCustomer = responseCustomer?.id || responseCustomer?._id
          ? normalizeCustomer(responseCustomer)
          : null;
        updateCustomer(customer.id, current => ({
          ...current,
          ...(updatedCustomer || {}),
          id: current.id,
          blocked: nextBlocked,
        }));
        setPendingBlockAction(null);
      })
      .catch(updateError => {
        setActionError(getActionError(updateError));
      })
      .finally(() => setUpdatingCustomerId(null));
  }, [pendingBlockAction, updateCustomer]);

  const handleCall = useCallback(phone => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`).catch(() => {
      setActionError('Unable to open the phone dialer.');
    });
  }, []);

  const handleWhatsApp = useCallback(phone => {
    if (!phone) return;
    const cleanedPhone = String(phone).replace(/[^\d+]/g, '');
    Linking.openURL(`whatsapp://send?phone=${cleanedPhone}`).catch(() => {
      setActionError('Unable to open WhatsApp.');
    });
  }, []);

  const isMutating = Boolean(updatingCustomerId);
  const modalCustomer = pendingBlockAction?.customer;
  const modalIsBlocking = Boolean(pendingBlockAction?.nextBlocked);

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="Customers" onBack={() => navigation.goBack()} />

      <View style={styles.searchSection}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>Search</Text>
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search customers"
            placeholderTextColor={colors.textHint}
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {filteredCustomers.length} of {customers.length} customers
          </Text>
          {actionError ? (
            <Text style={styles.inlineError} numberOfLines={2}>{actionError}</Text>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <CustomerSkeletonList />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.stateLabel}>Connection issue</Text>
          <Text style={styles.stateTitle}>Failed to load customers</Text>
          <Text style={styles.stateText}>{error}</Text>
          <Button label="Retry" onPress={() => loadCustomers()} fullWidth={false} />
        </View>
      ) : customers.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateLabel}>No customers</Text>
          <Text style={styles.stateTitle}>Customer list is empty</Text>
          <Text style={styles.stateText}>
            Customers will appear here after they create an account or place an order.
          </Text>
        </View>
      ) : filteredCustomers.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.stateLabel}>No matches</Text>
          <Text style={styles.stateTitle}>No customers found</Text>
          <Text style={styles.stateText}>Try a different name, phone number, or address.</Text>
          <Button
            label="Clear Search"
            onPress={() => setSearchQuery('')}
            variant="outline"
            fullWidth={false}
          />
        </View>
      ) : (
        <Animated.ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          style={{ opacity: listOpacity }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => loadCustomers(true)}
              tintColor={colors.primary}
            />
          }
        >
          {filteredCustomers.map((customer, index) => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              disabled={isMutating && updatingCustomerId !== customer.id}
              index={index}
              isUpdating={updatingCustomerId === customer.id}
              onBlockToggle={() => requestBlockToggle(customer)}
              onCall={() => handleCall(customer.phone)}
              onTrustToggle={() => handleTrustToggle(customer)}
              onWhatsApp={() => handleWhatsApp(customer.whatsappNumber)}
            />
          ))}
        </Animated.ScrollView>
      )}

      <BlockCustomerModal
        customerName={modalCustomer?.name}
        isBlocking={modalIsBlocking}
        isLoading={updatingCustomerId === modalCustomer?.id}
        onCancel={closeBlockModal}
        onConfirm={confirmBlockToggle}
        visible={Boolean(pendingBlockAction)}
      />
    </AppScreen>
  );
}

function CustomerSkeletonList() {
  return (
    <View style={styles.skeletonList}>
      <SkeletonRow />
      <SkeletonRow />
      <SkeletonRow />
      <Text style={styles.loadingText}>Loading customers...</Text>
    </View>
  );
}

function CustomerCard({
  customer,
  disabled,
  index,
  isUpdating,
  onBlockToggle,
  onCall,
  onTrustToggle,
  onWhatsApp,
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      ...motionConfig.screen,
      delay: index * staggerMs,
      toValue: 1,
    }).start();
  }, [index, progress]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [entryDistance, 0],
  });

  const shortAddress = formatShortAddress(customer.address);

  return (
    <Animated.View
      style={[
        styles.card,
        customer.blocked && styles.cardBlocked,
        { opacity: progress, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{customer.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.customerMain}>
          <Text style={styles.customerName} numberOfLines={1}>{customer.name}</Text>
          <Text style={styles.customerPhone} numberOfLines={1}>{customer.phone || 'No phone'}</Text>
        </View>
        {isUpdating ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : null}
      </View>

      <Text style={styles.addressText} numberOfLines={2}>{shortAddress}</Text>

      <View style={styles.statusRow}>
        <StatusPill active={customer.trusted} label={customer.trusted ? 'Trusted' : 'Needs Review'} />
        <StatusPill active={!customer.blocked} danger={customer.blocked} label={customer.blocked ? 'Blocked' : 'Active'} />
      </View>

      <View style={styles.controlsGrid}>
        <ToggleRow
          disabled={disabled || isUpdating}
          label="Trust"
          onValueChange={onTrustToggle}
          value={customer.trusted}
        />
        <ToggleRow
          disabled={disabled || isUpdating}
          danger
          label="Block"
          onValueChange={onBlockToggle}
          value={customer.blocked}
        />
      </View>

      <View style={styles.actionRow}>
        <PressableScale
          disabled={!customer.phone || disabled}
          onPress={onCall}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>Call</Text>
        </PressableScale>
        <PressableScale
          disabled={!customer.whatsappNumber || disabled}
          onPress={onWhatsApp}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>WhatsApp</Text>
        </PressableScale>
      </View>
    </Animated.View>
  );
}

function StatusPill({ active, danger = false, label }) {
  const backgroundColor = danger
    ? colors.errorLight
    : active
      ? colors.successLight
      : colors.warningLight;
  const color = danger
    ? colors.error
    : active
      ? colors.success
      : colors.warning;

  return (
    <View style={[styles.statusPill, { backgroundColor }]}>
      <Text style={[styles.statusPillText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ToggleRow({ danger = false, disabled, label, onValueChange, value }) {
  const activeColor = danger ? colors.error : colors.success;

  return (
    <View style={[styles.toggleRow, disabled && styles.toggleRowDisabled]}>
      <View>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleValue}>{value ? 'On' : 'Off'}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.borderStrong, true: `${activeColor}55` }}
        thumbColor={value ? activeColor : colors.bgSurface}
        ios_backgroundColor={colors.borderStrong}
      />
    </View>
  );
}

function BlockCustomerModal({
  customerName,
  isBlocking,
  isLoading,
  onCancel,
  onConfirm,
  visible,
}) {
  return (
    <AnimatedModalView visible={visible} onClose={onCancel}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>
          {isBlocking ? 'Block Customer?' : 'Unblock Customer?'}
        </Text>
        <Text style={styles.modalText}>
          {isBlocking
            ? `${customerName || 'This customer'} will not be able to place new orders until unblocked.`
            : `${customerName || 'This customer'} will be able to place orders again.`}
        </Text>
        <View style={styles.modalActions}>
          <Button
            label="Cancel"
            onPress={onCancel}
            variant="outline"
            disabled={isLoading}
            style={styles.modalButton}
          />
          <Button
            label={isBlocking ? 'Block Customer' : 'Unblock Customer'}
            onPress={onConfirm}
            variant={isBlocking ? 'danger' : 'primary'}
            loading={isLoading}
            style={styles.modalButton}
          />
        </View>
      </View>
    </AnimatedModalView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  searchSection: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchBox: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    ...typography.labelSmall,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  summaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  summaryText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  inlineError: {
    flex: 1,
    ...typography.caption,
    color: colors.textError,
    textAlign: 'right',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  skeletonList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  stateLabel: {
    ...typography.labelSmall,
    color: colors.primary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  stateTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  stateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 22,
  },
  card: {
    padding: spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.card,
  },
  cardBlocked: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorLight,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  avatarText: {
    ...typography.labelLarge,
    color: colors.primary,
    fontWeight: '800',
  },
  customerMain: {
    flex: 1,
    minWidth: 0,
  },
  customerName: {
    ...typography.labelLarge,
    color: colors.textPrimary,
  },
  customerPhone: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  addressText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    lineHeight: 19,
    marginTop: spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusPill: {
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  statusPillText: {
    ...typography.caption,
    fontWeight: '700',
  },
  controlsGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  toggleRow: {
    flex: 1,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleRowDisabled: {
    opacity: 0.58,
  },
  toggleLabel: {
    ...typography.labelSmall,
    color: colors.textPrimary,
  },
  toggleValue: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  actionText: {
    ...typography.buttonSmall,
    color: colors.textPrimary,
  },
  modalCard: {
    padding: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xl,
    ...shadows.modal,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  modalText: {
    ...typography.body,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  modalButton: {
    flex: 1,
  },
});

export default AdminCustomersScreen;
