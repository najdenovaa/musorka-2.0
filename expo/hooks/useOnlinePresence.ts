import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/providers/AuthProvider';

const HEARTBEAT_INTERVAL = 90_000;
const MIN_HEARTBEAT_GAP = 30_000;

export function useHeartbeat() {
  const { isAuthenticated } = useAuth();
  const heartbeatMutation = trpc.auth.heartbeat.useMutation({
    retry: false,
    onError: (err) => {
      console.log('[Heartbeat] Silent error:', err.message);
    },
  });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSentRef = useRef<number>(0);
  const mutationRef = useRef(heartbeatMutation);
  mutationRef.current = heartbeatMutation;

  useEffect(() => {
    if (!isAuthenticated) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const send = () => {
      const now = Date.now();
      if (now - lastSentRef.current < MIN_HEARTBEAT_GAP) return;
      if (mutationRef.current.isPending) return;
      lastSentRef.current = now;
      mutationRef.current.mutate(undefined, {
        onError: (err) => {
          console.log('[Heartbeat] Error:', err.message);
        },
      });
    };

    send();

    intervalRef.current = setInterval(send, HEARTBEAT_INTERVAL);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        send();
      }
    });

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      subscription.remove();
    };
  }, [isAuthenticated]);
}

export function useOnlineStatus(userIds: string[]) {
  const filteredIds = userIds.filter(Boolean);

  const query = trpc.auth.onlineStatus.useQuery(
    { userIds: filteredIds },
    {
      enabled: filteredIds.length > 0,
      refetchInterval: 30_000,
      staleTime: 15_000,
      retry: false,
    }
  );

  const onlineMap = (query.data as Record<string, boolean> | undefined) ?? {};

  return {
    isOnline: (userId: string) => !!onlineMap[userId],
    onlineMap,
  };
}
