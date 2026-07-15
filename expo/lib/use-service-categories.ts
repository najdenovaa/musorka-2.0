import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { serviceCategories as defaultServiceCategories } from '@/mocks/services';
import type { ServiceCategory } from '@/types';

/**
 * Dynamic service catalog from the backend (admin-managed).
 * Falls back to the built-in static list while loading or on error,
 * so screens (including registration before auth) always have categories.
 */
export function useServiceCategories(): ServiceCategory[] {
  const query = trpc.services.list.useQuery(undefined, {
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
    placeholderData: (prev: ServiceCategory[] | undefined) => prev,
  });

  const data = query.data as ServiceCategory[] | undefined;

  return useMemo(() => {
    return data && data.length > 0 ? data : defaultServiceCategories;
  }, [data]);
}
