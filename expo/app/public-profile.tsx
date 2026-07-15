import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Dimensions, Animated, PanResponder, Linking, Alert, Platform } from 'react-native';
import { Image as ExpoImage } from '@/components/MImage';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import ZoomableImage from '@/components/ZoomableImage';
import * as Haptics from 'expo-haptics';
import {
  User,
  Star,
  MapPin,
  Calendar,
  Briefcase,
  Phone,
  MessageCircle,
  ShieldCheck,
  MessageSquareQuote,
  Image as ImageIcon,
  Info,
  Lock,
  X,
  ZoomIn,
  ChevronDown,
  ChevronUp,
  Ban,
  Trash2,
  Shield,
  UserCheck,
  ChevronRight,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG } from '@/constants/metallic';
import { trpc } from '@/lib/trpc';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { useQueryClient } from '@tanstack/react-query';
import MLoader from '@/components/MLoader';
import VerifiedBadge from '@/components/VerifiedBadge';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { ActivityIndicator } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface ReviewItem {
  rating: number;
  text: string | null;
  createdAt: string;
  authorName: string;
  authorAvatar: string | null;
  authorRole: string;
}

interface PortfolioItem {
  id: string;
  photoUrl: string;
  sortOrder: number;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatJoinDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export default function PublicProfileScreen() {
  const { userId, requestId, adminMode, prefetchName, prefetchAvatar, prefetchRole } = useLocalSearchParams<{ userId: string; requestId?: string; adminMode?: string; prefetchName?: string; prefetchAvatar?: string; prefetchRole?: string }>();
  const isAdminMode = adminMode === 'true';
  const router = useRouter();
  const { user: me } = useAuth();
  const trpcUtils = trpc.useUtils();
  const openDirectChatMutation = trpc.chats.getOrCreateDirectChat.useMutation({
    onSuccess: () => {
      void trpcUtils.chats.list.invalidate();
    },
  });

  const profileQuery = trpc.auth.publicProfile.useQuery(
    { userId: userId ?? '', requestId: requestId ?? undefined },
    { enabled: !!userId, staleTime: 60_000, gcTime: 120000 }
  );

  const profile = profileQuery.data as {
    id: string;
    name: string;
    avatar: string | null;
    role: string;
    city: string | null;
    about: string | null;
    statusText: string | null;
    rating: number | null;
    ratingCount: number;
    requestsCount: number;
    completedCount: number;
    isFullyVerified: boolean;
    createdAt: string;
    phone: string | null;
    canSeePhone: boolean;
    portfolio: PortfolioItem[];
    reviews: ReviewItem[];
  } | undefined;

  const { refreshControl } = useMRefreshControl(profileQuery.isRefetching, () => {
    void profileQuery.refetch();
  });

  const floatingHeaderHeight = useFloatingHeaderHeight();

  const [reviewsExpanded, setReviewsExpanded] = useState<boolean>(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState<boolean>(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number>(0);
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState<string[]>([]);

  const photoViewerPanX = useRef(new Animated.Value(0)).current;
  const photoViewerPanY = useRef(new Animated.Value(0)).current;
  const photoViewerOpacity = useRef(new Animated.Value(1)).current;
  const swipeDirection = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const photoIndexRef = useRef(0);

  useEffect(() => {
    photoIndexRef.current = photoViewerIndex;
  }, [photoViewerIndex]);

  const photoViewerPanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (e, gs) => {
      if (e.nativeEvent.touches.length >= 2) return false;
      return Math.abs(gs.dx) > 14 || Math.abs(gs.dy) > 14;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: () => { swipeDirection.current = 'none'; },
    onPanResponderMove: (e, gs) => {
      if (e.nativeEvent.touches.length >= 2) {
        return;
      }
      if (swipeDirection.current === 'none') {
        if (Math.abs(gs.dx) > 10 || Math.abs(gs.dy) > 10) {
          swipeDirection.current = Math.abs(gs.dx) > Math.abs(gs.dy) ? 'horizontal' : 'vertical';
        }
      }
      if (swipeDirection.current === 'vertical' && gs.dy > 0) {
        photoViewerPanY.setValue(gs.dy);
        photoViewerOpacity.setValue(Math.max(0.2, 1 - gs.dy / 350));
      } else if (swipeDirection.current === 'horizontal') {
        photoViewerPanX.setValue(gs.dx);
      }
    },
    onPanResponderRelease: (_, gs) => {
      const dir = swipeDirection.current;
      swipeDirection.current = 'none';
      if (dir === 'vertical' && (gs.dy > 80 || gs.vy > 0.3)) {
        Animated.parallel([
          Animated.timing(photoViewerPanY, { toValue: SCREEN_HEIGHT, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(photoViewerOpacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        ]).start(() => {
          setPhotoViewerVisible(false);
          photoViewerPanY.setValue(0);
          photoViewerPanX.setValue(0);
          photoViewerOpacity.setValue(1);
        });
        return;
      }
      if (dir === 'vertical') {
        Animated.spring(photoViewerPanY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 8 }).start();
        Animated.timing(photoViewerOpacity, { toValue: 1, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
        return;
      }
      if (dir === 'horizontal') {
        const threshold = SCREEN_WIDTH * 0.25;
        const currentIdx = photoIndexRef.current;
        if (gs.dx < -threshold || gs.vx < -0.5) {
          if (currentIdx < photoViewerPhotos.length - 1) {
            Animated.timing(photoViewerPanX, { toValue: -SCREEN_WIDTH, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => {
              setPhotoViewerIndex(currentIdx + 1);
              photoViewerPanX.setValue(0);
            });
            return;
          }
        } else if (gs.dx > threshold || gs.vx > 0.5) {
          if (currentIdx > 0) {
            Animated.timing(photoViewerPanX, { toValue: SCREEN_WIDTH, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start(() => {
              setPhotoViewerIndex(currentIdx - 1);
              photoViewerPanX.setValue(0);
            });
            return;
          }
        }
        Animated.spring(photoViewerPanX, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 8 }).start();
      }
    },
    onPanResponderTerminationRequest: () => true,
    onPanResponderTerminate: () => {
      swipeDirection.current = 'none';
      Animated.spring(photoViewerPanX, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 8 }).start();
      Animated.spring(photoViewerPanY, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 60, friction: 8 }).start();
      Animated.timing(photoViewerOpacity, { toValue: 1, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
    },
  }), [photoViewerPanX, photoViewerPanY, photoViewerOpacity, photoViewerPhotos.length]);

  const openPhotoViewer = useCallback((photos: string[], index: number) => {
    setPhotoViewerPhotos(photos);
    setPhotoViewerIndex(index);
    photoIndexRef.current = index;
    photoViewerPanX.setValue(0);
    photoViewerPanY.setValue(0);
    photoViewerOpacity.setValue(1);
    setPhotoViewerVisible(true);
  }, [photoViewerPanX, photoViewerPanY, photoViewerOpacity]);

  const handleOpenChat = useCallback(async () => {
    const peerId = profile?.id;
    if (!peerId || !me?.id || peerId === me.id) return;
    if (openDirectChatMutation.isPending) return;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const chatId = await openDirectChatMutation.mutateAsync({ peerUserId: peerId });
      router.push({ pathname: '/chat-room', params: { chatId } });
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', e?.message ?? 'Попробуйте ещё раз позже.');
    }
  }, [profile?.id, me?.id, openDirectChatMutation, router]);

  const handlePhoneCall = useCallback(() => {
    if (!profile?.phone) {
      Alert.alert('Номер недоступен', 'Номер телефона станет доступен после принятия предложения.');
      return;
    }
    let cleaned = profile.phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '+7' + cleaned.substring(1);
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Linking.openURL(`tel:${cleaned}`).catch(() => {
      Alert.alert('Ошибка', 'Не удалось открыть приложение для звонка.');
    });
  }, [profile?.phone]);

  const ratingStr = profile?.rating != null ? Number(profile.rating).toFixed(1) : '—';
  const starsCount = profile?.rating != null ? Math.round(Number(profile.rating)) : 0;

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (profile) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: Platform.OS !== 'web' }).start();
    }
  }, [profile, fadeAnim]);

  if (profileQuery.isLoading && !profile) {
    if (prefetchName) {
      return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Stack.Screen options={{ title: prefetchName }} />
          <View style={styles.headerCard}>
            <View style={styles.avatarContainer}>
              {prefetchAvatar && isSafeImageUri(prefetchAvatar) ? (
                <ExpoImage source={{ uri: prefetchAvatar }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User size={44} color={Colors.primary} />
                </View>
              )}
            </View>
            <Text style={styles.profileName}>{prefetchName}</Text>
            <View style={styles.roleRow}>
              <View style={[styles.roleBadge, prefetchRole === 'executor' ? styles.roleBadgeExecutor : styles.roleBadgeClient]}>
                <Text style={styles.roleBadgeText}>
                  {prefetchRole === 'executor' ? 'Исполнитель' : prefetchRole === 'admin' ? 'Администратор' : prefetchRole === 'support' ? 'Поддержка' : 'Клиент'}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.statsCard}>
            <View style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
              <MLoader size="small" />
              <Text style={[styles.loadingText, { marginTop: 8 }]}>Загрузка данных...</Text>
            </View>
          </View>
        </ScrollView>
      );
    }
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Профиль' }} />
        <MLoader size="large" />
        <Text style={styles.loadingText}>Загрузка профиля...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Профиль' }} />
        <Text style={styles.errorText}>Профиль не найден</Text>
      </View>
    );
  }

  const portfolioUrls = profile.portfolio.map((p) => p.photoUrl);

  return (
    <>
      <FloatingHeader showBack title={profile.name} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >

        <Animated.View style={{ opacity: fadeAnim }}>
          <View style={styles.headerCard}>
            <View style={styles.avatarContainer}>
              {profile.avatar && isSafeImageUri(profile.avatar) ? (
                <ExpoImage source={{ uri: profile.avatar }} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={120} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <User size={44} color={Colors.primary} />
                </View>
              )}
              {profile.isFullyVerified ? (
                <View style={styles.verifiedBadgeWrap}>
                  <VerifiedBadge size="medium" />
                </View>
              ) : null}
            </View>

            <Text style={styles.profileName}>{profile.name}</Text>
            {profile.statusText ? (
              <Text style={styles.statusTextPublic}>«{profile.statusText}»</Text>
            ) : null}
            <View style={styles.roleRow}>
              <View style={[styles.roleBadge, profile.role === 'executor' ? styles.roleBadgeExecutor : styles.roleBadgeClient]}>
                <Text style={styles.roleBadgeText}>
                  {profile.role === 'executor' ? 'Исполнитель' : 'Клиент'}
                </Text>
              </View>
              {profile.isFullyVerified ? (
                <View style={styles.verifiedTextBadge}>
                  <ShieldCheck size={13} color="#22C55E" />
                  <Text style={styles.verifiedText}>Авторизован</Text>
                </View>
              ) : null}
            </View>

            {profile.city ? (
              <View style={styles.cityRow}>
                <MapPin size={13} color={Colors.textMuted} />
                <Text style={styles.cityText}>{profile.city}</Text>
              </View>
            ) : null}

            {profile.createdAt ? (
              <View style={styles.cityRow}>
                <Calendar size={13} color={Colors.textMuted} />
                <Text style={styles.cityText}>На платформе с {formatJoinDate(profile.createdAt)}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.statsCard}>
            <View style={styles.statBlock}>
              <View style={styles.starsRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={15}
                    color={i < starsCount ? '#FBBF24' : 'rgba(255,255,255,0.12)'}
                    fill={i < starsCount ? '#FBBF24' : 'transparent'}
                  />
                ))}
              </View>
              <Text style={styles.statValue}>{ratingStr}</Text>
              <Text style={styles.statLabel}>
                {profile.ratingCount ? `${profile.ratingCount} оценок` : 'Нет оценок'}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Briefcase size={18} color={Colors.primary} />
              <Text style={styles.statValue}>
                {profile.role === 'executor' ? profile.completedCount : profile.requestsCount}
              </Text>
              <Text style={styles.statLabel}>
                {profile.role === 'executor' ? 'Выполнено' : 'Заказов'}
              </Text>
            </View>
          </View>

          {me?.id && profile.id !== me.id && profile.role !== 'admin' && profile.role !== 'support' ? (
            <TouchableOpacity
              style={styles.messageButton}
              onPress={handleOpenChat}
              activeOpacity={0.85}
              disabled={openDirectChatMutation.isPending}
              testID="public-profile-message"
            >
              {openDirectChatMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <MessageCircle size={20} color={Colors.primary} />
                  <Text style={styles.messageButtonText}>Написать сообщение</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {profile.canSeePhone && profile.phone ? (
            <TouchableOpacity style={styles.phoneButton} onPress={handlePhoneCall} activeOpacity={0.8} testID="public-profile-phone">
              <Phone size={20} color={Colors.white} />
              <Text style={styles.phoneButtonText}>Позвонить</Text>
            </TouchableOpacity>
          ) : !profile.canSeePhone ? (
            <View style={styles.phoneLockedCard}>
              <Lock size={16} color={Colors.textMuted} />
              <Text style={styles.phoneLockedText}>
                Номер телефона будет доступен после принятия предложения
              </Text>
            </View>
          ) : null}

          {profile.about ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Info size={16} color={Colors.primary} />
                <Text style={styles.sectionTitle}>О себе</Text>
              </View>
              <Text style={styles.aboutText}>{profile.about}</Text>
            </View>
          ) : null}

          {profile.portfolio.length > 0 ? (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <ImageIcon size={16} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Портфолио</Text>
                <Text style={styles.sectionCount}>{profile.portfolio.length} фото</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portfolioScroll}>
                {profile.portfolio.map((photo, idx) => (
                  <TouchableOpacity
                    key={photo.id}
                    activeOpacity={0.85}
                    onPress={() => openPhotoViewer(portfolioUrls, idx)}
                  >
                    {isSafeImageUri(photo.photoUrl) ? (
                      <ExpoImage source={{ uri: photo.photoUrl }} style={styles.portfolioThumb} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                    ) : (
                      <View style={styles.portfolioThumb} />
                    )}
                    <View style={styles.zoomOverlay}>
                      <ZoomIn size={14} color={Colors.white} />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {profile.reviews.length > 0 ? (
            <View style={styles.sectionCard}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setReviewsExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <MessageSquareQuote size={16} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Отзывы</Text>
                <Text style={styles.sectionCount}>{profile.reviews.length}</Text>
                {reviewsExpanded ? (
                  <ChevronUp size={18} color={Colors.textMuted} />
                ) : (
                  <ChevronDown size={18} color={Colors.textMuted} />
                )}
              </TouchableOpacity>
              {!reviewsExpanded ? (
                <TouchableOpacity
                  style={styles.reviewsCollapsedHint}
                  onPress={() => setReviewsExpanded(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reviewsCollapsedText}>
                    Нажмите, чтобы посмотреть {profile.reviews.length} {profile.reviews.length === 1 ? 'отзыв' : profile.reviews.length < 5 ? 'отзыва' : 'отзывов'}
                  </Text>
                </TouchableOpacity>
              ) : (
                profile.reviews.map((review, idx) => (
                  <View key={`review-${idx}`} style={[styles.reviewCard, idx < profile.reviews.length - 1 && styles.reviewCardBorder]}>
                    <View style={styles.reviewHeader}>
                      {review.authorAvatar && isSafeImageUri(review.authorAvatar) ? (
                        <ExpoImage source={{ uri: review.authorAvatar }} style={styles.reviewAvatar} contentFit="cover" cachePolicy="memory-disk" transition={120} />
                      ) : (
                        <View style={styles.reviewAvatarPlaceholder}>
                          <User size={14} color={Colors.textMuted} />
                        </View>
                      )}
                      <View style={styles.reviewAuthorInfo}>
                        <Text style={styles.reviewAuthorName}>{review.authorName}</Text>
                        <Text style={styles.reviewDate}>{formatDate(review.createdAt)}</Text>
                      </View>
                      <View style={styles.reviewStarsRow}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            size={12}
                            color={i < review.rating ? '#FBBF24' : 'rgba(255,255,255,0.1)'}
                            fill={i < review.rating ? '#FBBF24' : 'transparent'}
                          />
                        ))}
                      </View>
                    </View>
                    {review.text ? (
                      <Text style={styles.reviewText}>{review.text}</Text>
                    ) : null}
                  </View>
                ))
              )}
            </View>
          ) : (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <MessageSquareQuote size={16} color={Colors.textMuted} />
                <Text style={styles.sectionTitle}>Отзывы</Text>
              </View>
              <Text style={styles.emptyText}>Пока нет отзывов</Text>
            </View>
          )}

          {isAdminMode && profile ? (
            <AdminActionsPanel userId={userId ?? ''} userName={profile.name} currentRole={profile.role} onActionDone={() => profileQuery.refetch()} />
          ) : null}

          <View style={{ height: 40 }} />
        </Animated.View>
      </ScrollView>

      <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => {
        setPhotoViewerVisible(false);
        photoViewerPanY.setValue(0);
        photoViewerPanX.setValue(0);
        photoViewerOpacity.setValue(1);
      }}>
        <View style={styles.photoViewerOverlay}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.95)', opacity: photoViewerOpacity }]} />
          <TouchableOpacity
            style={styles.photoViewerClose}
            onPress={() => {
              setPhotoViewerVisible(false);
              photoViewerPanY.setValue(0);
              photoViewerPanX.setValue(0);
              photoViewerOpacity.setValue(1);
            }}
            activeOpacity={0.6}
            hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          >
            <View style={styles.photoViewerCloseInner}>
              <X size={22} color={Colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.photoViewerCounter}>
            {photoViewerPhotos.length > 0 ? `${photoViewerIndex + 1} / ${photoViewerPhotos.length}` : ''}
          </Text>
          <Animated.View
            style={[styles.photoViewerContent, { transform: [{ translateX: photoViewerPanX }, { translateY: photoViewerPanY }] }]}
            {...photoViewerPanResponder.panHandlers}
          >
            <View style={styles.photoViewerSlide}>
              {photoViewerPhotos[photoViewerIndex] ? (
                <ZoomableImage uri={photoViewerPhotos[photoViewerIndex]} style={styles.photoViewerImage} contentFit="contain" />
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

interface AdminActionsPanelProps {
  userId: string;
  userName: string;
  currentRole: string;
  onActionDone: () => void;
}

function AdminActionsPanel({ userId, userName, currentRole, onActionDone }: AdminActionsPanelProps) {
  const [roleMenuVisible, setRoleMenuVisible] = useState(false);
  const queryClient = useQueryClient();

  const invalidateAdminData = useCallback(() => {
    onActionDone();
    void queryClient.invalidateQueries({ queryKey: [['admin', 'users']] });
    void queryClient.invalidateQueries({ queryKey: [['admin', 'stats']] });
  }, [onActionDone, queryClient]);

  const blockMutation = trpc.admin.blockUser.useMutation({
    onSuccess: () => { invalidateAdminData(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('Готово', `${userName} заблокирован`); },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const unblockMutation = trpc.admin.unblockUser.useMutation({
    onSuccess: () => { invalidateAdminData(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('Готово', `${userName} разблокирован`); },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { invalidateAdminData(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); Alert.alert('Готово', 'Пользователь удалён'); },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const setRoleMutation = trpc.admin.setUserRole.useMutation({
    onSuccess: () => { invalidateAdminData(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); Alert.alert('Готово', 'Роль изменена'); setRoleMenuVisible(false); },
    onError: (err) => Alert.alert('Ошибка', err.message),
  });

  const anyPending = blockMutation.isPending || unblockMutation.isPending || deleteMutation.isPending || setRoleMutation.isPending;

  const roleOptions: { key: string; label: string; color: string; icon: React.ReactNode }[] = [
    { key: 'client', label: 'Клиент', color: Colors.info, icon: <User size={18} color={Colors.info} /> },
    { key: 'executor', label: 'Исполнитель', color: Colors.accent, icon: <Briefcase size={18} color={Colors.accent} /> },
    { key: 'support', label: 'Поддержка', color: '#34D399', icon: <ShieldCheck size={18} color="#34D399" /> },
    { key: 'admin', label: 'Администратор', color: '#A78BFA', icon: <Shield size={18} color="#A78BFA" /> },
  ];

  return (
    <View style={adminStyles.container}>
      <View style={adminStyles.header}>
        <Shield size={16} color={Colors.accent} />
        <Text style={adminStyles.headerText}>Управление пользователем</Text>
      </View>

      <TouchableOpacity
        style={[adminStyles.actionBtn, anyPending && adminStyles.actionBtnDisabled]}
        onPress={() => setRoleMenuVisible(true)}
        activeOpacity={0.7}
        disabled={anyPending}
      >
        <View style={[adminStyles.actionIcon, { backgroundColor: Colors.info + '20' }]}>
          {setRoleMutation.isPending ? <ActivityIndicator size="small" color={Colors.info} /> : <Shield size={18} color={Colors.info} />}
        </View>
        <View style={adminStyles.actionInfo}>
          <Text style={adminStyles.actionTitle}>{setRoleMutation.isPending ? 'Назначение роли...' : 'Изменить роль'}</Text>
          <Text style={adminStyles.actionSubtitle}>Текущая: {getRoleLabelAdmin(currentRole)}</Text>
        </View>
        <ChevronRight size={18} color={Colors.textMuted} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[adminStyles.actionBtn, anyPending && adminStyles.actionBtnDisabled]}
        onPress={() => {
          Alert.alert('Блокировка', `Заблокировать ${userName}?`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Заблокировать', style: 'destructive', onPress: () => blockMutation.mutate({ userId }) },
          ]);
        }}
        activeOpacity={0.7}
        disabled={anyPending}
      >
        <View style={[adminStyles.actionIcon, { backgroundColor: Colors.warning + '20' }]}>
          {blockMutation.isPending ? <ActivityIndicator size="small" color={Colors.warning} /> : <Ban size={18} color={Colors.warning} />}
        </View>
        <View style={adminStyles.actionInfo}>
          <Text style={adminStyles.actionTitle}>{blockMutation.isPending ? 'Блокировка...' : 'Заблокировать'}</Text>
          <Text style={adminStyles.actionSubtitle}>Отозвать доступ к системе</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[adminStyles.actionBtn, anyPending && adminStyles.actionBtnDisabled]}
        onPress={() => { unblockMutation.mutate({ userId }); }}
        activeOpacity={0.7}
        disabled={anyPending}
      >
        <View style={[adminStyles.actionIcon, { backgroundColor: Colors.success + '20' }]}>
          {unblockMutation.isPending ? <ActivityIndicator size="small" color={Colors.success} /> : <UserCheck size={18} color={Colors.success} />}
        </View>
        <View style={adminStyles.actionInfo}>
          <Text style={adminStyles.actionTitle}>{unblockMutation.isPending ? 'Разблокировка...' : 'Разблокировать'}</Text>
          <Text style={adminStyles.actionSubtitle}>Восстановить доступ</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[adminStyles.actionBtn, { borderColor: Colors.danger + '40' }, anyPending && adminStyles.actionBtnDisabled]}
        onPress={() => {
          Alert.alert('Удаление', `Удалить ${userName}? Это действие необратимо.`, [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Удалить', style: 'destructive', onPress: () => deleteMutation.mutate({ userId }) },
          ]);
        }}
        activeOpacity={0.7}
        disabled={anyPending}
      >
        <View style={[adminStyles.actionIcon, { backgroundColor: Colors.danger + '20' }]}>
          {deleteMutation.isPending ? <ActivityIndicator size="small" color={Colors.danger} /> : <Trash2 size={18} color={Colors.danger} />}
        </View>
        <View style={adminStyles.actionInfo}>
          <Text style={[adminStyles.actionTitle, { color: Colors.danger }]}>{deleteMutation.isPending ? 'Удаление...' : 'Удалить пользователя'}</Text>
          <Text style={adminStyles.actionSubtitle}>Безвозвратное удаление</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={roleMenuVisible} transparent animationType="fade" onRequestClose={() => setRoleMenuVisible(false)}>
        <TouchableOpacity style={adminStyles.modalOverlay} activeOpacity={1} onPress={() => setRoleMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={adminStyles.modalCard}>
            <Text style={adminStyles.modalTitle}>Выберите роль</Text>
            <Text style={adminStyles.modalSubtitle}>для {userName}</Text>
            {roleOptions.map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[adminStyles.roleOption, currentRole === opt.key && adminStyles.roleOptionActive, setRoleMutation.isPending && adminStyles.roleOptionDisabled]}
                onPress={() => {
                  if (currentRole === opt.key) return;
                  if (opt.key === 'admin') {
                    Alert.alert('⚠️ Назначение администратора', `Дать ${userName} полные права администратора?`, [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Подтвердить', style: 'destructive', onPress: () => setRoleMutation.mutate({ userId, role: opt.key as any }) },
                    ]);
                  } else {
                    setRoleMutation.mutate({ userId, role: opt.key as any });
                  }
                }}
                activeOpacity={0.7}
                disabled={setRoleMutation.isPending || currentRole === opt.key}
              >
                {opt.icon}
                <Text style={[adminStyles.roleOptionText, { color: currentRole === opt.key ? opt.color : Colors.text }]}>{opt.label}</Text>
                {currentRole === opt.key && <View style={[adminStyles.roleActiveDot, { backgroundColor: opt.color }]} />}
                {setRoleMutation.isPending && setRoleMutation.variables?.role === opt.key && <ActivityIndicator size="small" color={opt.color} />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={adminStyles.modalCancel} onPress={() => setRoleMenuVisible(false)}>
              <Text style={adminStyles.modalCancelText}>Отмена</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function getRoleLabelAdmin(role: string): string {
  const labels: Record<string, string> = { client: 'Клиент', executor: 'Исполнитель', admin: 'Администратор', support: 'Поддержка' };
  return labels[role] || role;
}

const adminStyles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 16, backgroundColor: Colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.borderLight },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  headerText: { fontSize: 16, fontWeight: '800' as const, color: Colors.text },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  actionBtnDisabled: { opacity: 0.5 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' as const, color: Colors.text },
  actionSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,10,6,0.82)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.card, borderRadius: 24, padding: 24, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: Colors.borderLight },
  modalTitle: { fontSize: 18, fontWeight: '800' as const, color: Colors.text, textAlign: 'center' as const },
  modalSubtitle: { fontSize: 13, color: Colors.textMuted, textAlign: 'center' as const, marginBottom: 20 },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 6, backgroundColor: Colors.backgroundSecondary },
  roleOptionActive: { borderWidth: 1, borderColor: Colors.primary },
  roleOptionDisabled: { opacity: 0.5 },
  roleOptionText: { fontSize: 15, fontWeight: '600' as const, flex: 1 },
  roleActiveDot: { width: 10, height: 10, borderRadius: 5 },
  modalCancel: { marginTop: 12, paddingVertical: 14, alignItems: 'center', borderRadius: 14, backgroundColor: Colors.backgroundSecondary },
  modalCancelText: { fontSize: 15, fontWeight: '600' as const, color: Colors.textMuted },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  errorText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  headerCard: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 14,
  },
  avatar: {
    width: 94,
    height: 94,
    borderRadius: 47,
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  avatarPlaceholder: {
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadgeWrap: {
    position: 'absolute',
    bottom: 0,
    right: -2,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 2,
  },
  profileName: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  statusTextPublic: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
    marginBottom: 6,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  roleBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roleBadgeExecutor: {
    backgroundColor: 'rgba(59,130,246,0.12)',
  },
  roleBadgeClient: {
    backgroundColor: 'rgba(22,163,74,0.12)',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  verifiedTextBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  verifiedText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#22C55E',
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  cityText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: Colors.borderLight,
    marginHorizontal: 12,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
  },
  phoneButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  messageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.primary,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
    minHeight: 50,
  },
  messageButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  phoneLockedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  phoneLockedText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textMuted,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.text,
    flex: 1,
  },
  sectionCount: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '600' as const,
  },
  aboutText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  portfolioScroll: {
    marginHorizontal: -4,
  },
  portfolioThumb: {
    width: 110,
    height: 110,
    borderRadius: 14,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  zoomOverlay: {
    position: 'absolute',
    bottom: 6,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
    padding: 4,
  },
  reviewCard: {
    paddingVertical: 12,
  },
  reviewCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  reviewAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reviewAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewAuthorInfo: {
    flex: 1,
  },
  reviewAuthorName: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  reviewDate: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  reviewStarsRow: {
    flexDirection: 'row',
    gap: 2,
  },
  reviewText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginLeft: 42,
  },
  reviewsCollapsedHint: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  reviewsCollapsedText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  photoViewerOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
  },
  photoViewerCloseInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerCounter: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600' as const,
    zIndex: 10,
  },
  photoViewerContent: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerSlide: {
    width: SCREEN_WIDTH,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: SCREEN_WIDTH - 32,
    height: '100%',
    borderRadius: 12,
  },
});
