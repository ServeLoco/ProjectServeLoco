import React, { useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity } from 'react-native';
import { AppScreen, AppHeader, AppIcon } from '../../../components';
import { colors, typography, spacing, radius } from '../../../theme';

const MOCK_NOTIFICATIONS = [
  {
    id: '1',
    title: 'Order Delivered 🎉',
    body: 'Your order #SL-9402 has been successfully delivered. Enjoy your meal!',
    time: '2 hours ago',
    read: false,
    type: 'success',
  },
  {
    id: '2',
    title: '30% Discount Activated! 🏷️',
    body: 'Use code SNACK30 on your next snack order to save big today.',
    time: '5 hours ago',
    read: false,
    type: 'offer',
  },
  {
    id: '3',
    title: 'Welcome to ServeLoco! 🛵',
    body: 'Thanks for signing up. Browse packed snacks or order freshly prepared food instantly.',
    time: '1 day ago',
    read: true,
    type: 'info',
  },
];

export default function NotificationsScreen({ navigation }) {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const renderItem = ({ item }) => {
    let iconName = 'notification';
    let iconColor = colors.primary;

    if (item.type === 'success') {
      iconName = 'check';
      iconColor = colors.success || '#4CAF50';
    } else if (item.type === 'offer') {
      iconName = 'rupee';
      iconColor = colors.saffron || '#FF9800';
    }

    return (
      <View style={[styles.notificationCard, !item.read && styles.unreadCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.iconWrapper}>
            <AppIcon name={iconName} size={18} color={iconColor} />
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.title, !item.read && styles.unreadText]}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <Text style={styles.time}>{item.time}</Text>
          </View>
          <TouchableOpacity onPress={() => clearNotification(item.id)} style={styles.deleteBtn}>
            <AppIcon name="close" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <AppScreen style={styles.container} safeAreaBottom>
      <AppHeader 
        title="Notifications" 
        onBack={() => navigation.goBack()} 
        rightElement={
          notifications.some(n => !n.read) ? (
            <TouchableOpacity onPress={markAllAsRead}>
              <Text style={styles.headerRightText}>Read All</Text>
            </TouchableOpacity>
          ) : null
        }
      />

      <FlatList
        data={notifications}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <AppIcon name="notification" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>All caught up!</Text>
            <Text style={styles.emptySubtitle}>No new notifications at the moment.</Text>
          </View>
        }
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgApp,
  },
  listContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  notificationCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  unreadCard: {
    borderColor: colors.primary,
    borderLeftWidth: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgApp,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardContent: {
    flex: 1,
    marginRight: spacing.xs,
  },
  title: {
    ...typography.label,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: '700',
  },
  body: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  time: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 11,
  },
  deleteBtn: {
    padding: spacing.xs,
  },
  headerRightText: {
    ...typography.label,
    color: colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 120,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
