import React, { useMemo, useState, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Plus, Inbox, History } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useRequests } from '@/providers/RequestsProvider';
import MLoader from '@/components/MLoader';
import { RequestListItem } from '@/components/requests/RequestListItem';
import { useAuth } from '@/providers/AuthProvider';
import { requireAuthOrPromptLogin } from '@/lib/require-auth';
import AnimatedActionButton from '@/components/AnimatedActionButton';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { DEFAULT_LIST_PERFORMANCE } from '@/lib/flat-list-config';
import type { ListRenderItemInfo } from 'react-native';
import type { ServiceRequest } from '@/types';

const clientTabs: { key: 'active' | 'history'; label: string }[] = [
  { key: 'active', label: 'Активные' },
  { key: 'history', label: 'История' },
];

const executorTabs: { key: 'available' | 'my' | 'favorites' | 'history'; label: string }[] = [
  { key: 'available', label: 'Доступные' },
  { key: 'favorites', label: 'Избранное' },
  { key: 'my', label: 'В работе' },
  { key: 'history', label: 'История' },
];

function normalizeTabParam(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw[0] != null) return String(raw[0]);
  return undefined;
}

export default function RequestsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string | string[] }>();
  const tabFromParams = useMemo(() => normalizeTabParam(params.tab), [params.tab]);
  const { requests, isLoading, refetch, isFavorite, toggleFavorite, favoriteIds, loadMore, isLoadingMore, hasMore } = useRequests();
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const { role, user, isAuthenticated } = useAuth();
  const [clientTab, setClientTab] = useState<'active' | 'history'>(() => {
    const t = normalizeTabParam(params.tab);
    return t === 'active' || t === 'history' ? t : 'active';
  });
  const [executorTab, setExecutorTab] = useState<'available' | 'my' | 'favorites' | 'history'>(() => {
    const t = normalizeTabParam(params.tab);
    if (t === 'available' || t === 'my' || t === 'favorites' || t === 'history') return t;
    return 'available';
  });

  const isExecutor = role === 'executor';
  const floatingHeaderHeight = useFloatingHeaderHeight();

  useEffect(() => {
    const t = tabFromParams;
    if (!t) return;
    if (isExecutor) {
      if (t === 'available' || t === 'my' || t === 'favorites' || t === 'history') {
        setExecutorTab(t);
      }
    } else if (t === 'active' || t === 'history') {
      setClientTab(t);
    }
  }, [tabFromParams, isExecutor]);
  const subscribedServiceIds = useMemo(() => user?.subscribedServiceIds ?? [], [user?.subscribedServiceIds]);

  const filteredRequests = useMemo(() => {
    if (!user) {
      return requests.filter((r) => r.status === 'new');
    }

    if (isExecutor) {
      if (executorTab === 'available') {
        return requests.filter((r) => {
          if (r.status !== 'new') return false;
          if (r.ignoredByExecutorIds?.includes(user.id)) return false;
          const hasOwnProposal = r.proposals?.some((p) => p.executorId === user.id);
          if (hasOwnProposal) return true;
          return subscribedServiceIds.includes(r.categoryId);
        });
      }
      if (executorTab === 'favorites') {
        return requests.filter((r) =>
          favoriteIds.includes(r.id) && r.status === 'new'
        );
      }
      if (executorTab === 'my') {
        return requests.filter((r) =>
          r.status === 'in_progress' &&
          r.executorId === user.id
        );
      }
      return requests.filter((r) =>
        (r.status === 'completed' || r.status === 'cancelled') &&
        r.executorId === user.id
      );
    }

    if (clientTab === 'active') {
      return requests.filter((r) =>
        r.clientId === user.id &&
        (r.status === 'new' || r.status === 'in_progress')
      );
    }
    return requests.filter((r) =>
      r.clientId === user.id &&
      (r.status === 'completed' || r.status === 'cancelled')
    );
  }, [requests, user, isExecutor, executorTab, clientTab, subscribedServiceIds, favoriteIds]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setRefreshing(false), 400);
  }, [refetch]);

  const { refreshControl: reqRefreshControl, MRefreshIndicator: reqMIndicator } = useMRefreshControl(refreshing, handleRefresh);

  const handleToggleFavorite = useCallback(
    (requestId: string) => {
      toggleFavorite(requestId);
    },
    [toggleFavorite],
  );

  const renderRequestItem = useCallback(
    ({ item }: ListRenderItemInfo<ServiceRequest>) => (
      <RequestListItem
        request={item}
        viewerRole={role}
        isExecutor={isExecutor}
        isFavorited={isFavorite(item.id)}
        onToggleFavorite={handleToggleFavorite}
      />
    ),
    [role, isExecutor, isFavorite, handleToggleFavorite],
  );

  const renderEmpty = useCallback(() => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIcon}>
        {(isExecutor ? executorTab === 'history' : clientTab === 'history') ? (
          <History size={48} color={Colors.textMuted} />
        ) : (
          <Inbox size={48} color={Colors.textMuted} />
        )}
      </View>
      <Text style={styles.emptyTitle}>
        {(isExecutor ? executorTab === 'history' : clientTab === 'history')
          ? 'История пуста'
          : 'Нет заявок'}
      </Text>
      <Text style={styles.emptyText}>
        {isExecutor
          ? executorTab === 'history'
            ? 'Выполненные заявки появятся здесь.'
            : executorTab === 'my'
              ? 'У вас пока нет заявок в работе.'
              : 'Новых заявок по вашим услугам пока нет.'
          : clientTab === 'history'
            ? 'Завершённые и отменённые заявки появятся здесь.'
            : 'Создайте первую заявку, чтобы получать предложения исполнителей.'}
      </Text>
      {(!isExecutor && clientTab === 'active') || !isAuthenticated ? (
        <AnimatedActionButton
          label="Создать заявку"
          onPress={() => {
            router.push('/create-request');
          }}
          icon={<Plus size={18} color={Colors.white} />}
          style={styles.emptyButton}
          testID="empty-create-request"
        />
      ) : null}
    </View>
  ), [router, isExecutor, executorTab, clientTab]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <MLoader size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.tabsContainer, { paddingTop: floatingHeaderHeight }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
          bounces={false}
        >
          {isExecutor ? executorTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, executorTab === tab.key && styles.tabActive]}
              onPress={() => setExecutorTab(tab.key)}
              activeOpacity={0.82}
              testID={`requests-tab-${tab.key}`}
            >
              <Text style={[styles.tabText, executorTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )) : clientTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, clientTab === tab.key && styles.tabActive]}
              onPress={() => setClientTab(tab.key)}
              activeOpacity={0.82}
              testID={`requests-tab-${tab.key}`}
            >
              <Text style={[styles.tabText, clientTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestItem}
        {...DEFAULT_LIST_PERFORMANCE}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={renderEmpty}
        refreshControl={reqRefreshControl}
        ListHeaderComponent={reqMIndicator}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.3}
        ListFooterComponent={isLoadingMore ? (
          <View style={styles.loadMoreContainer}>
            <MLoader size="small" />
          </View>
        ) : null}
      />

      {!isExecutor || !isAuthenticated ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            router.push('/create-request');
          }}
          activeOpacity={0.8}
          testID="create-request-fab"
        >
          <Plus size={24} color={Colors.white} />
        </TouchableOpacity>
      ) : null}
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
  tabsContainer: {
    backgroundColor: Colors.card,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: METALLIC_BORDER_COLOR,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  tabActive: {
    backgroundColor: Colors.primaryDark,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.white,
  },
  listContent: {
    padding: 16,
    paddingBottom: 96,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.cardSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 20,
    lineHeight: 21,
  },
  emptyButton: {
    minWidth: 200,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 88,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    elevation: 8,
    shadowColor: METALLIC_SHADOW_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  loadMoreContainer: {
    paddingVertical: 20,
    alignItems: 'center' as const,
  },
});
