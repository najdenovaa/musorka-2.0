import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { AppNotification } from '@/types';
import { useAuth } from '@/providers/AuthProvider';
import { trpc } from '@/lib/trpc';
import { useRouter } from 'expo-router';
import { useTabBadgesStore } from '@/lib/stores/tab-badges';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useAppStateRefetchInterval } from '@/lib/use-app-state-refetch-interval';

const NOTIF_KEY = 'musorka_notifications';
const USE_BACKEND = true;

const initialNotifications: AppNotification[] = [
  {
    id: 'welcome_1',
    title: 'Добро пожаловать в MUSORKA',
    body: 'Заявки и исполнители по Тюмени. Новые заявки и обновления приходят в виде пуш-уведомлений.',
    type: 'system',
    read: true,
    createdAt: '2026-03-01T09:00:00',
  },
];

async function setupNotificationChannel() {
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'MUSORKA',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        showBadge: true,
      });
    }
  } catch (err) {
    console.log('[Notifications] Channel setup error:', err);
  }
}

async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted, status:', finalStatus);
      return null;
    }

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let projectId: string | undefined;
    try {
      const fromEas = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
      const fromEnv = process.env.EXPO_PUBLIC_PROJECT_ID as string | undefined;
      const candidate = (fromEas && UUID_RE.test(fromEas))
        ? fromEas
        : (fromEnv && UUID_RE.test(fromEnv) ? fromEnv : undefined);
      projectId = candidate;
      console.log('[Notifications] Using projectId:', projectId ? projectId.substring(0, 8) + '...' : 'none (invalid/absent UUID, skipping push registration)');
    } catch (e) {
      console.log('[Notifications] Could not get projectId from Constants:', e);
    }

    if (!projectId) {
      // Expo Go / preview without a valid EAS UUID — skip remote push registration to avoid 400 VALIDATION_ERROR.
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    console.log('[Notifications] Push token received, length:', tokenData.data?.length ?? 0);
    return tokenData.data;
  } catch (error) {
    console.error('[Notifications] Error registering for push:', error);
    return null;
  }
}

function setupForegroundHandler() {
  if (Platform.OS === 'web') return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    console.log('[Notifications] Foreground handler set');
  } catch (err) {
    console.log('[Notifications] Foreground handler error:', err);
  }
}

export const [NotificationsProvider, useNotifications] = createContextHook(() => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const shownNotifIds = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const router = useRouter();
  const responseListenerRef = useRef<any>(null);
  const receivedListenerRef = useRef<any>(null);

  const notifPollInterval = useAppStateRefetchInterval(45_000);
  const utils = trpc.useUtils();

  const backendQuery = trpc.notifications.list.useQuery(undefined, {
    enabled: USE_BACKEND && isAuthenticated,
    retry: (failureCount, err: any) => {
      const msg = err?.message || '';
      if (msg.includes('Слишком много запросов')) return false;
      return failureCount < 1;
    },
    staleTime: 20_000,
    gcTime: 600_000,
    refetchInterval: notifPollInterval,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: (prev: any) => prev,
  });

  const localQuery = useQuery({
    queryKey: ['notifications-local'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(NOTIF_KEY);
      if (stored) return JSON.parse(stored) as AppNotification[];
      await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(initialNotifications));
      return initialNotifications;
    },
    enabled: !USE_BACKEND,
  });

  const prevNotifIdsRef = useRef<Set<string>>(new Set());

  const applyOptimisticPatch = useCallback((payload?: { requestId?: unknown; subType?: unknown; newStatus?: unknown }) => {
    if (!payload?.requestId || typeof payload.requestId !== 'string') return;
    const rid = payload.requestId;
    const subType = typeof payload.subType === 'string' ? payload.subType : undefined;
    const newStatus = typeof payload.newStatus === 'string' ? payload.newStatus : undefined;
    if (!subType && !newStatus) return;

    const patchRequest = (r: any): any => {
      if (!r || r.id !== rid) return r;
      const next = { ...r };
      if (newStatus) {
        if (newStatus === 'completed') {
          next.status = 'completed';
          next.completedAt = next.completedAt ?? new Date().toISOString();
        } else if (newStatus === 'in_progress') {
          next.status = 'in_progress';
          next.acceptedAt = next.acceptedAt ?? new Date().toISOString();
          next.offerStatus = 'accepted';
        } else {
          next.status = newStatus;
        }
      }
      if (subType === 'proposal_declined') {
        next.offerStatus = 'declined';
      }
      return next;
    };

    try {
      queryClient.setQueriesData<any>({ queryKey: [['requests', 'list']] }, (old: any) => {
        if (!old) return old;
        if (Array.isArray(old)) return old.map(patchRequest);
        if (old?.items && Array.isArray(old.items)) {
          return { ...old, items: old.items.map(patchRequest) };
        }
        return old;
      });
      queryClient.setQueriesData<any>({ queryKey: [['requests', 'getById']] }, (old: any) => {
        if (!old) return old;
        return patchRequest(old);
      });
    } catch (err) {
      if (__DEV__) console.log('[Notifications] Optimistic patch error:', err);
    }
  }, [queryClient]);

  const invalidateOnNotifType = useCallback((notifTypes: string[], payload?: { requestId?: unknown; chatId?: unknown; subType?: unknown; newStatus?: unknown }) => {
    applyOptimisticPatch(payload);

    void utils.notifications.invalidate();
    void utils.requests.list.refetch();
    void utils.requests.executorSummary.invalidate();
    void utils.auth.me.invalidate();
    void utils.auth.publicProfile.invalidate();
    if (payload?.requestId && typeof payload.requestId === 'string') {
      void utils.requests.getById.refetch({ id: payload.requestId });
    } else {
      void utils.requests.getById.invalidate();
    }
    const hasChatNotif = notifTypes.includes('new_message') || !!payload?.chatId;
    if (hasChatNotif) {
      void utils.chats.invalidate();
    }
  }, [utils, applyOptimisticPatch]);

  const invalidateOnNotifTypeRef = useRef(invalidateOnNotifType);
  invalidateOnNotifTypeRef.current = invalidateOnNotifType;

  useEffect(() => {
    if (USE_BACKEND && backendQuery.data) {
      const newData = backendQuery.data as unknown as AppNotification[];
      setNotifications(newData);

      if (initialLoadDone.current && newData.length > 0) {
        const newItems = newData.filter((n) => !prevNotifIdsRef.current.has(n.id));
        if (newItems.length > 0) {
          console.log('[Notifications] New notifications detected:', newItems.map(n => n.type).join(','));
          for (const item of newItems) {
            const d = (item as unknown as { data?: Record<string, unknown> }).data;
            invalidateOnNotifType([item.type], {
              requestId: d?.requestId,
              chatId: d?.chatId,
              subType: d?.subType,
              newStatus: d?.newStatus,
            });
          }
        }
      }
      prevNotifIdsRef.current = new Set(newData.map((n) => n.id));
    } else if (!USE_BACKEND && localQuery.data) {
      setNotifications(localQuery.data);
    }
  }, [backendQuery.data, localQuery.data, invalidateOnNotifType]);

  useEffect(() => {
    void setupNotificationChannel();
    setupForegroundHandler();

    if (Platform.OS !== 'web') {
      try {
        receivedListenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
          const data = notification.request.content.data as Record<string, unknown> | undefined;
          const notifType = typeof data?.type === 'string' ? (data.type as string) : undefined;
          console.log('[Notifications] Push received in foreground, type:', notifType, 'subType:', data?.subType);
          invalidateOnNotifTypeRef.current(notifType ? [notifType] : [], {
            requestId: data?.requestId,
            chatId: data?.chatId,
            subType: data?.subType,
            newStatus: data?.newStatus,
          });
        });
      } catch (err) {
        console.log('[Notifications] Received listener error:', err);
      }

      try {
        responseListenerRef.current = Notifications.addNotificationResponseReceivedListener((response) => {
          if (__DEV__) {
            const raw = response.notification.request.content.data as Record<string, unknown> | undefined;
            console.log('[Notifications] Tap payload keys:', raw ? Object.keys(raw) : []);
          }
          const data = response.notification.request.content.data as Record<string, string> | undefined;
          if (data?.requestId) {
            router.push(`/request-details?id=${data.requestId}`);
          } else if (data?.chatId) {
            router.push(`/chat-room?chatId=${data.chatId}`);
          }
          const notifType = typeof data?.type === 'string' ? data.type : undefined;
          invalidateOnNotifTypeRef.current(notifType ? [notifType] : [], {
            requestId: data?.requestId,
            chatId: data?.chatId,
            subType: (data as Record<string, unknown>)?.subType as string | undefined,
            newStatus: (data as Record<string, unknown>)?.newStatus as string | undefined,
          });
        });
      } catch (err) {
        console.log('[Notifications] Response listener error:', err);
      }
    }

    return () => {
      if (receivedListenerRef.current) {
        try { receivedListenerRef.current.remove(); } catch {}
      }
      if (responseListenerRef.current) {
        try { responseListenerRef.current.remove(); } catch {}
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (__DEV__) console.log('[Notifications] User authenticated, requesting push permissions...');
    void registerForPushNotifications().then((token) => {
      if (token) {
        setPushToken(token);
      }
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && isAuthenticated && USE_BACKEND) {
        invalidateOnNotifTypeRef.current([]);
        void utils.chats.invalidate();
      }
    });
    return () => subscription.remove();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  useEffect(() => {
    if (notifications.length === 0 && (USE_BACKEND ? backendQuery.isLoading : localQuery.isLoading)) {
      return;
    }

    if (!initialLoadDone.current) {
      notifications.forEach(n => shownNotifIds.current.add(n.id));
      initialLoadDone.current = true;
      return;
    }
  }, [notifications, backendQuery.isLoading, localQuery.isLoading]);

  const backendMarkAsRead = trpc.notifications.markAsRead.useMutation({});

  const backendMarkAllAsRead = trpc.notifications.markAllAsRead.useMutation({});

  const backendRegisterPush = trpc.auth.registerPushToken.useMutation();
  const backendUnregisterPush = trpc.auth.unregisterPushToken.useMutation();
  const prevAuthRef = useRef<boolean>(false);

  useEffect(() => {
    if (USE_BACKEND && pushToken && isAuthenticated) {
      if (__DEV__) console.log('[Notifications] Registering push token on server, length:', pushToken.length);
      backendRegisterPush.mutate({ token: pushToken, platform: Platform.OS });
      prevAuthRef.current = true;
    } else if (USE_BACKEND && pushToken && !isAuthenticated && prevAuthRef.current) {
      console.log('[Notifications] User logged out, unregistering push token');
      backendUnregisterPush.mutate({ token: pushToken });
      prevAuthRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pushToken, isAuthenticated]);

  const localSaveMutation = useMutation({
    mutationFn: async (updated: AppNotification[]) => {
      await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications-local'] });
    },
  });

  const { mutate: localSave } = localSaveMutation;

  const addNotification = useCallback((notif: Omit<AppNotification, 'id' | 'createdAt' | 'read'>) => {
    if (USE_BACKEND) return;
    const newNotif: AppNotification = {
      ...notif,
      id: `${notif.type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
    const updated = [newNotif, ...notifications];
    setNotifications(updated);
    localSave(updated);
  }, [notifications, localSave]);

  const markAsRead = useCallback((id: string) => {
    if (USE_BACKEND) {
      backendMarkAsRead.mutate({ id });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      return;
    }
    const updated = notifications.map((n) => n.id === id ? { ...n, read: true } : n);
    setNotifications(updated);
    localSave(updated);
  }, [notifications, localSave, backendMarkAsRead]);

  const markAllAsRead = useCallback(() => {
    if (USE_BACKEND) {
      backendMarkAllAsRead.mutate();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      return;
    }
    const updated = notifications.map((n) => ({ ...n, read: true }));
    setNotifications(updated);
    localSave(updated);
  }, [notifications, localSave, backendMarkAllAsRead]);

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  useEffect(() => {
    useTabBadgesStore.getState().setNotifUnread(unreadCount);
  }, [unreadCount]);

  const hasBackendData = !!backendQuery.data;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!isAuthenticated) {
      Notifications.setBadgeCountAsync(0).catch(() => {});
      return;
    }
    if (USE_BACKEND && !hasBackendData) return;
    Notifications.setBadgeCountAsync(unreadCount).catch((err) => {
      console.log('[Notifications] Badge sync error:', err);
    });
  }, [unreadCount, isAuthenticated, hasBackendData]);

  const refetch = useCallback(async () => {
    if (USE_BACKEND) {
      void backendQuery.refetch();
    } else {
      void localQuery.refetch();
    }
  }, [backendQuery, localQuery]);

  return useMemo(() => ({
    notifications,
    unreadCount,
    pushToken,
    addNotification,
    markAsRead,
    markAllAsRead,
    refetch,
    isLoading: USE_BACKEND ? backendQuery.isLoading : localQuery.isLoading,
  }), [addNotification, markAllAsRead, markAsRead, backendQuery.isLoading, localQuery.isLoading, pushToken, unreadCount, notifications, refetch]);
});
