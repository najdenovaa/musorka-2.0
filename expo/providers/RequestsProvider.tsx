import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { RequestProposal, ServiceRequest, RequestStatus } from '@/types';
import { initialRequests } from '@/mocks/requests';
import { trpc } from '@/lib/trpc';
import { getApiBaseUrl } from '@/lib/get-api-base-url';
import { useAuth } from '@/providers/AuthProvider';
import { Alert, Platform } from 'react-native';
import { useAppStateRefetchInterval } from '@/lib/use-app-state-refetch-interval';


const STORAGE_KEY = 'home_helper_requests';
const FAVORITES_KEY = 'executor_favorite_requests';
const REQUESTS_CACHE_KEY_PREFIX = 'backend_requests_cache';
const LEGACY_REQUESTS_CACHE_KEY = 'backend_requests_cache';
const USE_BACKEND = true;

function cacheKeyFor(userId: string | null): string {
  return `${REQUESTS_CACHE_KEY_PREFIX}_${userId ?? 'anon'}`;
}

let _cachedRequests: ServiceRequest[] | null = null;
let _cachedRequestsUserId: string | null | undefined = undefined;
let _cacheLoadPromise: Promise<ServiceRequest[] | null> | null = null;

const _recentlyCompletedIds = new Set<string>();
const RECENTLY_COMPLETED_TTL = 15000;

const _localOnlyMissCount = new Map<string, number>();
const _MAX_MISS_COUNT = 10;

// Счётчик подряд пустых ответов сервера на пользователя. Нужен, чтобы не стирать
// локальный кеш по одному флаки (частый сценарий на Android при обрыве сети /
// chunked-ответе — обратно восстановить историю бывает невозможно).
const _emptyServerStreak = new Map<string, number>();
const EMPTY_STREAK_THRESHOLD = 3;

function preloadRequestsCache(userId: string | null): Promise<ServiceRequest[] | null> {
  if (_cachedRequestsUserId === userId && _cachedRequests) {
    return Promise.resolve(_cachedRequests);
  }
  if (_cacheLoadPromise && _cachedRequestsUserId === userId) return _cacheLoadPromise;
  _cachedRequestsUserId = userId;
  _cachedRequests = null;
  const key = cacheKeyFor(userId);
  _cacheLoadPromise = AsyncStorage.getItem(key).then((raw) => {
    if (raw) {
      try {
        _cachedRequests = JSON.parse(raw) as ServiceRequest[];
      } catch { _cachedRequests = null; }
    }
    _cacheLoadPromise = null;
    return _cachedRequests;
  }).catch(() => {
    _cacheLoadPromise = null;
    return null;
  });
  return _cacheLoadPromise;
}

function saveRequestsCache(userId: string | null, requests: ServiceRequest[]) {
  _cachedRequests = requests;
  _cachedRequestsUserId = userId;
  void AsyncStorage.setItem(cacheKeyFor(userId), JSON.stringify(requests)).catch(() => {});
}

function clearAllRequestsCache() {
  _cachedRequests = null;
  _cachedRequestsUserId = undefined;
  _recentlyCompletedIds.clear();
  _localOnlyMissCount.clear();
  _emptyServerStreak.clear();
  void AsyncStorage.getAllKeys().then((keys) => {
    const toRemove = keys.filter((k) => k.startsWith(REQUESTS_CACHE_KEY_PREFIX));
    if (toRemove.length > 0) {
      void AsyncStorage.multiRemove(toRemove).catch(() => {});
    }
  }).catch(() => {});
  void AsyncStorage.removeItem(LEGACY_REQUESTS_CACHE_KEY).catch(() => {});
}

interface ProposalPayload {
  executorId: string;
  executorName: string;
  price: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  conditions: string;
}

interface RatingPayload {
  executorRatingByClient?: number;
  clientRatingByExecutor?: number;
  executorReviewByClient?: string;
  clientReviewByExecutor?: string;
}

function normalizeRequest(request: ServiceRequest): ServiceRequest {
  const proposals = request.proposals ?? [];
  return {
    ...request,
    proposals,
    offerStatus: request.offerStatus ?? 'none',
  };
}

function isValidRequestRow(r: unknown): r is ServiceRequest {
  return (
    r !== null &&
    typeof r === 'object' &&
    typeof (r as { id?: unknown }).id === 'string' &&
    (r as { id: string }).id.length > 0
  );
}

/** Drops null/invalid rows, deduplicates by id, and ensures proposals/offerStatus defaults (prevents list/card crashes and tab duplicates). */
function sanitizeRequestsList(list: ServiceRequest[]): ServiceRequest[] {
  const seen = new Set<string>();
  const result: ServiceRequest[] = [];
  for (const r of list) {
    if (!isValidRequestRow(r)) continue;
    if (seen.has(r.id)) {
      if (__DEV__) console.log('[Requests] Dropping duplicate id:', r.id);
      continue;
    }
    seen.add(r.id);
    result.push(normalizeRequest(r));
  }
  return result;
}

export const [RequestsProvider, useRequests] = createContextHook(() => {
  const queryClient = useQueryClient();
  const { user, isAuthenticated, tokenReady, logout } = useAuth();
  const currentUserId = user?.id ?? null;
  const initialIsCurrentUser = _cachedRequestsUserId === currentUserId;
  const [requests, setRequests] = useState<ServiceRequest[]>(initialIsCurrentUser && _cachedRequests ? _cachedRequests : []);
  const [cacheLoadedForUserId, setCacheLoadedForUserId] = useState<string | null | undefined>(initialIsCurrentUser ? currentUserId : undefined);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    if (cacheLoadedForUserId === currentUserId) return;
    setRequests([]);
    setNextCursor(undefined);
    void preloadRequestsCache(currentUserId).then((cached) => {
      setCacheLoadedForUserId(currentUserId);
      if (cached && cached.length > 0) {
        if (__DEV__) console.log('[Requests] Loaded', cached.length, 'from cache for user', currentUserId);
        setRequests(cached.map(normalizeRequest));
      }
    });
  }, [currentUserId, cacheLoadedForUserId]);

  useEffect(() => {
    void AsyncStorage.removeItem(LEGACY_REQUESTS_CACHE_KEY).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.id) {
      void AsyncStorage.getItem(`${FAVORITES_KEY}_${user.id}`).then((stored) => {
        if (stored) {
          try {
            setFavoriteIds(JSON.parse(stored));
          } catch { /* ignore */ }
        }
      });
    }
  }, [user?.id]);

  const queryEnabled = USE_BACKEND && isAuthenticated && tokenReady;
  const publicQueryEnabled = USE_BACKEND && tokenReady && !isAuthenticated;
  // Polling: одинаковый ритм на iOS/Android, чтобы статусы заявок обновлялись быстро.
  const listPollInterval = useAppStateRefetchInterval(Platform.OS === 'android' ? 45_000 : 30_000);

  const publicQuery = trpc.requests.publicList.useQuery(undefined, {
    enabled: publicQueryEnabled,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!publicQueryEnabled) return;
    const data = publicQuery.data as any;
    if (!data) return;
    if (Array.isArray(data.items)) {
      const normalized = (data.items as ServiceRequest[]).map(normalizeRequest);
      setRequests(normalized);
      setNextCursor(data.nextCursor);
    }
  }, [publicQueryEnabled, publicQuery.data]);

  // Backend для списка использует enrichRequestsBatchLight — без вложений/фото, payload маленький,
  // поэтому 100 элементов безопасно и для Android (нет риска OOM в BlobModule).
  const listLimit = 100;
  const backendQuery = trpc.requests.list.useQuery({ limit: listLimit }, {
    enabled: queryEnabled,
    retry: (failureCount, err: any) => {
      const msg = err?.message || '';
      if (msg.includes('Слишком много запросов')) return false;
      return failureCount < 2;
    },
    retryDelay: (attempt) => Math.min(800 * (attempt + 1), 3000),
    staleTime: 5_000,
    gcTime: 600_000,
    refetchInterval: listPollInterval,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    placeholderData: (prev: any) => prev,
    structuralSharing: true,
  });

  useEffect(() => {
    if (backendQuery.error) {
      const errMsg = (backendQuery.error as any)?.message || 'Unknown error';
      const errCode = (backendQuery.error as any)?.data?.code || '';
      if (__DEV__) console.error('[Requests] Query error:', errCode, errMsg);
      if (errCode === 'UNAUTHORIZED' || errMsg.includes('авторизация')) {

        void logout();
      }
    }
  }, [backendQuery.error, logout]);



  const backendRefetchRef = useRef(backendQuery.refetch);
  backendRefetchRef.current = backendQuery.refetch;

  const localQuery = useQuery({
    queryKey: ['requests-local'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        return (JSON.parse(stored) as ServiceRequest[]).map(normalizeRequest);
      }
      const seeded = initialRequests.map(normalizeRequest);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    },
    enabled: !USE_BACKEND,
  });

  const localRefetchRef = useRef(localQuery.refetch);
  localRefetchRef.current = localQuery.refetch;

  useEffect(() => {
    if (USE_BACKEND && backendQuery.data) {
      const data = backendQuery.data as any;
      let normalized: ServiceRequest[] = [];
      if (data.items) {
        normalized = (data.items as ServiceRequest[]).map(normalizeRequest);
        setNextCursor(data.nextCursor);
      } else if (Array.isArray(data)) {
        normalized = (data as ServiceRequest[]).map(normalizeRequest);
        setNextCursor(undefined);
      }

      if (__DEV__) {
        const byStatus = normalized.reduce((acc: Record<string, number>, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {});
        console.log('[Requests] Server returned', normalized.length, 'items by status:', byStatus, 'role:', user?.role);
      }



      setRequests((prev) => {
        if (normalized.length === 0) {
          // Не очищаем кеш по одному пустому ответу: на Android это часто
          // следствие обрыва сети, а не реального отсутствия данных.
          // Требуем EMPTY_STREAK_THRESHOLD подряд пустых ответов, прежде чем стирать.
          const userKey = currentUserId ?? 'anon';
          const streak = (_emptyServerStreak.get(userKey) ?? 0) + 1;
          _emptyServerStreak.set(userKey, streak);
          if (__DEV__) console.log('[Requests] Empty server response, streak:', streak, '/', EMPTY_STREAK_THRESHOLD);

          if (prev.length > 0 && streak < EMPTY_STREAK_THRESHOLD) {
            return prev;
          }

          if (prev.length > 0) {
            const hasOnlyHistorical = prev.every((r) => r.status === 'completed' || r.status === 'cancelled');
            if (!hasOnlyHistorical) {
              const historicalOnly = prev.filter((r) => r.status === 'completed' || r.status === 'cancelled');
              if (historicalOnly.length > 0) {
                saveRequestsCache(currentUserId, historicalOnly);
                return historicalOnly;
              }
              saveRequestsCache(currentUserId, []);
              return [];
            }
            return prev;
          }
          return prev;
        }

        // Непустой ответ — сбрасываем счётчик пустых.
        _emptyServerStreak.delete(currentUserId ?? 'anon');

        const serverIds = new Set(normalized.map((r) => r.id));

        const merged = normalized.map((serverReq) => {
          if (_recentlyCompletedIds.has(serverReq.id) && serverReq.status !== 'completed') {
            const localReq = prev.find((p) => p.id === serverReq.id);
            if (localReq && localReq.status === 'completed') {

              return { ...serverReq, status: 'completed' as const, completedAt: localReq.completedAt };
            }
          }
          return serverReq;
        });

        for (const id of serverIds) {
          _localOnlyMissCount.delete(id);
        }

        const preservedLocal = prev.filter((p) => {
          if (serverIds.has(p.id)) return false;
          if (_recentlyCompletedIds.has(p.id)) return true;
          return false;
        });

        const result = [...merged, ...preservedLocal];
        saveRequestsCache(currentUserId, result);
        if (__DEV__) console.log('[Requests] Merged', result.length, 'total');
        return result;
      });
    } else if (!USE_BACKEND && localQuery.data) {
      setRequests(localQuery.data.map(normalizeRequest));
    }
  }, [backendQuery.data, localQuery.data, user?.role, user?.id, currentUserId]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore || !USE_BACKEND) return;
    setIsLoadingMore(true);
    try {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        Alert.alert('Ошибка конфигурации', 'Не настроен API_BASE_URL. Обратитесь в поддержку.');
        return;
      }
      const result = await queryClient.fetchQuery({
        queryKey: ['requests-load-more', nextCursor],
        queryFn: async () => {
          const response = await fetch(
            `${baseUrl}/api/trpc/requests.list?input=${encodeURIComponent(JSON.stringify({ json: { cursor: nextCursor } }))}`,
            {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await (await import('@/lib/trpc')).getAuthToken()}`,
              },
            }
          );
          const json = await response.json();
          return json?.result?.data?.json;
        },
        staleTime: 30000,
      });
      if (result?.items) {
        const newItems = (result.items as ServiceRequest[]).map(normalizeRequest);
        setRequests((prev) => {
          const existingIds = new Set(prev.map((r) => r.id));
          const unique = newItems.filter((r) => !existingIds.has(r.id));
          return [...prev, ...unique];
        });
        setNextCursor(result.nextCursor);
      }
    } catch (err) {
      console.error('[Requests] LoadMore error:', err);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, queryClient]);

  const localSaveMutation = useMutation({
    mutationFn: async (updated: ServiceRequest[]) => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['requests-local'] });
    },
  });



  const backendCreate = trpc.requests.create.useMutation({
    onSuccess: (data) => {
      if (data) {
        setRequests((prev) => [normalizeRequest(data as unknown as ServiceRequest), ...prev]);
      }
      void backendRefetchRef.current();
    },
    onError: (err) => {
      console.error('[Requests] Create error:', err.message);
    },
    retry: false,
    networkMode: 'online',
  });

  const backendPropose = trpc.requests.propose.useMutation({
    onSuccess: () => {
      void backendRefetchRef.current();
    },
    onError: (err) => {
      console.error('[Requests] Propose error:', err.message);
    },
    networkMode: 'online',
  });

  const backendAcceptProposal = trpc.requests.acceptProposal.useMutation({
    onSuccess: () => {
      void backendRefetchRef.current();
    },
    onError: (err) => {
      console.error('[Requests] AcceptProposal error:', err.message);
    },
    networkMode: 'online',
  });

  const backendComplete = trpc.requests.complete.useMutation({
    onSuccess: (_data, variables) => {
      console.log('[Requests] Complete mutation success for:', variables.requestId);
      _recentlyCompletedIds.add(variables.requestId);
      setTimeout(() => {
        _recentlyCompletedIds.delete(variables.requestId);
      }, RECENTLY_COMPLETED_TTL);
    },
    onError: (err) => {
      console.error('[Requests] Complete error:', err.message);
    },
    networkMode: 'online',
  });

  const backendIgnore = trpc.requests.ignore.useMutation({});

  const backendRate = trpc.requests.rate.useMutation({
    onSuccess: () => {
      console.log('[Requests] Rate mutation success');
    },
    onError: (err) => {
      console.error('[Requests] Rate error:', err.message);
    },
    networkMode: 'online',
  });

  const backendDeclineProposal = trpc.requests.declineProposal.useMutation({
    onError: (err) => {
      console.error('[Requests] DeclineProposal error:', err.message);
    },
  });

  const backendCancel = trpc.requests.cancel.useMutation({
    onSuccess: () => {
      console.log('[Requests] Cancel mutation success');
    },
  });

  const { mutate: localSave } = localSaveMutation;

  const persistRequests = useCallback((updated: ServiceRequest[]) => {
    const normalized = updated.map(normalizeRequest);
    setRequests(normalized);
    localSave(normalized);
  }, [localSave]);

  const handleAuthError = useCallback((err: any) => {
    const message = err?.message || '';
    if (message.includes('авторизация') || message.includes('UNAUTHORIZED') || err?.data?.code === 'UNAUTHORIZED') {
      console.log('[Requests] Auth error detected, prompting re-login');
      Alert.alert(
        'Сессия истекла',
        'Необходимо войти заново',
        [{ text: 'Войти', onPress: () => { void logout(); } }]
      );
      return true;
    }
    return false;
  }, [logout]);

  const addRequest = useCallback(async (request: Omit<ServiceRequest, 'id' | 'createdAt' | 'status' | 'offerStatus' | 'proposals'>): Promise<boolean> => {
    if (USE_BACKEND) {
      if (!isAuthenticated) {
        console.log('[Requests] Not authenticated, redirecting to login');
        Alert.alert('Ошибка', 'Необходимо войти в аккаунт', [
          { text: 'Войти', onPress: () => { void logout(); } },
        ]);
        return false;
      }
      try {
        let safeAttachments = request.attachments && request.attachments.length > 0 ? request.attachments : undefined;

        if (safeAttachments) {
          const totalSize = safeAttachments.reduce((sum, a) => sum + a.length, 0);
          console.log('[Requests] Attachments total size:', totalSize, 'count:', safeAttachments.length);
        }


        await backendCreate.mutateAsync({
          categoryId: request.categoryId,
          categoryName: request.categoryName,
          description: request.description || undefined,
          address: request.address || undefined,
          acceptablePrice: request.acceptablePrice || undefined,
          paymentMethod: request.paymentMethod || undefined,
          latitude: request.latitude,
          longitude: request.longitude,
          date: request.date || undefined,
          time: request.time || undefined,
          isUrgent: request.isUrgent || undefined,
          attachments: safeAttachments,
          city: request.city || user?.city || undefined,
        });

        return true;
      } catch (err: any) {
        console.error('[Requests] Failed to create request:', err?.message, JSON.stringify(err));
        if (!handleAuthError(err)) {
          const msg = err?.message || 'Не удалось создать заявку';
          const isNetwork = msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания');
          Alert.alert(
            isNetwork ? 'Проблема с сетью' : 'Ошибка',
            isNetwork ? 'Проверьте интернет-соединение и попробуйте снова.' : msg
          );
        }
        return false;
      }
    }
    const newRequest: ServiceRequest = {
      ...request,
      id: Date.now().toString(),
      status: 'new',
      createdAt: new Date().toISOString(),
      offerStatus: 'none',
      proposals: [],
    };
    persistRequests([newRequest, ...requests]);
    return true;
  }, [persistRequests, requests, backendCreate, isAuthenticated, handleAuthError, logout]);

  const updateStatus = useCallback(async (id: string, status: RequestStatus) => {
    if (USE_BACKEND) {
      if (status === 'cancelled') {
        await backendCancel.mutateAsync({ requestId: id });
      }
      return;
    }
    const updated = requests.map((r) => r.id !== id ? r : { ...r, status });
    persistRequests(updated);
  }, [persistRequests, requests, backendCancel]);

  const deleteRequest = useCallback((id: string) => {
    if (USE_BACKEND) {
      backendCancel.mutate({ requestId: id });
      return;
    }
    persistRequests(requests.filter((r) => r.id !== id));
  }, [persistRequests, requests, backendCancel]);

  const proposeConditions = useCallback(async (id: string, payload: ProposalPayload): Promise<void> => {
    if (USE_BACKEND) {
      try {
        const optimisticProposal: RequestProposal = {
          id: `${payload.executorId}_${Date.now()}`,
          ...payload,
          executorAvatar: user?.avatar ?? null,
          executorRating: user?.rating ?? null,
          executorRatingCount: user?.ratingCount ?? 0,
          executorCompletedCount: user?.completedCount ?? 0,
          createdAt: new Date().toISOString(),
          status: 'pending',
        };
        setRequests((prev) => prev.map((r) => {
          if (r.id !== id) return r;
          const list = r.proposals ?? [];
          return { ...r, proposals: [...list.filter((p) => p.executorId !== payload.executorId), optimisticProposal], offerStatus: 'pending' as const };
        }));

        await backendPropose.mutateAsync({
          requestId: id,
          price: payload.price || undefined,
          scheduledDate: payload.scheduledDate || undefined,
          scheduledTime: payload.scheduledTime || undefined,
          conditions: payload.conditions || undefined,
        });

        try {
          await Promise.all([
            backendRefetchRef.current(),
            queryClient.invalidateQueries({ queryKey: [['requests', 'getById'], { input: { id } }] }),
          ]);
        } catch (refetchErr) {
          if (__DEV__) console.log('[Requests] Propose refetch error:', refetchErr);
        }

      } catch (err: any) {
        if (__DEV__) console.error('[Requests] Propose error:', err?.message);
        setRequests((prev) => prev.map((r) => {
          if (r.id !== id) return r;
          const list = r.proposals ?? [];
          return { ...r, proposals: list.filter((p) => p.executorId !== payload.executorId) };
        }));
        throw err;
      }
      return;
    }
    const updated = requests.map((request) => {
      if (request.id !== id) return request;
      const proposal: RequestProposal = {
        id: `${payload.executorId}_${Date.now()}`,
        ...payload,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      const proposals = [
        ...request.proposals.filter((p) => p.executorId !== payload.executorId),
        proposal,
      ];
      return { ...request, proposals, offerStatus: 'pending' as const };
    });
    persistRequests(updated);
  }, [persistRequests, requests, backendPropose, queryClient, user?.avatar, user?.rating, user?.ratingCount, user?.completedCount]);

  const acceptProposal = useCallback(async (id: string, proposalId: string): Promise<void> => {
    if (USE_BACKEND) {
      try {
        setRequests((prev) => prev.map((r) => {
          if (r.id !== id) return r;
          const list = r.proposals ?? [];
          const selected = list.find((p) => p.id === proposalId);
          if (!selected) return r;
          const proposals = list.map((p) => ({
            ...p,
            status: p.id === proposalId ? 'accepted' : 'declined',
          } as RequestProposal));
          return {
            ...r,
            status: 'in_progress' as const,
            executorId: selected.executorId,
            masterName: selected.executorName,
            acceptedAt: new Date().toISOString(),
            offerStatus: 'accepted' as const,
            selectedProposalId: selected.id,
            proposals,
          };
        }));

        await backendAcceptProposal.mutateAsync({ requestId: id, proposalId });

        try {
          await Promise.all([
            backendRefetchRef.current(),
            queryClient.invalidateQueries({ queryKey: [['requests', 'getById'], { input: { id } }] }),
          ]);
        } catch (refetchErr) {
          if (__DEV__) console.log('[Requests] AcceptProposal refetch error:', refetchErr);
        }

      } catch (err: any) {
        if (__DEV__) console.error('[Requests] AcceptProposal error:', err?.message);
        void backendRefetchRef.current();
        throw err;
      }
      return;
    }
    const updated = requests.map((request) => {
      if (request.id !== id) return request;
      const selected = request.proposals.find((p) => p.id === proposalId);
      if (!selected) return request;
      const proposals = request.proposals.map((p) => ({
        ...p,
        status: p.id === proposalId ? 'accepted' : 'declined',
      } as RequestProposal));
      return {
        ...request,
        status: 'in_progress' as const,
        executorId: selected.executorId,
        masterName: selected.executorName,
        acceptedAt: new Date().toISOString(),
        offerStatus: 'accepted' as const,
        selectedProposalId: selected.id,
        proposals,
      };
    });
    persistRequests(updated);
  }, [persistRequests, requests, backendAcceptProposal, queryClient]);

  const completeRequest = useCallback(async (id: string, completionPhotos?: string[], isPaid?: boolean): Promise<void> => {
    if (USE_BACKEND) {
      try {
        _recentlyCompletedIds.add(id);
        setTimeout(() => { _recentlyCompletedIds.delete(id); }, RECENTLY_COMPLETED_TTL);

        setRequests((prev) => prev.map((r) => {
          if (r.id !== id) return r;
          return { ...r, status: 'completed' as const, completedAt: new Date().toISOString(), completionPhotos: completionPhotos ?? r.completionPhotos, isPaid: isPaid !== undefined ? isPaid : true };
        }));

        await backendComplete.mutateAsync({ requestId: id, completionPhotos, isPaid });

        try {
          await Promise.all([
            backendRefetchRef.current(),
            queryClient.invalidateQueries({ queryKey: [['requests', 'getById'], { input: { id } }] }),
          ]);
        } catch (refetchErr) {
          if (__DEV__) console.log('[Requests] Complete refetch error:', refetchErr);
        }

        saveRequestsCache(currentUserId, requestsRef.current);
      } catch (err: any) {
        if (__DEV__) console.error('[Requests] Complete error:', err?.message);
        _recentlyCompletedIds.delete(id);
        const msg = err?.message || 'Не удалось завершить заявку';
        Alert.alert('Ошибка', msg);
        void backendRefetchRef.current();
      }
      return;
    }
    const updated = requests.map((r) => {
      if (r.id !== id || r.status !== 'in_progress') return r;
      return { ...r, status: 'completed' as const, completedAt: new Date().toISOString(), completionPhotos: completionPhotos ?? r.completionPhotos };
    });
    persistRequests(updated);
  }, [persistRequests, requests, backendComplete, queryClient]);

  const requestsRef = useRef<ServiceRequest[]>(requests);
  requestsRef.current = requests;

  const rateRequestParticipants = useCallback((id: string, payload: RatingPayload) => {
    if (USE_BACKEND) {
      const request = requestsRef.current.find((r) => r.id === id);
      if (!request || !user) return;

      const isClient = user.role === 'client';
      const reviewedId = isClient ? request.executorId : request.clientId;
      const rating = isClient ? payload.executorRatingByClient : payload.clientRatingByExecutor;
      const reviewText = isClient ? payload.executorReviewByClient : payload.clientReviewByExecutor;

      setRequests((prev) => prev.map((r) => r.id !== id ? r : { ...r, ...payload }));

      if (reviewedId && rating) {
        console.log('[Requests] Submitting rating for request:', id, 'target:', reviewedId);
        backendRate.mutate({ requestId: id, reviewedId, rating, reviewText }, {
          onSuccess: () => {
            console.log('[Requests] Rating submitted successfully for request:', id);
            void queryClient.invalidateQueries({ queryKey: [['auth', 'publicProfile']] });
          },
          onError: (err) => {
            console.error('[Requests] Rating failed:', err?.message);
          },
        });
      }
      return;
    }
    const updated = requestsRef.current.map((r) => r.id !== id ? r : { ...r, ...payload });
    persistRequests(updated);
  }, [persistRequests, user, backendRate, queryClient]);

  const declineProposal = useCallback(async (requestId: string, proposalId: string): Promise<void> => {
    if (USE_BACKEND) {
      try {
        setRequests((prev) => prev.map((r) => {
          if (r.id !== requestId) return r;
          const list = r.proposals ?? [];
          const proposals = list.map((p) =>
            p.id === proposalId ? { ...p, status: 'declined' as const } : p
          );
          return { ...r, proposals };
        }));

        await backendDeclineProposal.mutateAsync({ requestId, proposalId });

      } catch (err: any) {
        if (__DEV__) console.error('[Requests] DeclineProposal error:', err?.message);
        void backendRefetchRef.current();
      }
      return;
    }
    const updated = requests.map((r) => {
      if (r.id !== requestId) return r;
      const proposals = r.proposals.map((p) =>
        p.id === proposalId ? { ...p, status: 'declined' as const } : p
      );
      return { ...r, proposals };
    });
    persistRequests(updated);
  }, [persistRequests, requests, backendDeclineProposal]);

  const ignoreRequest = useCallback((id: string, executorId: string) => {
    if (USE_BACKEND) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      backendIgnore.mutate({ requestId: id });
  
      return;
    }
    const updated = requests.filter((r) => r.id !== id);
    persistRequests(updated);
  }, [persistRequests, requests, backendIgnore]);

  const toggleFavorite = useCallback((requestId: string) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(requestId)
        ? prev.filter((id) => id !== requestId)
        : [...prev, requestId];
      if (user?.id) {
        void AsyncStorage.setItem(`${FAVORITES_KEY}_${user.id}`, JSON.stringify(next));
      }
      return next;
    });
  }, [user?.id]);

  const isFavorite = useCallback((requestId: string) => {
    return favoriteIds.includes(requestId);
  }, [favoriteIds]);

  const sanitizedRequests = useMemo(() => sanitizeRequestsList(requests), [requests]);

  const newRequests = useMemo(() => sanitizedRequests.filter((r) => r.status === 'new'), [sanitizedRequests]);
  const inProgressRequests = useMemo(() => sanitizedRequests.filter((r) => r.status === 'in_progress'), [sanitizedRequests]);
  const completedRequests = useMemo(() => sanitizedRequests.filter((r) => r.status === 'completed'), [sanitizedRequests]);

  const isLoading = USE_BACKEND
    ? (isAuthenticated
      ? (!backendQuery.isFetchedAfterMount || cacheLoadedForUserId !== currentUserId)
      : (publicQuery.isLoading && !publicQuery.data))
    : localQuery.isLoading;

  useEffect(() => {
    if (!isAuthenticated && tokenReady) {
      clearAllRequestsCache();
      setRequests([]);
      setNextCursor(undefined);
    }
  }, [isAuthenticated, tokenReady]);

  const refetch = useCallback(async () => {
    if (USE_BACKEND) {
      if (queryEnabled) {
        void backendRefetchRef.current();
        return;
      }
      if (publicQueryEnabled) {
        void publicQuery.refetch();
        return;
      }
      return;
    }
    void localRefetchRef.current();
  }, [queryEnabled, publicQueryEnabled, publicQuery]);

  const mutationLoading = useMemo(() => ({
    proposing: backendPropose.isPending,
    accepting: backendAcceptProposal.isPending,
    completing: backendComplete.isPending,
    cancelling: backendCancel.isPending,
    rating: backendRate.isPending,
    declining: backendDeclineProposal.isPending,
    ignoring: backendIgnore.isPending,
    creating: backendCreate.isPending,
  }), [
    backendPropose.isPending, backendAcceptProposal.isPending, backendComplete.isPending,
    backendCancel.isPending, backendRate.isPending, backendDeclineProposal.isPending,
    backendIgnore.isPending, backendCreate.isPending,
  ]);

  return useMemo(() => ({
    requests: sanitizedRequests,
    addRequest,
    updateStatus,
    deleteRequest,
    proposeConditions,
    acceptProposal,
    completeRequest,
    rateRequestParticipants,
    declineProposal,
    ignoreRequest,
    isLoading,
    newRequests,
    inProgressRequests,
    completedRequests,
    refetch,
    toggleFavorite,
    isFavorite,
    favoriteIds,
    mutationLoading,
    loadMore,
    isLoadingMore,
    hasMore: !!nextCursor,
  }), [
    sanitizedRequests, addRequest, updateStatus, deleteRequest, proposeConditions,
    acceptProposal, declineProposal, completeRequest, rateRequestParticipants, ignoreRequest,
    isLoading, newRequests, inProgressRequests, completedRequests, refetch,
    toggleFavorite, isFavorite, favoriteIds, mutationLoading, loadMore, isLoadingMore, nextCursor,
  ]);
});
