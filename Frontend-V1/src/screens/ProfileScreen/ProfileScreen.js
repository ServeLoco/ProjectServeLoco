import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Animated,
  Linking,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import {
  AppScreen,
  AppHeader,
  Button,
} from '../../components';
import { colors, typography, spacing, radius, shadows } from '../../theme';
import { useAuthStore, useSettingsStore } from '../../stores';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const user = useAuthStore(state => state.user);
  const profile = useAuthStore(state => state.profile);
  const logout = useAuthStore(state => state.logout);
  const supportPhone = useSettingsStore(state => state.supportPhone);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;

  const cardFade = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(10)).current;
  const listAnim1 = useRef(new Animated.Value(0)).current;
  const listAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isAuthenticated) {
      Animated.stagger(100, [
        Animated.parallel([
          Animated.timing(cardFade, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(cardSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(listAnim1, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(listAnim2, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [isAuthenticated]);

  const openLogoutModal = () => {
    setShowLogoutModal(true);
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(modalScale, { toValue: 1, friction: 6, useNativeDriver: true })
    ]).start();
  };

  const closeLogoutModal = () => {
    Animated.parallel([
      Animated.timing(modalOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(modalScale, { toValue: 0.8, duration: 200, useNativeDriver: true })
    ]).start(() => {
      setShowLogoutModal(false);
    });
  };

  const handleLogout = () => {
    closeLogoutModal();
    logout();
  };

  const handleHelpSupport = () => {
    if (supportPhone) {
      Linking.openURL(`tel:${supportPhone}`);
    }
  };

  if (!isAuthenticated) {
    return (
      <AppScreen style={styles.container}>
        <AppHeader title="My Profile" />
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>👋</Text>
          <Text style={styles.emptyTitle}>Welcome to ServeLoco</Text>
          <Text style={styles.emptyDesc}>Login to view your profile, manage addresses, and track your orders.</Text>
          <Button label="Login / Signup" onPress={() => navigation.navigate('Auth')} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen style={styles.container} safeAreaBottom={false}>
      <AppHeader title="My Profile" />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Profile Card */}
        <Animated.View style={[styles.profileCard, { opacity: cardFade, transform: [{ translateY: cardSlide }] }]}>
          <View style={styles.cardHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.editIconBtn}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Text style={styles.editIcon}>✏️</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.profileName}>{profile?.name || 'User'}</Text>
          
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📞</Text>
            <Text style={styles.infoText}>{user?.phone || 'No phone added'}</Text>
          </View>

          {profile?.whatsapp && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>💬</Text>
              <Text style={styles.infoText}>{profile.whatsapp} (WhatsApp)</Text>
            </View>
          )}

          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📍</Text>
            <Text style={styles.infoText} numberOfLines={2}>
              {profile?.address || 'No address added yet.'}
            </Text>
          </View>

          {profile?.status === 'Blocked' && (
            <View style={styles.blockedBanner}>
              <Text style={styles.blockedText}>Your account is currently restricted. Contact support.</Text>
            </View>
          )}
        </Animated.View>

        {/* Menu Options */}
        <Animated.View style={[styles.menuGroup, { opacity: listAnim1, transform: [{ translateY: listAnim1.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>Account</Text>
          
          <MenuOption 
            icon="✏️" 
            label="Edit Profile" 
            onPress={() => navigation.navigate('EditProfile')} 
          />
          <MenuOption 
            icon="📦" 
            label="My Orders" 
            onPress={() => navigation.navigate('Orders')} 
          />
          <MenuOption 
            icon="📌" 
            label="Saved Address" 
            onPress={() => navigation.navigate('EditProfile')} // Route to EditProfile for now
          />
        </Animated.View>

        <Animated.View style={[styles.menuGroup, { opacity: listAnim2, transform: [{ translateY: listAnim2.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
          <Text style={styles.menuGroupTitle}>More</Text>
          
          <MenuOption 
            icon="🎧" 
            label="Help and Support" 
            onPress={handleHelpSupport} 
          />
          <MenuOption 
            icon="🚪" 
            label="Logout" 
            onPress={openLogoutModal} 
            isDestructive 
          />
        </Animated.View>

      </ScrollView>

      {/* Logout Modal */}
      <Modal visible={showLogoutModal} transparent animationType="none" onRequestClose={closeLogoutModal}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalBackdrop, { opacity: modalOpacity }]} />
          <Animated.View style={[styles.modalContent, { opacity: modalOpacity, transform: [{ scale: modalScale }] }]}>
            <Text style={styles.modalEmoji}>👋</Text>
            <Text style={styles.modalTitle}>Leaving so soon?</Text>
            <Text style={styles.modalDesc}>Are you sure you want to logout from your account?</Text>
            
            <View style={styles.modalActions}>
              <Button 
                label="Stay Logged In" 
                onPress={closeLogoutModal} 
                style={styles.modalBtn} 
              />
              <Button 
                label="Logout" 
                variant="outline"
                onPress={handleLogout} 
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

function MenuOption({ icon, label, onPress, isDestructive }) {
  return (
    <TouchableOpacity 
      style={styles.menuOption} 
      activeOpacity={0.7} 
      onPress={onPress}
    >
      <Text style={styles.menuIcon}>{icon}</Text>
      <Text style={[styles.menuLabel, isDestructive && { color: colors.error }]}>
        {label}
      </Text>
      <Text style={styles.menuChevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  profileCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '1A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.primary + '40',
  },
  avatarText: {
    ...typography.h2,
    color: colors.primary,
  },
  editIconBtn: {
    padding: spacing.xs,
    backgroundColor: colors.bgApp,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editIcon: {
    fontSize: 16,
  },
  profileName: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
    paddingRight: spacing.lg,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
    marginTop: 2,
  },
  infoText: {
    ...typography.body,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
  blockedBanner: {
    marginTop: spacing.md,
    backgroundColor: colors.error + '1A',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error + '40',
  },
  blockedText: {
    ...typography.caption,
    color: colors.error,
    fontWeight: '600',
    textAlign: 'center',
  },
  menuGroup: {
    marginBottom: spacing.xl,
  },
  menuGroupTitle: {
    ...typography.labelLarge,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuIcon: {
    fontSize: 20,
    marginRight: spacing.md,
    width: 28,
    textAlign: 'center',
  },
  menuLabel: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    fontWeight: '500',
  },
  menuChevron: {
    fontSize: 24,
    color: colors.textTertiary,
    lineHeight: 24,
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
  modalEmoji: {
    fontSize: 48,
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
