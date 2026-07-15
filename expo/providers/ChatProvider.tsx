import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { Platform } from 'react-native';
import type { Chat, ChatMessage, ChatSenderRole, MessageReaction } from '@/types';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/providers/AuthProvider';
import { useAppStateRefetchInterval } from '@/lib/use-app-state-refetch-interval';
import { useTabBadgesStore } from '@/lib/stores/tab-badges';

const CHATS_KEY = 'musorka_chats';
const MESSAGES_KEY = 'musorka_messages';
const USE_BACKEND = true;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

const initialChats: Chat[] = [
  {
    id: 'support',
    type: 'support',
    participants: ['user_1', 'support'],
    participantNames: ['Вы', 'Поддержка MUSORKA'],
    lastMessage: 'Здравствуйте! Чем можем помочь?',
    lastMessageTime: '2026-03-01T09:00:00',
    unreadCount: 1,
  },
];

const initialMessages: ChatMessage[] = [
  {
    id: 'msg_1',
    chatId: 'support',
    senderId: 'support',
    senderName: 'Поддержка MUSORKA',
    senderRole: 'support',
    text: 'Здравствуйте! Добро пожаловать в MUSORKA. Чем можем помочь?',
    timestamp: '2026-03-01T09:00:00',
    read: false,
  },
];

export const [ChatProvider, useChats] = createContextHook(() => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  // Android: реже опрашиваем список чатов, чтобы снизить нагрузку на память и BlobModule.
  const chatsPollInterval = useAppStateRefetchInterval(Platform.OS === 'android' ? 120_000 : 60_000);

  const backendChatsQuery = trpc.chats.list.useQuery(undefined, {
    enabled: USE_BACKEND && isAuthenticated,
    retry: (failureCount, err: any) => {
      const msg = err?.message || '';
      if (msg.includes('Слишком много запросов')) return false;
      return failureCount < 1;
    },
    retryDelay: 800,
    staleTime: 30_000,
    gcTime: 900_000,
    refetchInterval: chatsPollInterval,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev: any) => prev,
  });

  const localChatsQuery = useQuery({
    queryKey: ['chats-local'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(CHATS_KEY);
      if (stored) return JSON.parse(stored) as Chat[];
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(initialChats));
      return initialChats;
    },
    enabled: !USE_BACKEND,
  });

  const localMessagesQuery = useQuery({
    queryKey: ['messages-local'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(MESSAGES_KEY);
      if (stored) return JSON.parse(stored) as ChatMessage[];
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(initialMessages));
      return initialMessages;
    },
    enabled: !USE_BACKEND,
  });

  useEffect(() => {
    if (USE_BACKEND && backendChatsQuery.data) {
      setChats(backendChatsQuery.data as unknown as Chat[]);
    } else if (!USE_BACKEND) {
      if (localChatsQuery.data) setChats(localChatsQuery.data);
      if (localMessagesQuery.data) setMessages(localMessagesQuery.data);
    }
  }, [backendChatsQuery.data, localChatsQuery.data, localMessagesQuery.data]);

  const localSaveChatsMutation = useMutation({
    mutationFn: async (updated: Chat[]) => {
      await AsyncStorage.setItem(CHATS_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['chats-local'] }); },
  });

  const localSaveMessagesMutation = useMutation({
    mutationFn: async (updated: ChatMessage[]) => {
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['messages-local'] }); },
  });

  const utils = trpc.useUtils();

  const invalidateChats = useCallback(() => {
    void utils.chats.invalidate();
  }, [utils]);

  const backendSendMessage = trpc.chats.sendMessage.useMutation({
    onError: (err) => {
      console.error('[ChatProvider] sendMessage error:', err.message);
    },
  });

  const backendMarkAsRead = trpc.chats.markAsRead.useMutation({
    onSuccess: () => {

      void utils.chats.list.invalidate();
      void utils.chats.supportChats.invalidate();
    },
    onError: (err) => {
      console.error('[ChatProvider] markAsRead error:', err.message);
    },
  });

  const backendGetOrCreateRequestChat = trpc.chats.getOrCreateRequestChat.useMutation({
    onError: (err) => {
      console.error('[ChatProvider] getOrCreateRequestChat error:', err);
    },
  });
  const _backendGetOrCreateSupportChat = trpc.chats.getOrCreateSupportChat.useMutation();

  const { mutate: localSaveChats } = localSaveChatsMutation;
  const { mutate: localSaveMessages } = localSaveMessagesMutation;

  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendMessage = useCallback((chatId: string, senderId: string, senderName: string, senderRole: ChatSenderRole, text: string, attachment?: { url: string; type: 'image' | 'file' | 'audio' | 'video'; name?: string; audioDurationMs?: number }) => {
    if (!chatId || (!text?.trim() && !attachment)) {
      console.warn('[ChatProvider] sendMessage: missing chatId or text/attachment');
      return;
    }
    if (USE_BACKEND) {
      if (!isValidUuid(chatId)) {
        console.warn('[ChatProvider] sendMessage skipped: invalid UUID:', chatId);
        return;
      }

      const optimisticId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const optimisticMsg: ChatMessage = {
        id: optimisticId,
        chatId,
        senderId,
        senderName,
        senderRole,
        text: text.trim() || (attachment?.type === 'image' ? '📷 Фото' : attachment?.type === 'audio' ? '🎤 Аудио' : attachment?.type === 'video' ? '🎥 Видео' : '📎 Файл'),
        timestamp: new Date().toISOString(),
        read: false,
        attachmentUrl: attachment?.url ?? null,
        attachmentType: attachment?.type ?? null,
        attachmentName: attachment?.name ?? null,
        audioDurationMs: attachment?.audioDurationMs ?? null,
      };

      const messagesKey = [['chats', 'messages'], { input: { chatId }, type: 'query' }];
      queryClient.setQueryData(messagesKey, (old: ChatMessage[] | undefined) => {
        return [...(old ?? []), optimisticMsg];
      });



      const fallbackText = text.trim() || (attachment?.type === 'image' ? '📷 Фото' : attachment?.type === 'audio' ? '🎤 Аудио' : attachment?.type === 'video' ? '🎥 Видео' : '📎 Файл');

      backendSendMessage.mutate({
        chatId,
        text: fallbackText,
        attachmentUrl: attachment?.url,
        attachmentType: attachment?.type,
        attachmentName: attachment?.name,
        audioDurationMs: attachment?.audioDurationMs,
      }, {
        onSuccess: (serverMsg: any) => {
          queryClient.setQueryData(messagesKey, (old: ChatMessage[] | undefined) => {
            const list = old ?? [];
            const realMsg: ChatMessage = {
              id: String(serverMsg?.id ?? optimisticId),
              chatId: String(serverMsg?.chatId ?? chatId),
              senderId: String(serverMsg?.senderId ?? senderId),
              senderName: String(serverMsg?.senderName ?? senderName),
              senderRole: (serverMsg?.senderRole ?? senderRole) as ChatSenderRole,
              text: String(serverMsg?.text ?? fallbackText),
              timestamp: String(serverMsg?.timestamp ?? optimisticMsg.timestamp),
              read: Boolean(serverMsg?.read ?? false),
              attachmentUrl: serverMsg?.attachmentUrl ?? optimisticMsg.attachmentUrl ?? null,
              attachmentType: serverMsg?.attachmentType ?? optimisticMsg.attachmentType ?? null,
              attachmentName: serverMsg?.attachmentName ?? optimisticMsg.attachmentName ?? null,
              audioDurationMs: optimisticMsg.audioDurationMs ?? null,
            };
            const idx = list.findIndex((m) => m.id === optimisticId);
            if (idx >= 0) {
              const next = list.slice();
              next[idx] = realMsg;
              return next;
            }
            if (list.some((m) => m.id === realMsg.id)) return list;
            return [...list, realMsg];
          });
          void queryClient.invalidateQueries({ queryKey: [['chats', 'list']] });
        },
        onError: () => {
          queryClient.setQueryData(messagesKey, (old: ChatMessage[] | undefined) => {
            return (old ?? []).filter(m => m.id !== optimisticId);
          });
        },
      });
      return;
    }

    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      chatId,
      senderId,
      senderName,
      senderRole,
      text,
      timestamp: new Date().toISOString(),
      read: false,
    };

    setMessages(prev => {
      const updated = [...prev, newMessage];
      localSaveMessages(updated);
      return updated;
    });

    setChats(prev => {
      const updated = prev.map((chat) =>
        chat.id === chatId
          ? { ...chat, lastMessage: text, lastMessageTime: newMessage.timestamp, unreadCount: 0 }
          : chat
      );
      localSaveChats(updated);
      return updated;
    });

    if (chatId === 'support') {
      setTimeout(() => {
        const autoReply: ChatMessage = {
          id: (Date.now() + 1).toString(),
          chatId: 'support',
          senderId: 'support',
          senderName: 'Поддержка MUSORKA',
          senderRole: 'support',
          text: 'Спасибо за сообщение! Наш оператор ответит вам в ближайшее время.',
          timestamp: new Date().toISOString(),
          read: false,
        };

        setMessages(prev => {
          const updated = [...prev, autoReply];
          localSaveMessages(updated);
          return updated;
        });

        setChats(prev => {
          const updated = prev.map((chat) =>
            chat.id === 'support'
              ? { ...chat, lastMessage: autoReply.text, lastMessageTime: autoReply.timestamp, unreadCount: 1 }
              : chat
          );
          localSaveChats(updated);
          return updated;
        });
      }, 2000);
    }
  }, [localSaveChats, localSaveMessages, backendSendMessage]);

  const getChatMessages = useCallback((chatId: string) => {
    if (USE_BACKEND) {
      return [];
    }
    return messages.filter((m) => m.chatId === chatId);
  }, [messages]);

  const markChatAsRead = useCallback((chatId: string) => {
    if (USE_BACKEND) {
      if (!isValidUuid(chatId)) {
        console.warn('[ChatProvider] markAsRead skipped: invalid UUID:', chatId);
        return;
      }
      backendMarkAsRead.mutate({ chatId });
      return;
    }

    setChats(prev => {
      const needsUpdate = prev.some(c => c.id === chatId && c.unreadCount > 0);
      if (!needsUpdate) return prev;
      const updated = prev.map((chat) =>
        chat.id === chatId ? { ...chat, unreadCount: 0 } : chat
      );
      localSaveChats(updated);
      return updated;
    });

    setMessages(prev => {
      const needsUpdate = prev.some(m => m.chatId === chatId && !m.read);
      if (!needsUpdate) return prev;
      const updated = prev.map((m) =>
        m.chatId === chatId ? { ...m, read: true } : m
      );
      localSaveMessages(updated);
      return updated;
    });
  }, [localSaveChats, localSaveMessages, backendMarkAsRead]);

  const getOrCreateRequestChat = useCallback(async (requestId: string, participants: string[], participantNames: string[]): Promise<string | null> => {
    if (USE_BACKEND) {
      const existing = chatsRef.current.find((c) => {
        if (c.requestId !== requestId) return false;
        return participants.every(p => c.participants.includes(p));
      });
      if (existing) {

        return existing.id;
      }

      try {
        const chatId = await backendGetOrCreateRequestChat.mutateAsync({
          requestId,
          participantIds: participants,
          participantNames,
        });

        invalidateChats();
        return chatId as string;
      } catch (err) {
        console.error('[ChatProvider] Error creating request chat:', err);
        return null;
      }
    }

    const existing = chatsRef.current.find((c) => {
      if (c.requestId !== requestId) return false;
      return participants.every(p => c.participants.includes(p));
    });
    if (existing) return existing.id;

    const newChatId = `request_chat_${requestId}_${Date.now()}`;
    const newChat: Chat = {
      id: newChatId,
      type: 'request',
      requestId,
      participants,
      participantNames,
      lastMessage: 'Чат по заявке создан',
      lastMessageTime: new Date().toISOString(),
      unreadCount: 0,
    };

    setChats(prev => {
      const updated = [newChat, ...prev];
      localSaveChats(updated);
      return updated;
    });
    return newChatId;
  }, [localSaveChats, backendGetOrCreateRequestChat, invalidateChats]);

  const totalUnread = useMemo(() => chats.filter(c => c.type !== 'support').reduce((sum, c) => sum + c.unreadCount, 0), [chats]);
  const supportUnread = useMemo(() => chats.filter(c => c.type === 'support').reduce((sum, c) => sum + c.unreadCount, 0), [chats]);

  useEffect(() => {
    useTabBadgesStore.getState().setChatUnread(totalUnread, supportUnread);
  }, [totalUnread, supportUnread]);

  const refetch = useCallback(async () => {
    if (USE_BACKEND) {
      void backendChatsQuery.refetch();
    } else {
      void localChatsQuery.refetch();
      void localMessagesQuery.refetch();
    }
  }, [backendChatsQuery, localChatsQuery, localMessagesQuery]);

  const backendToggleReaction = trpc.chats.toggleReaction.useMutation({
    onError: (err) => {
      console.error('[ChatProvider] toggleReaction error:', err.message);
    },
  });

  const applyReactionLocally = useCallback((messageId: string, emoji: string, userId: string) => {
    queryClient.setQueriesData({ queryKey: [['chats', 'messages']] }, (old: unknown) => {
      if (!Array.isArray(old)) return old;
      const arr = old as ChatMessage[];
      let changed = false;
      const next = arr.map((m) => {
        if (m.id !== messageId) return m;
        const reactions: MessageReaction[] = m.reactions ? m.reactions.map(r => ({ ...r, userIds: [...r.userIds] })) : [];
        const idx = reactions.findIndex(r => r.emoji === emoji);
        if (idx >= 0) {
          const existing = reactions[idx];
          if (existing.userIds.includes(userId)) {
            const newUserIds = existing.userIds.filter(id => id !== userId);
            if (newUserIds.length === 0) reactions.splice(idx, 1);
            else reactions[idx] = { ...existing, userIds: newUserIds };
          } else {
            reactions[idx] = { ...existing, userIds: [...existing.userIds, userId] };
          }
        } else {
          reactions.push({ emoji, userIds: [userId] });
        }
        changed = true;
        return { ...m, reactions };
      });
      return changed ? next : arr;
    });
  }, [queryClient]);

  const toggleReaction = useCallback((messageId: string, emoji: string, userId: string) => {
    if (!isValidUuid(messageId)) {
      console.warn('[ChatProvider] toggleReaction skipped: invalid message id', messageId);
      return;
    }
    applyReactionLocally(messageId, emoji, userId);
    backendToggleReaction.mutate({ messageId, emoji }, {
      onSuccess: () => {
        setTimeout(() => { void queryClient.invalidateQueries({ queryKey: [['chats', 'messages']] }); }, 250);
      },
      onError: () => {
        applyReactionLocally(messageId, emoji, userId);
      },
    });
  }, [applyReactionLocally, backendToggleReaction, queryClient]);

  const getReactions = useCallback((_messageId: string): MessageReaction[] => {
    return [];
  }, []);

  const isSendingMessage = backendSendMessage.isPending;

  return useMemo(() => ({
    chats,
    messages,
    sendMessage,
    getChatMessages,
    getOrCreateRequestChat,
    totalUnread,
    supportUnread,
    markChatAsRead,
    refetch,
    isSendingMessage,
    toggleReaction,
    getReactions,
    isLoading: USE_BACKEND ? backendChatsQuery.isLoading : (localChatsQuery.isLoading || localMessagesQuery.isLoading),
  }), [
    chats, messages, sendMessage, getChatMessages,
    getOrCreateRequestChat, totalUnread, supportUnread, markChatAsRead, refetch,
    isSendingMessage, toggleReaction, getReactions,
    backendChatsQuery.isLoading, localChatsQuery.isLoading, localMessagesQuery.isLoading,
  ]);
});
