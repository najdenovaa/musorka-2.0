import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Animated, ActivityIndicator, type ListRenderItemInfo, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MessageCircle, Headphones, Circle, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useChats } from '@/providers/ChatProvider';
import { useAuth } from '@/providers/AuthProvider';
import { Chat } from '@/types';
import { trpc } from '@/lib/trpc';
import MLoader from '@/components/MLoader';
import { DEFAULT_LIST_PERFORMANCE } from '@/lib/flat-list-config';
import { Image as ExpoImage } from '@/components/MImage';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import OnlineIndicator from '@/components/OnlineIndicator';
import { useOnlineStatus } from '@/hooks/useOnlinePresence';

function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

const ChatListRow = React.memo(function ChatListRow({
  chat,
  onOpenChat,
  currentUserId,
  currentUserName,
  isOtherOnline,
}: {
  chat: Chat;
  onOpenChat: (chatId: string) => void;
  currentUserId?: string;
  currentUserName?: string;
  isOtherOnline?: boolean;
}) {
  const isSupport = chat.type === 'support';

  const handlePress = React.useCallback(() => {
    onOpenChat(chat.id);
  }, [onOpenChat, chat.id]);

  const { displayName, otherAvatar } = React.useMemo(() => {
    if (isSupport) return { displayName: 'Поддержка MUSORKA', otherAvatar: null };
    let name = 'Чат';
    let avatar: string | null = null;
    if (currentUserId) {
      const otherIdx = chat.participants.findIndex(p => p !== currentUserId);
      if (otherIdx >= 0) {
        if (chat.participantNames[otherIdx]) {
          name = chat.participantNames[otherIdx];
        }
        if (chat.participantAvatars && chat.participantAvatars[otherIdx]) {
          avatar = chat.participantAvatars[otherIdx];
        }
      }
    } else if (currentUserName) {
      const otherIdx = chat.participantNames.findIndex(n => n !== currentUserName);
      if (otherIdx >= 0) {
        name = chat.participantNames[otherIdx] || 'Чат';
        if (chat.participantAvatars && chat.participantAvatars[otherIdx]) {
          avatar = chat.participantAvatars[otherIdx];
        }
      }
    }
    return { displayName: name, otherAvatar: avatar };
  }, [chat, currentUserId, currentUserName, isSupport]);

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
        style={styles.chatItem}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        testID={`chat-${chat.id}`}
      >
        <View style={styles.avatarContainer}>
          {isSupport ? (
            <View style={[styles.avatar, styles.supportAvatar]}>
              <Headphones size={22} color={Colors.white} />
            </View>
          ) : otherAvatar && isSafeImageUri(otherAvatar) ? (
            <ExpoImage
              source={{ uri: otherAvatar }}
              style={styles.avatarImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={120}
            />
          ) : (
            <View style={[styles.avatar, styles.requestAvatar]}>
              <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
            </View>
          )}
          {isOtherOnline && !isSupport && (
            <View style={styles.onlineDotWrap}>
              <OnlineIndicator isOnline={true} size={10} borderColor={Colors.card} />
            </View>
          )}
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.chatName} numberOfLines={1}>
              {displayName}
            </Text>
            {isOtherOnline && !isSupport && (
              <View style={styles.onlineTextBadge}>
                <Text style={styles.onlineText}>онлайн</Text>
              </View>
            )}
            {chat.lastMessageTime && (
              <Text style={[styles.chatTime, chat.unreadCount > 0 && styles.chatTimeUnread]}>
                {formatTime(chat.lastMessageTime)}
              </Text>
            )}
          </View>
          <View style={styles.chatFooter}>
            <Text style={[styles.chatLastMessage, chat.unreadCount > 0 && styles.chatLastMessageUnread]} numberOfLines={1}>
              {chat.lastMessage ?? 'Нет сообщений'}
            </Text>
            {chat.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>{chat.unreadCount}</Text>
              </View>
            )}
          </View>
          {chat.requestId && (
            <View style={styles.requestLabelContainer}>
              <Circle size={6} color={Colors.primary} fill={Colors.primary} />
              <Text style={styles.requestLabel}>Заявка #{chat.requestId.substring(0, 8)}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
});

function PinnedSupportChat({ supportChat, onOpenChat }: { supportChat: Chat | null; onOpenChat: (chatId: string) => void }) {
  const scaleAnim = React.useRef(new Animated.Value(1)).current;
  const getOrCreateSupport = trpc.chats.getOrCreateSupportChat.useMutation();
  const [isCreating, setIsCreating] = React.useState<boolean>(false);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: Platform.OS !== 'web' }).start();
  };

  const handlePress = React.useCallback(async () => {
    void Haptics.selectionAsync();
    if (supportChat) {
      onOpenChat(supportChat.id);
      return;
    }
    try {
      setIsCreating(true);
      const chatId = await getOrCreateSupport.mutateAsync();
      if (chatId) {
        onOpenChat(chatId as string);
      }
    } catch (err) {
      console.error('[PinnedSupportChat] Error creating support chat:', err);
    } finally {
      setIsCreating(false);
    }
  }, [supportChat, onOpenChat, getOrCreateSupport]);

  const unreadCount = supportChat?.unreadCount ?? 0;
  const hasUnread = unreadCount > 0;

  return (
    <Animated.View style={[pinnedStyles.wrapper, { transform: [{ scale: scaleAnim }] }]}>
      <TouchableOpacity
        style={[pinnedStyles.container, hasUnread && pinnedStyles.containerUnread]}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        disabled={isCreating}
        testID="pinned-support-chat"
      >
        <View style={pinnedStyles.iconContainer}>
          <View style={[pinnedStyles.iconCircle, hasUnread && pinnedStyles.iconCircleUnread]}>
            <Headphones size={22} color={Colors.white} />
          </View>
          {hasUnread && <View style={pinnedStyles.unreadDot} />}
        </View>
        <View style={pinnedStyles.content}>
          <View style={pinnedStyles.topRow}>
            <Text style={pinnedStyles.title}>Поддержка MUSORKA</Text>
            {supportChat?.lastMessageTime && (
              <Text style={[pinnedStyles.time, hasUnread && pinnedStyles.timeUnread]}>
                {formatTime(supportChat.lastMessageTime)}
              </Text>
            )}
          </View>
          <View style={pinnedStyles.bottomRow}>
            <Text style={[pinnedStyles.lastMessage, hasUnread && pinnedStyles.lastMessageUnread]} numberOfLines={1}>
              {supportChat?.lastMessage ?? 'Напишите нам, если нужна помощь'}
            </Text>
            {hasUnread ? (
              <View style={pinnedStyles.badge}>
                <Text style={pinnedStyles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </View>
            ) : isCreating ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <ChevronRight size={16} color={Colors.textMuted} />
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const pinnedStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 12,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDark + '30',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  containerUnread: {
    backgroundColor: Colors.primary + '15',
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  iconContainer: {
    position: 'relative',
    marginRight: 12,
  },
  iconCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.primaryDark,
    borderWidth: 2,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleUnread: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  unreadDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: Colors.primaryDark + '30',
  },
  content: {
    flex: 1,
    marginRight: 4,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.primary,
    flex: 1,
    marginRight: 8,
  },
  time: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  timeUnread: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  lastMessage: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    marginRight: 8,
  },
  lastMessageUnread: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  badge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});

export default function ChatListScreen() {
  const router = useRouter();
  const { chats, isLoading, refetch } = useChats();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const floatingHeaderHeight = useFloatingHeaderHeight();

  const otherParticipantIds = React.useMemo(() => {
    if (!user) return [];
    const ids: string[] = [];
    for (const c of chats) {
      if (c.type === 'support') continue;
      const otherId = c.participants.find(p => p !== user.id);
      if (otherId && !ids.includes(otherId)) ids.push(otherId);
    }
    return ids;
  }, [chats, user]);

  const { isOnline } = useOnlineStatus(otherParticipantIds);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    void refetch();
    setTimeout(() => setRefreshing(false), 400);
  }, [refetch]);

  const { refreshControl: chatRefreshControl, MRefreshIndicator: chatMIndicator } = useMRefreshControl(refreshing, handleRefresh);

  const isStaff = user?.role === 'admin' || user?.role === 'support';

  const filteredChats = React.useMemo(() => {
    return chats.filter(c => c.type !== 'support');
  }, [chats]);

  const sortedChats = React.useMemo(() => {
    return [...filteredChats].sort((a, b) => {
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime();
    });
  }, [filteredChats]);

  const supportChat = React.useMemo(() => {
    return chats.find(c => c.type === 'support') ?? null;
  }, [chats]);

  const handleOpenChat = React.useCallback((chatId: string) => {
    router.push({ pathname: '/chat-room', params: { chatId } });
  }, [router]);

  const renderChatItem = React.useCallback(
    ({ item }: ListRenderItemInfo<Chat>) => {
      const otherId = user ? item.participants.find(p => p !== user.id) : undefined;
      return (
        <ChatListRow
          chat={item}
          onOpenChat={handleOpenChat}
          currentUserId={user?.id}
          currentUserName={user?.name}
          isOtherOnline={otherId ? isOnline(otherId) : false}
        />
      );
    },
    [handleOpenChat, user?.id, user?.name, isOnline],
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <MLoader size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedChats}
        keyExtractor={(item) => item.id}
        renderItem={renderChatItem}
        {...DEFAULT_LIST_PERFORMANCE}
        contentContainerStyle={[styles.listContent, { paddingTop: floatingHeaderHeight + 8 }]}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={chatRefreshControl}
        ListHeaderComponent={
          <>
            {chatMIndicator}
            {!isStaff && (
              <PinnedSupportChat
                supportChat={supportChat}
                onOpenChat={handleOpenChat}
              />
            )}
          </>
        }
        ListEmptyComponent={
          isStaff ? (
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIcon}>
                <MessageCircle size={40} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>Нет чатов</Text>
              <Text style={styles.emptyText}>
                Чаты появятся после создания заявки{'\n'}и предложения условий исполнителем
              </Text>
            </View>
          ) : null
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
    paddingHorizontal: 12,
    paddingBottom: 100,
  
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  separator: {
    height: 8,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: Colors.borderLight,
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  supportAvatar: {
    backgroundColor: Colors.primaryDark,
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  requestAvatar: {
    backgroundColor: Colors.infoLight,
    borderWidth: 2,
    borderColor: Colors.info,
  },
  onlineDotWrap: {
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  onlineTextBadge: {
    marginRight: 6,
  },
  onlineText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.success,
  },
  chatContent: {
    flex: 1,
    marginRight: 4,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  chatName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  chatTime: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  chatTimeUnread: {
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  chatFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chatLastMessage: {
    fontSize: 13,
    color: Colors.textMuted,
    flex: 1,
    marginRight: 8,
  },
  chatLastMessageUnread: {
    color: Colors.textSecondary,
    fontWeight: '500' as const,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  requestLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  requestLabel: {
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
