import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Image } from '@/components/MImage';
import { useRouter } from 'expo-router';
import {
  Plus, ArrowRight, MapPin, ChevronDown, ChevronUp,
  BellRing, CheckCircle, XCircle, Clock, TrendingUp,
  Bookmark, Wallet, User, FileText, X, Calendar,
  Zap, Activity, Star, Sparkles,
  ChevronRight, AlertCircle,
} from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useServiceCategories } from '@/lib/use-service-categories';
import type { ServiceCategory } from '@/types';
import { useRequests } from '@/providers/RequestsProvider';
import { useAuth } from '@/providers/AuthProvider';
import { requireAuthOrPromptLogin } from '@/lib/require-auth';
import ServiceIcon from '@/components/ServiceIcon';
import MLoader from '@/components/MLoader';
import * as Haptics from 'expo-haptics';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useWeather, getWeatherAdjective, getWeatherTip } from '@/lib/weather';
import { numericNoSuggestProps, plainFieldProps } from '@/lib/text-input-autofill';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getGreeting(isExecutor: boolean): { text: string; sub: string; period: 'morning' | 'day' | 'evening' | 'night' } {
  const hour = new Date().getHours();
  const roleSub = isExecutor
    ? 'Самое время поработать!'
    : 'Самое время воспользоваться услугами!';
  if (hour >= 5 && hour < 12) return { text: 'Доброе утро', sub: roleSub, period: 'morning' };
  if (hour >= 12 && hour < 17) return { text: 'Добрый день', sub: roleSub, period: 'day' };
  if (hour >= 17 && hour < 22) return { text: 'Добрый вечер', sub: roleSub, period: 'evening' };
  return { text: 'Доброй ночи', sub: roleSub, period: 'night' };
}

function PulsingGlow({ color, size, top, left, delay }: { color: string; size: number; top: number; left: number; delay: number }) {
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0.15)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.3, duration: 3500, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.4, duration: 3500, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.8, duration: 3500, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(opacity, { toValue: 0.15, duration: 3500, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale, opacity, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top,
        left,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

function AnimatedNumber({ value, color }: { value: number; color: string }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 7, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [scaleAnim, value]);

  return (
    <Animated.Text style={[styles.statNumber, { color, transform: [{ scale: scaleAnim }] }]}>
      {value}
    </Animated.Text>
  );
}

function StatCard({
  value, label, icon, gradientColors, onPress, index, isLive,
}: {
  value: number;
  label: string;
  icon: React.ReactNode;
  gradientColors: [string, string];
  onPress: () => void;
  index: number;
  isLive?: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(40)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const livePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 9, delay: index * 120, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 500, delay: index * 120, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [slideAnim, opacityAnim, index]);

  useEffect(() => {
    if (isLive && value > 0) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(livePulse, { toValue: 1, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(livePulse, { toValue: 0, duration: 1500, useNativeDriver: Platform.OS !== 'web' }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [livePulse, isLive, value]);

  const liveOpacity = livePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      onPressIn={() => Animated.spring(pressScale, { toValue: 0.92, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      onPressOut={() => Animated.spring(pressScale, { toValue: 1, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      style={styles.statCardTouch}
    >
      <Animated.View style={[
        styles.statCard,
        { opacity: opacityAnim, transform: [{ translateY: slideAnim }, { scale: pressScale }] },
      ]}>
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.statGradientBar}
        />
        <View style={styles.statCardInner}>
          <View style={styles.statIconRow}>
            {icon}
            {isLive && value > 0 ? (
              <Animated.View style={[styles.liveDot, { opacity: liveOpacity, backgroundColor: gradientColors[1] }]} />
            ) : null}
          </View>
          <AnimatedNumber value={value} color={gradientColors[1]} />
          <Text style={styles.statLabel}>{label}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function QuickServiceItem({ cat, index, onPress }: { cat: ServiceCategory; index: number; onPress: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, delay: index * 50 + 100, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [scaleAnim, index]);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      onPressIn={() => Animated.spring(pressScale, { toValue: 0.88, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      onPressOut={() => Animated.spring(pressScale, { toValue: 1, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      style={styles.quickServiceTouch}
    >
      <Animated.View style={[styles.quickServiceItem, { transform: [{ scale: Animated.multiply(scaleAnim, pressScale) }] }]}>
        <View style={[styles.quickServiceIcon, { backgroundColor: cat.bgColor + '20' }]}>
          <View style={[styles.quickServiceIconInner, { backgroundColor: cat.bgColor }]}>
            <ServiceIcon name={cat.icon} size={22} color={cat.color} />
          </View>
        </View>
        <Text style={styles.quickServiceName} numberOfLines={2}>{cat.name}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function ExecutorRequestCard({
  req, index, onPress, onAccept, onConditions, onBookmark, onIgnore, isFav,
}: {
  req: any;
  index: number;
  onPress: () => void;
  onAccept: () => void;
  onConditions: () => void;
  onBookmark: () => void;
  onIgnore: () => void;
  isFav: boolean;
}) {
  const slideAnim = useRef(new Animated.Value(60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const serviceCategories = useServiceCategories();

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, tension: 40, friction: 9, delay: index * 100, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 450, delay: index * 100, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [slideAnim, opacityAnim, index]);

  const cat = serviceCategories.find((c) => c.id === req.categoryId);
  const payLabel = req.paymentMethod === 'cash' ? 'Наличные' : req.paymentMethod === 'transfer' ? 'Перевод' : req.paymentMethod === 'online' ? 'Онлайн' : '';

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={() => Animated.spring(pressScale, { toValue: 0.97, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      onPressOut={() => Animated.spring(pressScale, { toValue: 1, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
    >
      <Animated.View style={[
        styles.execCard,
        { opacity: opacityAnim, transform: [{ translateY: slideAnim }, { scale: pressScale }] },
      ]}>
        <LinearGradient
          colors={['rgba(56,189,248,0.08)', 'rgba(56,189,248,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <View style={styles.execCardHeader}>
          <View style={[styles.execCardIconWrap, { backgroundColor: cat?.bgColor ?? Colors.primaryLight }]}>
            <ServiceIcon name={cat?.icon ?? 'Wrench'} size={22} color={cat?.color ?? Colors.primary} />
          </View>
          <View style={styles.execCardHeaderText}>
            <Text style={styles.execCardTitle} numberOfLines={1}>{req.categoryName}</Text>
            <View style={styles.execCardPriceRow}>
              {req.acceptablePrice ? (
                <View style={styles.execPriceBadge}>
                  <Text style={styles.execPriceText}>{req.acceptablePrice}</Text>
                </View>
              ) : null}
              {payLabel ? (
                <View style={styles.execPayBadge}>
                  <Wallet size={11} color={Colors.accent} />
                  <Text style={styles.execPayText}>{payLabel}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <TouchableOpacity
            style={[styles.execBookmarkBtn, isFav && styles.execBookmarkBtnActive]}
            onPress={(e) => { e.stopPropagation(); onBookmark(); }}
            activeOpacity={0.7}
            testID={`bookmark-${req.id}`}
          >
            <Bookmark size={15} color={isFav ? Colors.accent : Colors.textMuted} fill={isFav ? Colors.accent : 'transparent'} />
          </TouchableOpacity>
        </View>

        <View style={styles.execCardMeta}>
          <View style={styles.execMetaChip}>
            <MapPin size={12} color={Colors.info} />
            <Text style={styles.execMetaText} numberOfLines={1}>{req.address}</Text>
          </View>
          <View style={styles.execMetaChip}>
            <Clock size={12} color={Colors.accent} />
            <Text style={styles.execMetaText}>{req.date}, {req.time}</Text>
          </View>
        </View>

        {req.description ? (
          <View style={styles.execComment}>
            <Text style={styles.execCommentText} numberOfLines={2}>{req.description}</Text>
          </View>
        ) : null}

        {req.clientName ? (
          <View style={styles.execClientChip}>
            {req.clientAvatar ? (
              <Image source={{ uri: req.clientAvatar }} style={styles.execClientAvatar} />
            ) : (
              <View style={styles.execClientAvatarPlaceholder}>
                <User size={11} color={Colors.textSecondary} />
              </View>
            )}
            <Text style={styles.execClientName} numberOfLines={1}>{req.clientName}</Text>
            {req.clientRating ? (
              <View style={styles.execClientRatingBadge}>
                <Star size={10} color={Colors.accent} fill={Colors.accent} />
                <Text style={styles.execClientRatingText}>{req.clientRating.toFixed(1)}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.execActions}>
          <TouchableOpacity
            style={styles.execAcceptBtn}
            onPress={(e) => { e.stopPropagation(); onAccept(); }}
            activeOpacity={0.8}
            testID={`accept-home-${req.id}`}
          >
            <LinearGradient
              colors={['#16A34A', '#22C55E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.execAcceptGradient}
            >
              <CheckCircle size={15} color={Colors.white} />
              <Text style={styles.execAcceptText}>Принять</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.execCondBtn}
            onPress={(e) => { e.stopPropagation(); onConditions(); }}
            activeOpacity={0.8}
            testID={`conditions-home-${req.id}`}
          >
            <Text style={styles.execCondText}>Условия</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.execIgnoreBtn}
            onPress={(e) => { e.stopPropagation(); onIgnore(); }}
            activeOpacity={0.7}
            testID={`ignore-${req.id}`}
          >
            <XCircle size={15} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
}

function SectionHeader({ icon, iconBg, title, subtitle, rightElement }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  rightElement?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderLeft}>
        <View style={[styles.sectionIconWrap, { backgroundColor: iconBg }]}>
          {icon}
        </View>
        <View style={styles.sectionHeaderTextWrap}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.sectionSubtitle}>{subtitle}</Text>
        </View>
      </View>
      {rightElement}
    </View>
  );
}

function ActiveRequestMini({ req, onPress }: { req: any; onPress: () => void }) {
  const serviceCategories = useServiceCategories();
  const cat = serviceCategories.find((c) => c.id === req.categoryId);
  const pressScale = useRef(new Animated.Value(1)).current;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      onPressIn={() => Animated.spring(pressScale, { toValue: 0.96, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
      onPressOut={() => Animated.spring(pressScale, { toValue: 1, tension: 300, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start()}
    >
      <Animated.View style={[styles.activeMiniCard, { transform: [{ scale: pressScale }] }]}>
        <View style={styles.activeMiniLeft}>
          <View style={[styles.activeMiniIcon, { backgroundColor: cat?.bgColor ?? Colors.primaryLight }]}>
            <ServiceIcon name={cat?.icon ?? 'Wrench'} size={18} color={cat?.color ?? Colors.primary} />
          </View>
          <View style={styles.activeMiniInfo}>
            <Text style={styles.activeMiniTitle} numberOfLines={1}>{req.categoryName}</Text>
            <View style={styles.activeMiniMeta}>
              {req.status === 'in_progress' ? (
                <View style={styles.activeMiniStatusDot} />
              ) : null}
              <Text style={styles.activeMiniStatus}>
                {req.status === 'in_progress' ? 'В работе' : req.status === 'new' ? `${req.proposals?.length ?? 0} откл.` : req.status}
              </Text>
              {req.acceptablePrice ? (
                <Text style={styles.activeMiniPrice}>{req.acceptablePrice}</Text>
              ) : null}
            </View>
          </View>
        </View>
        <ChevronRight size={16} color={Colors.textMuted} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { requests, proposeConditions, ignoreRequest, refetch, toggleFavorite, isFavorite } = useRequests();
  const { role, user, isAuthenticated } = useAuth();
  const [servicesExpanded, setServicesExpanded] = useState<boolean>(false);
  const [quickOrderExpanded, setQuickOrderExpanded] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);
  const [conditionsRequestId, setConditionsRequestId] = useState<string | null>(null);
  const [conditionsPrice, setConditionsPrice] = useState<string>('');
  const [conditionsText, setConditionsText] = useState<string>('');
  const [conditionsProposing, setConditionsProposing] = useState<boolean>(false);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [warningAcknowledged, setWarningAcknowledged] = useState<boolean>(false);
  const [pendingWarningRequestId, setPendingWarningRequestId] = useState<string | null>(null);
  const [pendingWarningAction, setPendingWarningAction] = useState<'accept' | 'conditions' | null>(null);

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(30)).current;
  const heroScale = useRef(new Animated.Value(0.95)).current;
  const heroOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.parallel([
        Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(slideUp, { toValue: 0, tension: 50, friction: 10, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(heroScale, { toValue: 1, tension: 50, friction: 9, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();
  }, [fadeIn, slideUp, heroOpacity, heroScale]);

  const isExecutor = role === 'executor';
  const serviceCategories = useServiceCategories();
  const subscribedServiceIds = useMemo(() => user?.subscribedServiceIds ?? [], [user?.subscribedServiceIds]);
  const greeting = useMemo(() => getGreeting(isExecutor), [isExecutor]);

  const userCity = useMemo(() => user?.city ?? '', [user?.city]);
  const userAddress = useMemo(() => {
    if (user?.addresses && user.addresses.length > 0) return user.addresses[0].address;
    return '';
  }, [user?.addresses]);
  const weather = useWeather(userCity, userAddress);

  const myRequests = useMemo(() => {
    if (!user) return [];
    if (isExecutor) {
      return requests.filter((r) =>
        r.executorId === user.id ||
        r.proposals.some((p) => p.executorId === user.id)
      );
    }
    const filtered = requests.filter((r) => r.clientId === user.id);
    if (requests.length > 0 && filtered.length === 0) {
      console.log('[HomeScreen] No requests matched clientId filter. userId:', user.id, 'total requests:', requests.length, 'sample clientIds:', requests.slice(0, 3).map((r) => r.clientId));
    }
    return filtered;
  }, [requests, user, isExecutor]);

  const myActiveRequests = useMemo(() =>
    myRequests.filter((r) => r.status === 'new' || r.status === 'in_progress').slice(0, 5),
    [myRequests]
  );

  const availableRequests = useMemo(() => {
    if (!isExecutor || !user) return [];
    return requests.filter((r) => {
      if (r.status !== 'new') return false;
      if (!subscribedServiceIds.includes(r.categoryId)) return false;
      if (r.proposals.some((p) => p.executorId === user.id)) return false;
      if (r.ignoredByExecutorIds?.includes(user.id)) return false;
      return true;
    });
  }, [isExecutor, requests, subscribedServiceIds, user]);

  const topServices = useMemo(() => {
    if (servicesExpanded) return serviceCategories;
    return serviceCategories.slice(0, 8);
  }, [servicesExpanded, serviceCategories]);

  const handleSwipeAccept = useCallback(async (requestId: string) => {
    if (!requireAuthOrPromptLogin(isAuthenticated, 'принять заявку')) return;
    if (!user) return;
    const req = requests.find((r) => r.id === requestId);
    if (!req) return;
    setAcceptingRequestId(requestId);
    try {
      await proposeConditions(requestId, {
        executorId: user.id,
        executorName: user.name,
        price: req.acceptablePrice ?? 'По договорённости',
        scheduledDate: req.date ?? null,
        scheduledTime: req.time ?? null,
        conditions: 'Принимаю заявку на условиях клиента',
      });
      console.log('[HomeScreen] Executor swipe-accepted request:', requestId);
    } catch (err: any) {
      console.error('[HomeScreen] Swipe accept failed:', err?.message);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось принять заявку. Попробуйте ещё раз.');
    } finally {
      setAcceptingRequestId(null);
    }
  }, [user, requests, proposeConditions]);

  const handleOpenWarning = useCallback((requestId: string, action: 'accept' | 'conditions') => {
    if (!requireAuthOrPromptLogin(isAuthenticated, action === 'accept' ? 'принять заявку' : 'предложить условия')) return;
    setPendingWarningRequestId(requestId);
    setPendingWarningAction(action);
    setWarningAcknowledged(false);
    setShowWarningModal(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [isAuthenticated]);

  const handleConfirmWarning = useCallback(() => {
    if (!warningAcknowledged || !pendingWarningRequestId) return;
    const action = pendingWarningAction;
    const reqId = pendingWarningRequestId;
    setShowWarningModal(false);
    setPendingWarningRequestId(null);
    setPendingWarningAction(null);
    if (action === 'accept') {
      setTimeout(() => {
        void handleSwipeAccept(reqId);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 350);
    } else if (action === 'conditions') {
      setConditionsPrice('');
      setConditionsText('');
      setTimeout(() => { setConditionsRequestId(reqId); }, 450);
    }
  }, [warningAcknowledged, pendingWarningRequestId, pendingWarningAction, handleSwipeAccept]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void refetch();
    setTimeout(() => setRefreshing(false), 400);
  }, [refetch]);

  const handleIgnore = useCallback((requestId: string) => {
    if (!user) return;
    ignoreRequest(requestId, user.id);
    console.log('[HomeScreen] Executor ignored request:', requestId);
  }, [user, ignoreRequest]);

  const conditionsRequest = useMemo(() => {
    if (!conditionsRequestId) return null;
    return requests.find((r) => r.id === conditionsRequestId) ?? null;
  }, [conditionsRequestId, requests]);

  const handleSendConditions = useCallback(async () => {
    if (!conditionsRequest || !user) return;
    if (!conditionsPrice.trim() || !conditionsText.trim()) {
      Alert.alert('Заполните предложение', 'Укажите цену и условия.');
      return;
    }
    setConditionsProposing(true);
    try {
      await proposeConditions(conditionsRequest.id, {
        executorId: user.id,
        executorName: user.name,
        price: conditionsPrice.trim(),
        scheduledDate: conditionsRequest.date ?? null,
        scheduledTime: conditionsRequest.time ?? null,
        conditions: conditionsText.trim(),
      });
      setConditionsRequestId(null);
      setConditionsPrice('');
      setConditionsText('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[HomeScreen] Conditions proposed for request:', conditionsRequest.id);
    } catch (err: any) {
      console.error('[HomeScreen] Send conditions failed:', err?.message);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось отправить предложение. Попробуйте ещё раз.');
    } finally {
      setConditionsProposing(false);
    }
  }, [conditionsRequest, user, conditionsPrice, conditionsText, proposeConditions]);

  const inProgressCount = useMemo(() => {
    if (!user) return 0;
    const fromRequests = isExecutor
      ? requests.filter((r) => r.status === 'in_progress' && r.executorId === user.id).length
      : requests.filter((r) => r.status === 'in_progress' && r.clientId === user.id).length;
    const fromProfile = user?.inProgressCount;
    return fromRequests > 0 ? fromRequests : (fromProfile ?? 0);
  }, [requests, user, isExecutor]);

  const pendingOrAvailableCount = useMemo(() => {
    if (!user) return 0;
    if (isExecutor) {
      const subIds = user.subscribedServiceIds ?? [];
      return requests.filter((r) => r.status === 'new' && subIds.includes(r.categoryId)).length;
    }
    return requests.filter((r) => r.clientId === user.id && r.status === 'new').length;
  }, [requests, user, isExecutor]);

  const myCompletedCount = useMemo(() => {
    if (!user) return 0;
    const fromRequests = isExecutor
      ? requests.filter((r) => r.status === 'completed' && r.executorId === user.id).length
      : requests.filter((r) => r.status === 'completed' && r.clientId === user.id).length;
    const fromProfile = user?.completedCount ?? 0;
    return Math.max(fromRequests, fromProfile);
  }, [requests, user, isExecutor]);

  const { refreshControl, MRefreshIndicator: mIndicator } = useMRefreshControl(refreshing, handleRefresh);

  const firstName = useMemo(() => {
    if (user?.firstName) return user.firstName;
    if (user?.name) return user.name.split(' ')[0];
    return '';
  }, [user?.firstName, user?.name]);

  const floatingHeaderHeight = useFloatingHeaderHeight();

  return (
  <>
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {mIndicator}

      <Animated.View style={[styles.greetingSection, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}>
        <View style={styles.greetingRow}>
          <View style={styles.greetingLeft}>
            <View style={styles.greetingTextWrap}>
              <Text style={styles.greetingText}>
                {greeting.text}{firstName ? `, ${firstName}` : ''}
              </Text>
              <Text style={styles.greetingSub}>{greeting.sub}</Text>
            </View>
          </View>

        </View>

        {weather ? (
          <View style={styles.weatherBlock}>
            <Text style={styles.weatherPhrase}>
              А в {weather.cityName} сегодня {getWeatherAdjective(weather.description)} погода — {getWeatherTip(weather.description, weather.temperature)}
            </Text>
            <View style={styles.weatherTempRow}>
              <Text style={styles.weatherEmoji}>{weather.emoji}</Text>
              <Text style={styles.weatherTemp}>{weather.temperature > 0 ? '+' : ''}{weather.temperature}°C</Text>
            </View>
          </View>
        ) : null}
      </Animated.View>

      <Animated.View style={{ opacity: heroOpacity, transform: [{ scale: heroScale }] }}>
        <View style={styles.heroWrap}>
          {isExecutor ? (
            <View style={styles.heroBanner}>
              <LinearGradient
                colors={['#0A2E1A', '#0D4A28', '#16A34A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <PulsingGlow color="rgba(110,231,163,0.15)" size={140} top={-40} left={SCREEN_WIDTH - 120} delay={0} />
              <PulsingGlow color="rgba(34,197,94,0.1)" size={100} top={80} left={-20} delay={800} />
              <PulsingGlow color="rgba(255,255,255,0.05)" size={80} top={20} left={SCREEN_WIDTH / 2} delay={400} />

              <View style={styles.heroContent}>
                <Text style={styles.heroTitle}>
                  {availableRequests.length > 0 ? `${availableRequests.length} ${availableRequests.length === 1 ? 'заявка' : availableRequests.length < 5 ? 'заявки' : 'заявок'}` : 'Заявки'}
                  {'\n'}
                  <Text style={styles.heroTitleAccent}>
                    {availableRequests.length > 0 ? 'ждут вас' : 'скоро появятся'}
                  </Text>
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.heroBanner}>
              <LinearGradient
                colors={['#041E14', '#083520', '#0C5C38', '#16A34A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <PulsingGlow color="rgba(110,231,163,0.12)" size={160} top={-50} left={SCREEN_WIDTH - 100} delay={0} />
              <PulsingGlow color="rgba(34,197,94,0.08)" size={120} top={100} left={-30} delay={600} />

              <View style={styles.heroContent}>
                <View style={styles.heroChipRow}>
                  <View style={styles.heroChip}>
                    <MapPin size={12} color="#6EE7A3" />
                    <Text style={styles.heroChipText}>{user?.city || 'Ваш город'}</Text>
                  </View>
                </View>

                <Text style={styles.heroTitle}>
                  Бытовой{'\n'}
                  <Text style={styles.heroTitleAccent}>помощник</Text>
                </Text>
                <Text style={styles.heroSub}>Создайте заявку — получите лучшие предложения</Text>

                <TouchableOpacity
                  style={styles.heroCreateBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    router.push('/create-request');
                  }}
                  testID="create-request-hero"
                >
                  <LinearGradient
                    colors={['#22C55E', '#16A34A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.heroCreateGradient}
                  >
                    <View style={styles.heroCreateIconWrap}>
                      <Plus size={20} color={Colors.white} strokeWidth={3} />
                    </View>
                    <Text style={styles.heroCreateText}>Заказать услугу</Text>
                    <ArrowRight size={18} color="rgba(255,255,255,0.7)" />
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Animated.View>

      {!isExecutor && myActiveRequests.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<TrendingUp size={16} color={Colors.warning} />}
            iconBg="rgba(245,158,11,0.12)"
            title="Активные заявки"
            subtitle="Следите за ответами и статусами"
            rightElement={
              <TouchableOpacity
                onPress={() => {
                  console.log('[Nav]', 'home seeAll client active → requests', {
                    userId: user?.id ?? null,
                    hasUser: !!user,
                    role,
                  });
                  router.push('/(tabs)/requests');
                }}
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>Все</Text>
                <ArrowRight size={14} color={Colors.primary} />
              </TouchableOpacity>
            }
          />
          {myActiveRequests.map((req) => (
            <ActiveRequestMini
              key={req.id}
              req={req}
              onPress={() => router.push({ pathname: '/request-details', params: { id: req.id } })}
            />
          ))}
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <StatCard
          value={pendingOrAvailableCount}
          label={isExecutor ? 'Доступно' : 'Ожидание'}
          icon={<Clock size={18} color={Colors.info} />}
          gradientColors={['#0369A1', '#38BDF8']}
          index={0}
          onPress={() => {
            const tab = isExecutor ? 'available' : 'active';
            console.log('[Nav]', 'home StatCard pending → requests', {
              tab,
              userId: user?.id ?? null,
              hasUser: !!user,
              role,
            });
            router.push({ pathname: '/(tabs)/requests', params: { tab } });
          }}
        />
        <StatCard
          value={inProgressCount}
          label="В работе"
          icon={<Activity size={18} color={Colors.warning} />}
          gradientColors={['#B45309', '#F59E0B']}
          index={1}
          isLive
          onPress={() => {
            const tab = isExecutor ? 'my' : 'active';
            console.log('[Nav]', 'home StatCard in progress → requests', {
              tab,
              userId: user?.id ?? null,
              hasUser: !!user,
              role,
            });
            router.push({ pathname: '/(tabs)/requests', params: { tab } });
          }}
        />
        <StatCard
          value={myCompletedCount}
          label="Готово"
          icon={<CheckCircle size={18} color={Colors.success} />}
          gradientColors={['#0B5D2A', '#22C55E']}
          index={2}
          onPress={() => {
            console.log('[Nav]', 'home StatCard history → requests', {
              tab: 'history',
              userId: user?.id ?? null,
              hasUser: !!user,
              role,
            });
            router.push({ pathname: '/(tabs)/requests', params: { tab: 'history' } });
          }}
        />
      </View>

      {!isExecutor ? (
        <View style={styles.section}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { setQuickOrderExpanded((v) => !v); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
            testID="toggle-quick-order"
          >
            <View style={styles.quickOrderHeader}>
              <View style={styles.sectionHeaderLeft}>
                <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                  <Zap size={16} color="#FBBF24" />
                </View>
                <View style={styles.sectionHeaderTextWrap}>
                  <Text style={styles.sectionTitle}>Быстрый заказ</Text>
                  <Text style={styles.sectionSubtitle}>Выберите нужную услугу</Text>
                </View>
              </View>
              <View style={styles.quickOrderToggle}>
                <Text style={styles.seeAllText}>{quickOrderExpanded ? 'Скрыть' : 'Открыть'}</Text>
                {quickOrderExpanded ? <ChevronUp size={14} color={Colors.primary} /> : <ChevronDown size={14} color={Colors.primary} />}
              </View>
            </View>
          </TouchableOpacity>
          {quickOrderExpanded ? (
            <>
              <View style={styles.servicesGrid}>
                {topServices.map((cat, idx) => (
                  <QuickServiceItem
                    key={cat.id}
                    cat={cat}
                    index={idx}
                    onPress={() => {
                      router.push({ pathname: '/create-request', params: { categoryId: cat.id } });
                    }}
                  />
                ))}
              </View>
              {serviceCategories.length > 8 ? (
                <TouchableOpacity
                  onPress={() => { setServicesExpanded((v) => !v); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                  style={styles.showMoreServicesBtn}
                  testID="toggle-services"
                >
                  <Text style={styles.seeAllText}>{servicesExpanded ? 'Меньше' : 'Показать все'}</Text>
                  {servicesExpanded ? <ChevronUp size={14} color={Colors.primary} /> : <ChevronDown size={14} color={Colors.primary} />}
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {isExecutor && availableRequests.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<BellRing size={16} color={Colors.info} />}
            iconBg="rgba(56,189,248,0.12)"
            title="Доступные заявки"
            subtitle="Принимайте или предлагайте условия"
            rightElement={
              <TouchableOpacity
                onPress={() => {
                  console.log('[Nav]', 'home seeAll executor available → requests', {
                    userId: user?.id ?? null,
                    hasUser: !!user,
                    role,
                  });
                  router.push('/(tabs)/requests');
                }}
                style={styles.seeAllBtn}
                testID="see-all-requests"
              >
                <Text style={styles.seeAllText}>Все</Text>
                <ArrowRight size={14} color={Colors.primary} />
              </TouchableOpacity>
            }
          />
          {availableRequests.slice(0, 5).map((req, idx) => (
            <ExecutorRequestCard
              key={req.id}
              req={req}
              index={idx}
              onPress={() => router.push({ pathname: '/request-details', params: { id: req.id } })}
              onAccept={() => {
                handleOpenWarning(req.id, 'accept');
              }}
              onConditions={() => {
                handleOpenWarning(req.id, 'conditions');
              }}
              onBookmark={() => {
                if (!requireAuthOrPromptLogin(isAuthenticated, 'добавить в избранное')) return;
                toggleFavorite(req.id);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              onIgnore={() => handleIgnore(req.id)}
              isFav={isFavorite(req.id)}
            />
          ))}
        </View>
      ) : isExecutor ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<BellRing size={16} color={Colors.info} />}
            iconBg="rgba(56,189,248,0.12)"
            title="Доступные заявки"
            subtitle="По вашим выбранным услугам"
          />
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <LinearGradient
                colors={['rgba(56,189,248,0.15)', 'rgba(56,189,248,0.05)']}
                style={styles.emptyIconGradient}
              >
                <Sparkles size={22} color={Colors.info} />
              </LinearGradient>
            </View>
            <Text style={styles.emptyTitle}>Пока нет новых заявок</Text>
            <Text style={styles.emptyText}>Как только появится заявка по вашим услугам — она придёт уведомлением</Text>
          </View>
        </View>
      ) : null}

      {isExecutor && myActiveRequests.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            icon={<TrendingUp size={16} color={Colors.warning} />}
            iconBg="rgba(245,158,11,0.12)"
            title="Мои заявки"
            subtitle="Следите за ответами и статусами"
            rightElement={
              <TouchableOpacity
                onPress={() => {
                  console.log('[Nav]', 'home seeAll executor my → requests', {
                    userId: user?.id ?? null,
                    hasUser: !!user,
                    role,
                  });
                  router.push('/(tabs)/requests');
                }}
                style={styles.seeAllBtn}
              >
                <Text style={styles.seeAllText}>Все</Text>
                <ArrowRight size={14} color={Colors.primary} />
              </TouchableOpacity>
            }
          />
          {myActiveRequests.map((req) => (
            <ActiveRequestMini
              key={req.id}
              req={req}
              onPress={() => router.push({ pathname: '/request-details', params: { id: req.id } })}
            />
          ))}
        </View>
      ) : null}



      <View style={styles.bottomSpacer} />
    </ScrollView>

    {acceptingRequestId ? (
      <Modal visible transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <MLoader size="large" />
            <Text style={styles.overlayText}>Принимаем заявку...</Text>
          </View>
        </View>
      </Modal>
    ) : null}

    {conditionsProposing ? (
      <Modal visible transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <MLoader size="large" />
            <Text style={styles.overlayText}>Отправляем...</Text>
          </View>
        </View>
      </Modal>
    ) : null}

    <Modal
      visible={!!conditionsRequestId && !conditionsProposing}
      transparent
      animationType="slide"
      onRequestClose={() => setConditionsRequestId(null)}
    >
      <KeyboardAvoidingView style={styles.condModalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.condModalCard}>
          <View style={styles.condModalHandle} />
          <View style={styles.condModalHeader}>
            <Text style={styles.condModalTitle}>Предложить условия</Text>
            <TouchableOpacity onPress={() => setConditionsRequestId(null)} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.condCloseBtn}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {conditionsRequest ? (
            <View style={styles.condReqInfo}>
              <Text style={styles.condReqName} numberOfLines={1}>{conditionsRequest.categoryName}</Text>
              <View style={styles.condReqMeta}>
                <MapPin size={12} color={Colors.textSecondary} />
                <Text style={styles.condReqMetaText} numberOfLines={1}>{conditionsRequest.address}</Text>
              </View>
              {conditionsRequest.date ? (
                <View style={styles.condReqMeta}>
                  <Calendar size={12} color={Colors.textSecondary} />
                  <Text style={styles.condReqMetaText}>{conditionsRequest.date}, {conditionsRequest.time}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <TextInput
            {...numericNoSuggestProps}
            style={styles.condInput}
            value={conditionsPrice}
            onChangeText={setConditionsPrice}
            placeholder="Цена (₽)"
            placeholderTextColor={Colors.textMuted}
            testID="home-conditions-price"
          />
          <TextInput
            {...plainFieldProps}
            style={[styles.condInput, styles.condTextArea]}
            value={conditionsText}
            onChangeText={setConditionsText}
            placeholder="Комментарий к предложению"
            placeholderTextColor={Colors.textMuted}
            multiline
            textAlignVertical="top"
            testID="home-conditions-text"
          />
          <TouchableOpacity
            style={[styles.condSendBtn, (!conditionsPrice.trim() || !conditionsText.trim()) && styles.condSendDisabled]}
            onPress={handleSendConditions}
            activeOpacity={0.8}
            disabled={!conditionsPrice.trim() || !conditionsText.trim()}
            testID="home-conditions-submit"
          >
            <LinearGradient
              colors={(!conditionsPrice.trim() || !conditionsText.trim()) ? [Colors.cardSecondary, Colors.cardSecondary] : ['#16A34A', '#22C55E']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.condSendGradient}
            >
              <FileText size={18} color={Colors.white} />
              <Text style={styles.condSendText}>Отправить предложение</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>

    <Modal visible={showWarningModal} transparent animationType="fade" onRequestClose={() => setShowWarningModal(false)}>
      <View style={styles.warningOverlay}>
        <View style={styles.warningCard}>
          <View style={styles.warningIconWrap}>
            <AlertCircle size={36} color="#F59E0B" />
          </View>
          <Text style={styles.warningTitle}>Важное уведомление</Text>
          <Text style={styles.warningSubtitle}>
            В случае, если Вы не явитесь выполнять заявку без уведомления Клиента, Вам будет автоматически поставлена 1 звезда, что сократит Ваш персональный рейтинг.
          </Text>
          <TouchableOpacity
            style={styles.warningCheckboxRow}
            onPress={() => setWarningAcknowledged((v) => !v)}
            activeOpacity={0.7}
            testID="home-warning-checkbox"
          >
            <View style={[styles.warningCheckbox, warningAcknowledged && styles.warningCheckboxActive]}>
              {warningAcknowledged ? <CheckCircle size={18} color={Colors.white} /> : null}
            </View>
            <Text style={styles.warningCheckboxLabel}>Ознакомлен</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.warningConfirmBtn, !warningAcknowledged && { opacity: 0.5 }]}
            onPress={handleConfirmWarning}
            activeOpacity={0.85}
            disabled={!warningAcknowledged}
            testID="home-warning-confirm"
          >
            <Text style={styles.warningConfirmText}>Продолжить</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.warningCancelBtn}
            onPress={() => { setShowWarningModal(false); setPendingWarningRequestId(null); setPendingWarningAction(null); }}
            activeOpacity={0.7}
          >
            <Text style={styles.warningCancelText}>Отмена</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 20,
  },
  headerSpacer: {
    width: '100%',
  },

  greetingSection: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 0,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greetingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  greetingTextWrap: {
    flex: 1,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  greetingSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },


  weatherBlock: {
    marginTop: 10,
    gap: 6,
  },
  weatherPhrase: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  weatherTempRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  weatherEmoji: {
    fontSize: 20,
  },
  weatherTemp: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },

  heroWrap: {
    paddingHorizontal: 16,
    marginTop: 8,
  },
  heroBanner: {
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 }
      : {}),
  },
  heroContent: {
    padding: 18,
    zIndex: 2,
    gap: 8,
  },
  heroChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heroChipGold: {
    borderColor: 'rgba(251,191,36,0.2)',
    backgroundColor: 'rgba(251,191,36,0.08)',
  },
  heroChipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '600' as const,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '900' as const,
    color: Colors.white,
    lineHeight: 40,
    letterSpacing: -1,
  },
  heroTitleAccent: {
    color: '#6EE7A3',
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 20,
  },
  heroPillRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  heroPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  heroPillText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '700' as const,
    fontSize: 12,
  },
  heroCreateBtn: {
    alignSelf: 'stretch',
    marginTop: 8,
    borderRadius: 20,
    overflow: 'hidden',
  },
  heroCreateGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderRadius: 20,
  },
  heroCreateIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCreateText: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.white,
    letterSpacing: -0.3,
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 12,
  },
  statCardTouch: {
    flex: 1,
  },
  statCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 5, elevation: 2 }
      : {}),
  },
  statGradientBar: {
    height: 3,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  statCardInner: {
    padding: 14,
    alignItems: 'center',
    gap: 4,
  },
  statIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: '900' as const,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
    textAlign: 'center' as const,
  },

  section: {
    paddingHorizontal: 16,
    marginTop: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTextWrap: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  seeAllText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '700' as const,
  },

  quickOrderHeader: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    marginBottom: 10,
  },
  quickOrderToggle: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  showMoreServicesBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center' as const,
    marginTop: 10,
  },

  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickServiceTouch: {
    width: (SCREEN_WIDTH - 32 - 24) / 4,
  },
  quickServiceItem: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  quickServiceIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickServiceIconInner: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickServiceName: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 14,
  },

  execCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    overflow: 'hidden',
    position: 'relative',
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 6, elevation: 3 }
      : {}),
  },
  execCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  execCardIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  execCardHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  execCardTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 4,
  },
  execCardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  execPriceBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  execPriceText: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  execPayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245,158,11,0.06)',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  execPayText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '600' as const,
  },
  execBookmarkBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  execBookmarkBtnActive: {
    backgroundColor: 'rgba(245,158,11,0.12)',
  },
  execCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  execMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    maxWidth: '100%' as any,
  },
  execMetaText: {
    fontSize: 12,
    color: Colors.textSecondary,
    flexShrink: 1,
  },
  execComment: {
    backgroundColor: 'rgba(56,189,248,0.05)',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(56,189,248,0.25)',
  },
  execCommentText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
  },
  execClientChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  execClientAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.25)',
  },
  execClientAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  execClientName: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600' as const,
    flex: 1,
  },
  execClientRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  execClientRatingText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  execActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 12,
  },
  execAcceptBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  execAcceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
  },
  execAcceptText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  execCondBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderRadius: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.2)',
  },
  execCondText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  execIgnoreBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },

  activeMiniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 }
      : {}),
  },
  activeMiniLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  activeMiniIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeMiniInfo: {
    flex: 1,
  },
  activeMiniTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  activeMiniMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeMiniStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.warning,
  },
  activeMiniStatus: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  activeMiniPrice: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '700' as const,
  },

  completedMiniCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  completedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  completedBadgeText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600' as const,
  },
  completedDate: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '500' as const,
  },
  completedRatingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  completedRatingText: {
    fontSize: 11,
    color: Colors.accent,
    fontWeight: '700' as const,
  },

  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    padding: 16,
    alignItems: 'center',
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.4, shadowRadius: 5, elevation: 2 }
      : {}),
  },
  emptyIconWrap: {
    marginBottom: 8,
  },
  emptyIconGradient: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    color: Colors.text,
    fontWeight: '800' as const,
    fontSize: 15,
    marginBottom: 4,
    textAlign: 'center' as const,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center' as const,
  },

  bottomSpacer: {
    height: 100,
  },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    gap: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  overlayText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
  },

  condModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  condModalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    borderBottomWidth: 0,
  },
  condModalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  condModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  condModalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  condCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  condReqInfo: {
    backgroundColor: 'rgba(56,189,248,0.06)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.1)',
    gap: 6,
  },
  condReqName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  condReqMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  condReqMetaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  condInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 14,
    marginBottom: 10,
  },
  condTextArea: {
    minHeight: 80,
  },
  condSendBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
  },
  condSendDisabled: {
    opacity: 0.5,
  },
  condSendGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
  },
  condSendText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  warningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  warningCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...(Platform.OS !== 'web'
      ? { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 4 }
      : {}),
  },
  warningIconWrap: {
    alignItems: 'center' as const,
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center' as const,
    marginBottom: 10,
  },
  warningSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
    marginBottom: 18,
  },
  warningCheckboxRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 12,
    marginBottom: 18,
  },
  warningCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  warningCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  warningCheckboxLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  warningConfirmBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center' as const,
    marginBottom: 10,
  },
  warningConfirmText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  warningCancelBtn: {
    alignItems: 'center' as const,
    paddingVertical: 10,
  },
  warningCancelText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
});
