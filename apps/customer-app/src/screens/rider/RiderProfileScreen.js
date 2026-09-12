import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing, typography, radius, shadows } from '../../theme';
import { useAuthStore } from '../../stores';
import { riderApi } from '../../api';
import AppIcon from '../../components/AppIcon';

export default function RiderProfileScreen() {
  const rider = useAuthStore((s) => s.rider);
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [signingOut, setSigningOut] = useState(false);

  const displayName = rider?.displayName || rider?.display_name || 'Rider';
  const phone = user?.phone || user?.phoneNumber || rider?.phone;

  const handleLogout = useCallback(async () => {
    setSigningOut(true);
    let activeCount = 0;
    try {
      const me = await riderApi.getMe();
      const list = me?.currentAssignments || me?.current_assignments;
      activeCount = Array.isArray(list) ? list.length : (me?.currentAssignment ? 1 : 0);
    } catch (_) { /* best-effort — fall through to the sign-out prompt */ }
    setSigningOut(false);

    if (activeCount > 0) {
      Alert.alert(
        'Finish deliveries first',
        activeCount === 1
          ? 'You still have 1 active order. Deliver it before signing out.'
          : `You still have ${activeCount} active orders. Deliver them all before signing out.`,
        [{ text: 'OK' }],
      );
      return;
    }

    Alert.alert('Sign out', 'Go offline and sign out of rider mode?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          try {
            await riderApi.setOnline(false);
          } catch (err) {
            Alert.alert(
              'Cannot sign out',
              err?.message || 'Deliver all active orders before signing out.',
            );
            return;
          }
          logout();
        },
      },
    ]);
  }, [logout]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.body}>
        <LinearGradient
          colors={[colors.brandGradientStart, colors.brandGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroCard}
        >
          <View style={styles.avatarBubble}>
            <Text style={styles.avatarInitial}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
          {phone ? <Text style={styles.phone}>{phone}</Text> : null}
        </LinearGradient>

        <TouchableOpacity
          onPress={handleLogout}
          style={styles.logoutBtn}
          activeOpacity={0.85}
          disabled={signingOut}
        >
          <AppIcon name="logout" size={18} color={colors.error} />
          <Text style={styles.logoutBtnText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgApp },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitle: { ...typography.display, fontSize: 22, color: colors.textPrimary },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  heroCard: {
    borderRadius: radius.xxl,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...shadows.cardRaised,
  },
  avatarBubble: {
    width: 72,
    height: 72,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  avatarInitial: { fontSize: 30, fontWeight: '800', color: colors.textInverse },
  name: { fontSize: 22, fontWeight: '800', color: colors.textInverse },
  phone: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    borderRadius: radius.button,
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  logoutBtnText: { fontWeight: '800', fontSize: 15, color: colors.error },
});
