import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { adminApi, subscribeAdminRealtime } from '../../api';
import { useNewOrderAlert } from '../../hooks/useNewOrderAlert';
import AppIcon from '../../components/AppIcon';

const VIBRATE_PATTERN = [0, 400, 200, 400];
const DEFAULT_CANCEL_REASON = 'No rider available / admin cancelled';

function omitKey(obj, key) {
  const rest = { ...obj };
  delete rest[key];
  return rest;
}

function formatCurrency(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `₹${n}` : '₹0';
}

/**
 * Full-screen queue popup when rider assignment fails.
 * Order is NOT auto-cancelled — admin must Cancel (with reason) or Investigate
 * (dismiss and handle manually / deliver).
 */
export default function AdminCancelRequestPopup() {
  const [modals, setModals] = useState([]);
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [reasons, setReasons] = useState({});
  const [showReasonFor, setShowReasonFor] = useState(null);
  const prevQueueLengthRef = useRef(0);
  const vibrateLoopRef = useRef(null);

  const current = modals.length > 0 ? modals[0] : null;
  const currentBusy = current ? Boolean(busy[current.id]) : false;

  useNewOrderAlert(modals.length > 0);

  useEffect(() => {
    if (modals.length === 0) {
      if (vibrateLoopRef.current) {
        clearInterval(vibrateLoopRef.current);
        vibrateLoopRef.current = null;
      }
      Vibration.cancel();
      prevQueueLengthRef.current = 0;
      return undefined;
    }
    const grew = modals.length > prevQueueLengthRef.current;
    prevQueueLengthRef.current = modals.length;
    if (grew) Vibration.vibrate(VIBRATE_PATTERN);
    vibrateLoopRef.current = setInterval(() => Vibration.vibrate(VIBRATE_PATTERN), 8000);
    return () => {
      if (vibrateLoopRef.current) {
        clearInterval(vibrateLoopRef.current);
        vibrateLoopRef.current = null;
      }
    };
  }, [modals.length]);

  useEffect(() => {
    const off = subscribeAdminRealtime('admin.order.cancel_request', (payload) => {
      const orderId = payload?.orderId;
      if (!orderId) return;
      const id = `cancel-${orderId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setModals((prev) => {
        if (prev.some((m) => Number(m.payload?.orderId) === Number(orderId))) return prev;
        return [...prev, { id, payload, addedAt: Date.now() }];
      });
    });
    return off;
  }, []);

  const removeModal = useCallback((id) => {
    setModals((prev) => prev.filter((m) => m.id !== id));
    setBusy((prev) => omitKey(prev, id));
    setErrors((prev) => omitKey(prev, id));
    setReasons((prev) => omitKey(prev, id));
    setShowReasonFor((cur) => (cur === id ? null : cur));
  }, []);

  const handleInvestigate = useCallback((id) => {
    // Dismiss only — order stays open so admin can deliver or fix riders.
    removeModal(id);
  }, [removeModal]);

  const handleCancelOrder = useCallback(async (id, orderId) => {
    const reason = (reasons[id] || '').trim() || DEFAULT_CANCEL_REASON;
    setBusy((prev) => ({ ...prev, [id]: true }));
    setErrors((prev) => ({ ...prev, [id]: null }));
    try {
      await adminApi.updateOrderStatus(orderId, 'Cancelled', reason);
      removeModal(id);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [id]: err?.message || 'Failed to cancel order',
      }));
      setBusy((prev) => ({ ...prev, [id]: false }));
    }
  }, [reasons, removeModal]);

  if (!current) return null;

  const total = modals.length;
  const { id, payload } = current;
  const orderId = payload?.orderId;
  const orderNumber = payload?.orderNumber || payload?.order_number || '—';
  const customerName = payload?.customerName || payload?.customer_name || 'Customer';
  const address = payload?.address || '';
  const phone = payload?.customerPhone || payload?.customer_phone || '';
  const reason = payload?.reason || 'No rider available';
  const isBusy = Boolean(busy[id]);
  const error = errors[id];
  const reasonOpen = showReasonFor === id;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        {total > 1 ? (
          <View style={styles.queueBar}>
            <Text style={styles.queueLabel}>
              {total} orders need action · showing 1 of {total}
            </Text>
          </View>
        ) : null}

        <View style={styles.card}>
          <View style={styles.topAccent} />
          <View style={styles.headerRow}>
            <Text style={styles.bell}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Rider assignment failed</Text>
              <Text style={styles.headerSub}>#{orderNumber} · order still open</Text>
            </View>
          </View>

          <View style={styles.body}>
            <DetailRow label="Customer" value={customerName} />
            {phone ? <DetailRow label="Phone" value={phone} /> : null}
            {address ? <DetailRow label="Address" value={address} /> : null}
            <DetailRow label="Total" value={formatCurrency(payload?.total)} big />
            <DetailRow label="Why" value={reason} />

            <Text style={styles.info}>
              No auto-cancel. Investigate and deliver yourself, or cancel with a reason
              (e.g. rider not available).
            </Text>

            {reasonOpen ? (
              <View style={styles.reasonBox}>
                <Text style={styles.reasonLabel}>Cancel reason (required for customer)</Text>
                <TextInput
                  style={styles.reasonInput}
                  value={reasons[id] || ''}
                  onChangeText={(t) => setReasons((prev) => ({ ...prev, [id]: t }))}
                  placeholder="e.g. No rider available, customer unreachable…"
                  placeholderTextColor={colors.textTertiary}
                  multiline
                  maxLength={300}
                  editable={!isBusy}
                />
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.actionCol}>
            <TouchableOpacity
              style={styles.investigateBtn}
              onPress={() => handleInvestigate(id)}
              disabled={isBusy}
            >
              <AppIcon name="search" size={16} color={colors.textInverse} />
              <Text style={styles.investigateBtnText}>Investigate</Text>
            </TouchableOpacity>

            {!reasonOpen ? (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowReasonFor(id)}
                disabled={isBusy}
              >
                <Text style={styles.cancelBtnText}>Cancel order…</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.cancelConfirmBtn}
                onPress={() => handleCancelOrder(id, orderId)}
                disabled={isBusy}
              >
                {isBusy ? (
                  <ActivityIndicator color={colors.textInverse} />
                ) : (
                  <Text style={styles.cancelConfirmText}>Confirm cancel</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value, big }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, big && styles.detailValueBig]} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlayDark,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  queueBar: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  queueLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.xxl,
    padding: spacing.lg,
    overflow: 'hidden',
    ...shadows.modal,
  },
  topAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: colors.error,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  bell: { fontSize: 28 },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  headerSub: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    fontWeight: '600',
  },
  body: { marginBottom: spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: spacing.sm,
  },
  detailLabel: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  detailValue: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailValueBig: { fontSize: 18, color: colors.saffronDark },
  info: {
    fontSize: 12,
    color: colors.info || colors.saffronDark,
    backgroundColor: colors.infoLight || colors.saffronLight,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  reasonBox: { marginTop: spacing.md },
  reasonLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    color: colors.textPrimary,
    backgroundColor: colors.bgApp,
  },
  error: {
    fontSize: 12,
    color: colors.error,
    backgroundColor: colors.errorLight,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  actionCol: { gap: spacing.sm },
  investigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.button,
    paddingVertical: 14,
    backgroundColor: colors.saffron,
  },
  investigateBtnText: {
    color: colors.textInverse,
    fontWeight: '800',
    fontSize: 15,
  },
  cancelBtn: {
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.error,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.errorLight,
  },
  cancelBtnText: { color: colors.error, fontWeight: '800', fontSize: 15 },
  cancelConfirmBtn: {
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
  cancelConfirmText: { color: colors.textInverse, fontWeight: '800', fontSize: 15 },
});
