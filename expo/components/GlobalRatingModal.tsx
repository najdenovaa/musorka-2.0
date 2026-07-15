import React, { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { useRequests } from '@/providers/RequestsProvider';
import RatingModal from '@/components/RatingModal';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';

const RATED_REQUESTS_KEY = 'musorka_rated_requests';
const POLL_FAST_MS = 5000;
const POLL_SLOW_MS = 15000;

export default function GlobalRatingModal() {
  const { user } = useAuth();
  const { requests, rateRequestParticipants, refetch } = useRequests();
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);
  const [visible, setVisible] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const isSubmittingRef = useRef<boolean>(false);
  const ratedSetRef = useRef<Set<string>>(new Set());
  const loadedRef = useRef<boolean>(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const needsPollRef = useRef<boolean>(false);
  const pollSpeedRef = useRef<number>(POLL_SLOW_MS);
  const skippedOnceRef = useRef<Set<string>>(new Set());
  const refetchingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!user) {
      loadedRef.current = false;
      return;
    }
    void AsyncStorage.getItem(RATED_REQUESTS_KEY).then((stored) => {
      if (stored) {
        try {
          const arr = JSON.parse(stored) as string[];
          ratedSetRef.current = new Set(arr);
        } catch { /* ignore */ }
      }
      loadedRef.current = true;
    });
  }, [user]);

  const safeRefetch = useCallback(async () => {
    if (refetchingRef.current || isSubmittingRef.current) return;
    refetchingRef.current = true;
    try {
      await refetch();
    } finally {
      refetchingRef.current = false;
    }
  }, [refetch]);

  useEffect(() => {
    if (!user) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      needsPollRef.current = false;
      return;
    }
    const isClient = user.role === 'client';

    const hasInProgress = requests.some((r) => {
      if (r.status !== 'in_progress') return false;
      if (isClient) return r.clientId === user.id;
      return r.executorId === user.id;
    });

    const hasUnrated = requests.some((r) => {
      if (r.status !== 'completed') return false;
      if (ratedSetRef.current.has(r.id)) return false;
      if (isClient && r.clientId === user.id && r.executorId && !r.executorRatingByClient) return true;
      if (!isClient && r.executorId === user.id && r.clientId && !r.clientRatingByExecutor) return true;
      return false;
    });

    const shouldPoll = hasInProgress || hasUnrated;
    const speed = hasInProgress ? POLL_FAST_MS : POLL_SLOW_MS;
    needsPollRef.current = shouldPoll;

    if (shouldPoll && (pollTimerRef.current === null || pollSpeedRef.current !== speed)) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollSpeedRef.current = speed;
      console.log('[GlobalRating] Starting polling, interval:', speed);
      pollTimerRef.current = setInterval(() => {
        if (needsPollRef.current && !isSubmittingRef.current) {
          void safeRefetch();
        }
      }, speed);
    } else if (!shouldPoll && pollTimerRef.current) {
      console.log('[GlobalRating] Stopping polling');
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [user, requests, safeRefetch]);

  useEffect(() => {
    if (!user) return;
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active' && user && !isSubmittingRef.current) {
        console.log('[GlobalRating] App became active, refetching');
        void safeRefetch();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [user, safeRefetch]);

  useEffect(() => {
    if (!user || !loadedRef.current || visible || isSubmitting || requests.length === 0) return;

    const isClient = user.role === 'client';

    for (const req of requests) {
      if (req.status !== 'completed') continue;
      if (ratedSetRef.current.has(req.id)) continue;

      if (isClient && req.clientId === user.id && req.executorId && !req.executorRatingByClient) {
        console.log('[GlobalRating] Found unrated completed request for client:', req.id);
        setPendingRequestId(req.id);
        setVisible(true);
        return;
      }

      if (!isClient && req.executorId === user.id && req.clientId && !req.clientRatingByExecutor) {
        console.log('[GlobalRating] Found unrated completed request for executor:', req.id);
        setPendingRequestId(req.id);
        setVisible(true);
        return;
      }
    }
  }, [requests, user, visible, isSubmitting]);

  const pendingRequest = React.useMemo(() => {
    if (!pendingRequestId) return null;
    return requests.find((r) => r.id === pendingRequestId) ?? null;
  }, [pendingRequestId, requests]);

  const markAsRated = useCallback((requestId: string) => {
    ratedSetRef.current.add(requestId);
    skippedOnceRef.current.delete(requestId);
    const arr = Array.from(ratedSetRef.current);
    void AsyncStorage.setItem(RATED_REQUESTS_KEY, JSON.stringify(arr.slice(-100)));
  }, []);

  const handleSubmit = useCallback((rating: number, review: string) => {
    if (!pendingRequest || !user || isSubmittingRef.current) return;
    const isClient = user.role === 'client';

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    const reqId = pendingRequest.id;

    try {
      if (isClient) {
        rateRequestParticipants(reqId, {
          executorRatingByClient: rating,
          executorReviewByClient: review || undefined,
        });
      } else {
        rateRequestParticipants(reqId, {
          clientRatingByExecutor: rating,
          clientReviewByExecutor: review || undefined,
        });
      }
    } catch (e) {
      console.error('[GlobalRating] Error submitting rating:', e);
    }

    setTimeout(() => {
      markAsRated(reqId);
      setPendingRequestId(null);
      setVisible(false);

      try {
        if (router.canGoBack()) {
          router.dismissAll();
        }
        router.replace('/(tabs)/(home)');
      } catch (e) {
        console.log('[GlobalRating] Navigation error:', e);
      }

      setTimeout(() => {
        isSubmittingRef.current = false;
        setIsSubmitting(false);
      }, 3000);
    }, 2000);
  }, [pendingRequest, user, rateRequestParticipants, markAsRated]);

  const handleClose = useCallback(() => {
    if (pendingRequestId) {
      if (skippedOnceRef.current.has(pendingRequestId)) {
        ratedSetRef.current.add(pendingRequestId);
        const arr = Array.from(ratedSetRef.current);
        void AsyncStorage.setItem(RATED_REQUESTS_KEY, JSON.stringify(arr.slice(-100)));
      } else {
        skippedOnceRef.current.add(pendingRequestId);
      }
    }
    setVisible(false);
    setPendingRequestId(null);
  }, [pendingRequestId]);

  const isClient = user?.role === 'client';

  const ratingTitle = React.useMemo(() => {
    if (!pendingRequest) return isClient ? 'Оценить исполнителя' : 'Оценить клиента';
    if (isClient) {
      const name = pendingRequest.masterName || 'Исполнитель';
      return `Оценить ${name}`;
    }
    const name = pendingRequest.clientName || 'Клиент';
    return `Оценить ${name}`;
  }, [pendingRequest, isClient]);

  const ratingSubtitle = React.useMemo(() => {
    if (!pendingRequest) return isClient ? 'Заявка выполнена! Поставьте оценку' : 'Заявка выполнена! Оцените клиента';
    const service = pendingRequest.categoryName || '';
    if (isClient) {
      const name = pendingRequest.masterName || 'исполнителя';
      return `Услуга: ${service}\nИсполнитель: ${name}`;
    }
    const name = pendingRequest.clientName || 'клиента';
    return `Услуга: ${service}\nКлиент: ${name}`;
  }, [pendingRequest, isClient]);

  const personAvatar = React.useMemo(() => {
    if (!pendingRequest) return null;
    if (isClient) {
      const acceptedProposal = pendingRequest.proposals.find((p) => p.status === 'accepted');
      return acceptedProposal?.executorAvatar ?? null;
    }
    return pendingRequest.clientAvatar ?? null;
  }, [pendingRequest, isClient]);

  const personName = React.useMemo(() => {
    if (!pendingRequest) return undefined;
    if (isClient) {
      return pendingRequest.masterName || pendingRequest.proposals.find((p) => p.status === 'accepted')?.executorName || 'Исполнитель';
    }
    return pendingRequest.clientName || 'Клиент';
  }, [pendingRequest, isClient]);

  const personRating = React.useMemo(() => {
    if (!pendingRequest) return null;
    if (isClient) {
      const acceptedProposal = pendingRequest.proposals.find((p) => p.status === 'accepted');
      return acceptedProposal?.executorRating ?? null;
    }
    return pendingRequest.clientRating ?? null;
  }, [pendingRequest, isClient]);

  const serviceName = pendingRequest?.categoryName ?? undefined;

  if (!user) return null;

  return (
    <RatingModal
      visible={visible}
      onClose={handleClose}
      onSubmit={handleSubmit}
      title={ratingTitle}
      subtitle={ratingSubtitle}
      personAvatar={personAvatar}
      personName={personName}
      personRating={personRating}
      serviceName={serviceName}
      isSubmitting={isSubmitting}
    />
  );
}
