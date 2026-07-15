import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  Animated,
  Platform,
  ActivityIndicator,
  ScrollView,
  type ListRenderItemInfo,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Heart, Star, AlertCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Image as ExpoImage } from '@/components/MImage';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import { useTabSwipeStore } from '@/lib/stores/tab-swipe';
import { LIVE_ENABLED } from '@/lib/feature-flags';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/providers/AuthProvider';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CAROUSEL_HEIGHT = Math.round(SCREEN_WIDTH * 0.8);
const FOOTER_HEIGHT = 96;
const ITEM_HEIGHT = CAROUSEL_HEIGHT + FOOTER_HEIGHT + 24;

interface LiveExecutor {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number;
  completedCount: number;
}

interface LiveItem {
  id: string;
  serviceType: string;
  city: string | null;
  createdAt: string;
  completedAt: string | null;
  beforePhotos: string[];
  afterPhotos: string[];
  executor: LiveExecutor | null;
  likesCount: number;
  likedByMe: boolean;
}

interface CarouselSlide {
  uri: string;
  kind: 'before' | 'after';
}

interface CardProps {
  item: LiveItem;
  onLike: (id: string) => void;
  onOpenExecutor: (executor: LiveExecutor) => void;
}

const HorizontalCarousel = React.memo(function HorizontalCarousel({
  slides,
}: {
  slides: CarouselSlide[];
}) {
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / SCREEN_WIDTH);
    if (idx !== activeIdx) setActiveIdx(idx);
  }, [activeIdx]);

  const renderSlide = useCallback(({ item }: ListRenderItemInfo<CarouselSlide>) => (
    <View style={styles.slide}>
      <ExpoImage
        source={{ uri: item.uri }}
        style={styles.slideImage}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
    </View>
  ), []);

  const keyExtractor = useCallback((s: CarouselSlide, i: number) => `${s.kind}-${i}-${s.uri}`, []);

  const current = slides[activeIdx];

  return (
    <View style={styles.carouselWrap}>
      <FlatList
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        renderItem={renderSlide}
        keyExtractor={keyExtractor}
        onScroll={onScroll}
        scrollEventThrottle={16}
        snapToInterval={SCREEN_WIDTH}
        decelerationRate="fast"
        disableIntervalMomentum
        directionalLockEnabled
      />
      {current ? (
        <View
          style={[
            styles.kindBadge,
            current.kind === 'before' ? styles.kindBadgeBefore : styles.kindBadgeAfter,
          ]}
        >
          <Text style={styles.kindBadgeText}>
            {current.kind === 'before' ? 'До' : 'После'}
          </Text>
        </View>
      ) : null}
      {slides.length > 1 ? (
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={`d-${i}`} style={[styles.dot, i === activeIdx && styles.dotActive]} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const LiveCard = React.memo(function LiveCard({ item, onLike, onOpenExecutor }: CardProps) {
  const slides = useMemo<CarouselSlide[]>(() => [
    ...item.beforePhotos.map<CarouselSlide>((u) => ({ uri: u, kind: 'before' })),
    ...item.afterPhotos.map<CarouselSlide>((u) => ({ uri: u, kind: 'after' })),
  ], [item.beforePhotos, item.afterPhotos]);

  const heartScale = useRef(new Animated.Value(1)).current;

  const handleLike = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    Animated.sequence([
      Animated.timing(heartScale, { toValue: 1.25, duration: 120, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(heartScale, { toValue: 1, friction: 4, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
    onLike(item.id);
  }, [heartScale, item.id, onLike]);

  const handleOpenExecutor = useCallback(() => {
    if (item.executor) onOpenExecutor(item.executor);
  }, [item.executor, onOpenExecutor]);

  return (
    <View style={styles.card}>
      <HorizontalCarousel slides={slides} />
      <View style={styles.footer}>
        <View style={styles.footerTopRow}>
          <Text style={styles.serviceTitle} numberOfLines={1}>{item.serviceType}</Text>
          <TouchableOpacity onPress={handleLike} activeOpacity={0.7} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Animated.View style={[styles.heartBtn, { transform: [{ scale: heartScale }] }]}>
              <Heart
                size={22}
                color={item.likedByMe ? '#EF4444' : Colors.textMuted}
                fill={item.likedByMe ? '#EF4444' : 'transparent'}
                strokeWidth={2.2}
              />
              <Text style={[styles.likeCount, item.likedByMe && styles.likeCountActive]}>{item.likesCount}</Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
        {item.executor ? (
          <TouchableOpacity activeOpacity={0.7} onPress={handleOpenExecutor} style={styles.executorRow}>
            {item.executor.avatarUrl && isSafeImageUri(item.executor.avatarUrl) ? (
              <ExpoImage
                source={{ uri: item.executor.avatarUrl }}
                style={styles.executorAvatar}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={120}
              />
            ) : (
              <View style={[styles.executorAvatar, styles.executorAvatarFallback]}>
                <Text style={styles.executorAvatarText}>
                  {item.executor.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.executorName} numberOfLines={1}>{item.executor.name}</Text>
              <View style={styles.executorMeta}>
                <Star size={12} color="#F5C451" fill="#F5C451" />
                <Text style={styles.executorMetaText}>
                  {item.executor.rating.toFixed(1)} · {item.executor.completedCount} вып.
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

export default function LiveScreen() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const role = user?.role ?? null;
  const isAllowedRole = role === 'client' || role === 'executor';
  const enabled = LIVE_ENABLED && isAllowedRole;
  const headerHeight = useFloatingHeaderHeight();

  useEffect(() => {
    if (__DEV__) {
      console.log('[Live] mount: LIVE_ENABLED=', LIVE_ENABLED,
        'role=', role, 'authLoading=', authLoading, 'enabled=', enabled);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // \u041d\u0430 \u0444\u043e\u043a\u0443\u0441\u0435 \u044d\u043a\u0440\u0430\u043d\u0430 \u0431\u043b\u043e\u043a\u0438\u0440\u0443\u0435\u043c \u0441\u0432\u0430\u0439\u043f \u043c\u0435\u0436\u0434\u0443 \u0432\u043a\u043b\u0430\u0434\u043a\u0430\u043c\u0438
  useFocusEffect(
    useCallback(() => {
      useTabSwipeStore.getState().setDisabled(true);
      return () => {
        useTabSwipeStore.getState().setDisabled(false);
      };
    }, [])
  );

  const query = trpc.live.feed.useInfiniteQuery(
    { limit: 20 },
    {
      enabled,
      getNextPageParam: (lastPage: { items: LiveItem[]; nextCursor: string | null }) =>
        lastPage.nextCursor ?? undefined,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    } as any
  );

  const toggleLikeMutation = trpc.live.toggleLike.useMutation();

  const items = useMemo<LiveItem[]>(() => {
    const pages = (query.data?.pages ?? []) as { items: LiveItem[] }[];
    return pages.flatMap((p) => p.items);
  }, [query.data]);

  const utils = trpc.useUtils();

  const onLike = useCallback((id: string) => {
    const queryKey = utils.live.feed.getInfiniteData({ limit: 20 });
    void queryKey;
    utils.live.feed.setInfiniteData({ limit: 20 }, (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((page: any) => ({
          ...page,
          items: page.items.map((it: LiveItem) =>
            it.id === id
              ? { ...it, likedByMe: !it.likedByMe, likesCount: it.likesCount + (it.likedByMe ? -1 : 1) }
              : it
          ),
        })),
      };
    });
    toggleLikeMutation.mutate(
      { requestId: id },
      {
        onError: () => {
          utils.live.feed.setInfiniteData({ limit: 20 }, (prev: any) => {
            if (!prev) return prev;
            return {
              ...prev,
              pages: prev.pages.map((page: any) => ({
                ...page,
                items: page.items.map((it: LiveItem) =>
                  it.id === id
                    ? { ...it, likedByMe: !it.likedByMe, likesCount: it.likesCount + (it.likedByMe ? -1 : 1) }
                    : it
                ),
              })),
            };
          });
        },
      }
    );
  }, [utils, toggleLikeMutation]);

  const onOpenExecutor = useCallback((executor: LiveExecutor) => {
    router.push({
      pathname: '/public-profile',
      params: {
        userId: executor.id,
        prefetchName: executor.name,
        prefetchAvatar: executor.avatarUrl ?? '',
        prefetchRole: 'executor',
      },
    });
  }, [router]);

  // Prefetch \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0435\u0439 \u043a\u0430\u0440\u0442\u043e\u0447\u043a\u0438
  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (Platform.OS === 'web') return;
    try {
      const last = viewableItems[viewableItems.length - 1];
      if (!last) return;
      const idx = last.index ?? 0;
      const next = items[idx + 1];
      if (!next) return;
      const firstUri = next.beforePhotos[0] ?? next.afterPhotos[0];
      if (!firstUri || !isSafeImageUri(firstUri)) return;
      // expo-image has Image.prefetch; access via require to avoid web bundle issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const expoImg = require('expo-image');
      if (expoImg?.Image?.prefetch) expoImg.Image.prefetch([firstUri]);
    } catch {}
  }).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 60 }).current;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<LiveItem>) => (
      <LiveCard item={item} onLike={onLike} onOpenExecutor={onOpenExecutor} />
    ),
    [onLike, onOpenExecutor]
  );

  const keyExtractor = useCallback((it: LiveItem) => it.id, []);
  const getItemLayout = useCallback(
    (_data: ArrayLike<LiveItem> | null | undefined, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const onEndReached = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage();
    }
  }, [query]);

  const { refreshControl, MRefreshIndicator } = useMRefreshControl(
    query.isRefetching && !query.isFetchingNextPage,
    () => { void query.refetch(); }
  );

  if (authLoading || (LIVE_ENABLED && role === null)) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!LIVE_ENABLED) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyTitle}>Лента временно отключена</Text>
      </View>
    );
  }

  if (!isAllowedRole) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <Text style={styles.emptyTitle}>Лента доступна только клиентам и исполнителям</Text>
      </View>
    );
  }

  if (query.isError) {
    return (
      <ScrollView
        contentContainerStyle={[styles.center, { paddingTop: headerHeight + 40 }]}
        refreshControl={refreshControl}
      >
        {MRefreshIndicator}
        <AlertCircle size={32} color="#EF4444" />
        <Text style={styles.emptyTitle}>Не удалось загрузить ленту</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => { void query.refetch(); }}>
          <Text style={styles.retryBtnText}>Повторить</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (query.isLoading && items.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: headerHeight }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <ScrollView
        contentContainerStyle={[styles.center, { paddingTop: headerHeight + 40 }]}
        refreshControl={refreshControl}
      >
        {MRefreshIndicator}
        <Text style={styles.emptyTitle}>Пока пусто</Text>
        <Text style={styles.emptyHint}>
          Заявки ленты появятся, когда в вашем городе будут свежие «До/После».
        </Text>
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        windowSize={5}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        removeClippedSubviews={Platform.OS === 'android'}
        contentContainerStyle={{ paddingTop: headerHeight + 8, paddingBottom: 120 }}
        onEndReachedThreshold={0.5}
        onEndReached={onEndReached}
        refreshControl={refreshControl}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : null
        }
        ListHeaderComponent={MRefreshIndicator}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.primary,
  },
  retryBtnText: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
  card: {
    marginBottom: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  carouselWrap: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
    backgroundColor: '#0A1A12',
    position: 'relative' as const,
  },
  slide: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  slideImage: {
    width: SCREEN_WIDTH,
    height: CAROUSEL_HEIGHT,
  },
  kindBadge: {
    position: 'absolute' as const,
    top: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  kindBadgeBefore: {
    backgroundColor: 'rgba(8,26,16,0.7)',
  },
  kindBadgeAfter: {
    backgroundColor: 'rgba(110,231,163,0.25)',
  },
  kindBadgeText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  dots: {
    position: 'absolute' as const,
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  dotActive: {
    backgroundColor: '#6EE7A3',
    width: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: FOOTER_HEIGHT,
    gap: 10,
  },
  footerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  serviceTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  heartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  likeCount: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    minWidth: 16,
  },
  likeCountActive: {
    color: '#EF4444',
  },
  executorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  executorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  executorAvatarFallback: {
    backgroundColor: 'rgba(110,231,163,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  executorAvatarText: {
    color: '#6EE7A3',
    fontWeight: '700' as const,
  },
  executorName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  executorMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  executorMetaText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
