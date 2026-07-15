import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Bell,
  MessageCircle,
  Package,
  Info,
  CheckCheck,
  Circle,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useNotifications } from '@/providers/NotificationsProvider';
import { AppNotification } from '@/types';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';

const typeIcons: Record<string, { icon: React.ComponentType<{ size: number; color: string }>; color: string; bg: string }> = {
  request_update: { icon: Package, color: Colors.info, bg: Colors.infoLight },
  new_message: { icon: MessageCircle, color: Colors.primary, bg: Colors.primaryLight },
  new_request: { icon: Bell, color: Colors.warning, bg: Colors.warningLight },
  system: { icon: Info, color: Colors.textSecondary, bg: Colors.cardSecondary },
  broadcast: { icon: Bell, color: Colors.accent, bg: Colors.cardSecondary },
};

const NotificationItem = React.memo(function NotificationItem({ notification, onPress }: { notification: AppNotification; onPress: () => void }) {
  const config = typeIcons[notification.type] ?? typeIcons.system;
  const IconComp = config.icon;
  const time = new Date(notification.createdAt);
  const timeStr = time.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ', ' +
    time.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[styles.notifItem, !notification.read && styles.notifItemUnread]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
      >
        <View style={[styles.notifIcon, { backgroundColor: config.bg }]}>
          <IconComp size={22} color={config.color} />
          {!notification.read && <View style={styles.unreadDot} />}
        </View>
        <View style={styles.notifContent}>
          <View style={styles.notifHeader}>
            <Text style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]} numberOfLines={1}>
              {notification.title}
            </Text>
            <Text style={[styles.notifTime, !notification.read && styles.notifTimeUnread]}>
              {timeStr}
            </Text>
          </View>
          <Text style={styles.notifBody} numberOfLines={2}>{notification.body}</Text>
          {notification.type === 'new_request' && (
            <View style={styles.typeLabelRow}>
              <Circle size={6} color={Colors.warning} fill={Colors.warning} />
              <Text style={styles.typeLabel}>Новая заявка</Text>
            </View>
          )}
          {notification.type === 'request_update' && (
            <View style={styles.typeLabelRow}>
              <Circle size={6} color={Colors.info} fill={Colors.info} />
              <Text style={styles.typeLabel}>Обновление заявки</Text>
            </View>
          )}
          {notification.type === 'new_message' && (
            <View style={styles.typeLabelRow}>
              <Circle size={6} color={Colors.primary} fill={Colors.primary} />
              <Text style={styles.typeLabel}>Новое сообщение</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function NotificationsTabScreen() {
  const { notifications, markAsRead, markAllAsRead, unreadCount, refetch } = useNotifications();
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const router = useRouter();

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void refetch();
    setTimeout(() => setRefreshing(false), 400);
  }, [refetch]);

  const { refreshControl: notifRefreshControl, MRefreshIndicator: notifMIndicator } = useMRefreshControl(refreshing, handleRefresh);

  const handleNotificationPress = React.useCallback((notification: AppNotification) => {
    markAsRead(notification.id);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const data = notification.data;
    if (data?.requestId) {
      router.push({ pathname: '/request-details', params: { id: data.requestId } });
      return;
    }
    if (data?.chatId) {
      router.push({ pathname: '/chat-room', params: { chatId: data.chatId } });
      return;
    }
  }, [markAsRead, router]);

  const floatingHeaderHeight = useFloatingHeaderHeight();

  return (
    <View style={styles.container}>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NotificationItem
            notification={item}
            onPress={() => handleNotificationPress(item)}
          />
        )}
        contentContainerStyle={[styles.listContent, { paddingTop: floatingHeaderHeight + (unreadCount > 0 ? 0 : 8) }]}
        ListHeaderComponent={
          <>
            {notifMIndicator}
            {unreadCount > 0 ? (
              <View style={styles.markAllRow}>
                <TouchableOpacity onPress={markAllAsRead} style={styles.markAllButton}>
                  <CheckCheck size={16} color={Colors.primary} />
                  <Text style={styles.markAllText}>Прочитать все</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        }
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={notifRefreshControl}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIcon}>
              <Bell size={40} color={Colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>Нет уведомлений</Text>
            <Text style={styles.emptyText}>
              Уведомления появятся при{'\n'}обновлении заявок и сообщениях
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  markAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 2,
  },
  markAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  markAllText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingBottom: 96,
  },
  separator: {
    height: 8,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  notifItemUnread: {
    backgroundColor: Colors.cardSecondary,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  notifIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.card,
  },
  notifContent: {
    flex: 1,
    marginRight: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notifTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  notifTitleUnread: {
    fontWeight: '700' as const,
  },
  notifTime: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  notifTimeUnread: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  notifBody: {
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  typeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  typeLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
