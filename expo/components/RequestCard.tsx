import React, { useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { Image } from '@/components/MImage';
import { useRouter } from 'expo-router';
import { MapPin, Calendar, ChevronRight, FileText, Star, Wallet, User, Zap, AlertCircle, Clock } from 'lucide-react-native';
import { formatCreatedAtInCityTz, getTimezoneAbbr } from '@/lib/region-timezone';
import VerifiedBadge from './VerifiedBadge';
import * as Haptics from 'expo-haptics';
import { ServiceRequest, UserRole } from '@/types';
import { useServiceCategories } from '@/lib/use-service-categories';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import StatusBadge from './StatusBadge';
import ServiceIcon from './ServiceIcon';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import { useAuth } from '@/providers/AuthProvider';
import { requireAuthOrPromptLogin } from '@/lib/require-auth';

interface RequestCardProps {
  request: ServiceRequest;
  viewerRole?: UserRole | null;
}

export default React.memo(function RequestCard({ request, viewerRole }: RequestCardProps) {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const proposals = useMemo(() => request.proposals ?? [], [request.proposals]);
  const serviceCategories = useServiceCategories();

  const category = useMemo(() => serviceCategories.find((item) => item.id === request.categoryId), [request.categoryId, serviceCategories]);

  const offerLabel = useMemo(() => {
    if (request.offerStatus === 'accepted' && request.masterName) {
      return `В работе у ${request.masterName}`;
    }
    if (proposals.length > 0) {
      return `Предложений: ${proposals.length}`;
    }
    return 'Ожидает предложений';
  }, [request.masterName, request.offerStatus, proposals.length]);

  const paymentLabel = useMemo(() => {
    const labels: Record<string, string> = { cash: 'Наличные', transfer: 'Перевод', online: 'Онлайн' };
    return request.paymentMethod ? labels[request.paymentMethod] ?? '' : '';
  }, [request.paymentMethod]);

  const postedAtLabel = useMemo(() => {
    const formatted = formatCreatedAtInCityTz(request.createdAt, request.city);
    if (!formatted) return '';
    const tz = getTimezoneAbbr(request.city);
    return tz ? `Размещено: ${formatted} (${tz})` : `Размещено: ${formatted}`;
  }, [request.createdAt, request.city]);

  const bestProposal = useMemo(() => {
    if (proposals.length === 0) {
      return null;
    }
    return proposals[0] ?? null;
  }, [proposals]);

  const handlePressIn = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 0.97, tension: 200, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 15, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [scaleAnim]);

  const handlePress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!requireAuthOrPromptLogin(isAuthenticated, 'посмотреть детали заявки')) return;
    router.push({ pathname: '/request-details', params: { id: request.id } });
  }, [router, request.id, isAuthenticated]);

  const isActive = request.status === 'in_progress';
  const isNew = request.status === 'new';

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      testID={`request-card-${request.id}`}
    >
      <Animated.View style={[
        styles.card,
        isActive && styles.cardActive,
        isNew && styles.cardNew,
        { transform: [{ scale: scaleAnim }] },
      ]}>
        <View style={styles.header}>
          <View style={[styles.iconWrap, { backgroundColor: category?.bgColor ?? Colors.primaryLight }]}>
            <ServiceIcon
              name={category?.icon ?? 'Wrench'}
              size={20}
              color={category?.color ?? Colors.primary}
            />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>{request.categoryName}</Text>
            {request.acceptablePrice ? (
              <View style={styles.priceRow}>
                <Text style={styles.priceTag}>{request.acceptablePrice}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.chevronWrap}>
            <ChevronRight size={18} color={Colors.textMuted} />
          </View>
        </View>

        {request.isUrgent ? (
          <View style={styles.urgentBadge}>
            <Zap size={14} color="#FFFFFF" fill="#FFFFFF" />
            <Text style={styles.urgentBadgeText}>Срочная заявка — в ближайшее время</Text>
          </View>
        ) : null}

        {request.isPaid === false && request.status === 'completed' ? (
          <View style={styles.unpaidBadge}>
            <AlertCircle size={14} color={Colors.danger} />
            <Text style={styles.unpaidBadgeText}>Не оплачена</Text>
          </View>
        ) : null}

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <View style={styles.metaIconWrap}>
              <MapPin size={13} color={Colors.textSecondary} />
            </View>
            <Text style={styles.metaText} numberOfLines={1}>{request.address}</Text>
          </View>
          <View style={styles.metaItem}>
            <View style={styles.metaIconWrap}>
              <Calendar size={13} color={Colors.textSecondary} />
            </View>
            <Text style={styles.metaText}>
              {request.isUrgent ? `${request.date ?? ''} · В ближайшее время` : `${request.date}, ${request.time}`}
            </Text>
          </View>
          {paymentLabel ? (
            <View style={styles.metaItem}>
              <View style={[styles.metaIconWrap, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                <Wallet size={13} color={Colors.accent} />
              </View>
              <Text style={styles.metaText}>{paymentLabel}</Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <View style={[styles.metaIconWrap, { backgroundColor: 'rgba(110,231,163,0.1)' }]}>
              <FileText size={13} color="#6EE7A3" />
            </View>
            <Text style={[styles.metaText, styles.offerText]} numberOfLines={2}>{offerLabel}</Text>
          </View>
          {postedAtLabel ? (
            <View style={styles.metaItem}>
              <View style={styles.metaIconWrap}>
                <Clock size={13} color={Colors.textMuted} />
              </View>
              <Text style={[styles.metaText, styles.postedText]} numberOfLines={1}>{postedAtLabel}</Text>
            </View>
          ) : null}
          {viewerRole !== 'executor' && bestProposal && !(request.masterName && (request.status === 'in_progress' || request.status === 'completed')) ? (
            <View style={styles.bestOfferRow}>
              {bestProposal.executorAvatar && isSafeImageUri(bestProposal.executorAvatar) ? (
                <Image
                  source={{ uri: bestProposal.executorAvatar }}
                  style={styles.executorMiniAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={styles.executorMiniAvatarPlaceholder}>
                  <User size={12} color={Colors.info} />
                </View>
              )}
              <View style={styles.bestOfferContent}>
                <View style={styles.bestOfferNameRow}>
                  <Text style={styles.bestOfferName} numberOfLines={1}>{bestProposal.executorName}</Text>
                  {bestProposal.executorIsFullyVerified ? <VerifiedBadge size="small" /> : null}
                </View>
                <View style={styles.bestOfferMeta}>
                  {bestProposal.executorRating ? (
                    <View style={styles.miniRatingRow}>
                      <Star size={11} color="#FBBF24" fill="#FBBF24" />
                      <Text style={styles.miniRatingText}>{Number(bestProposal.executorRating).toFixed(1)}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.bestOfferDetails} numberOfLines={1}>
                    {bestProposal.price ? `${bestProposal.price} ₽` : ''}{bestProposal.scheduledDate ? ` · ${bestProposal.scheduledDate}` : ''}{bestProposal.scheduledTime ? ` ${bestProposal.scheduledTime}` : ''}
                  </Text>
                </View>
              </View>
            </View>
          ) : null}
          {request.clientName && viewerRole === 'executor' ? (
            <View style={styles.clientInfoRow}>
              {request.clientAvatar && isSafeImageUri(request.clientAvatar) ? (
                <Image
                  source={{ uri: request.clientAvatar }}
                  style={styles.clientMiniAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={styles.clientMiniAvatarPlaceholder}>
                  <User size={12} color={Colors.textSecondary} />
                </View>
              )}
              <Text style={styles.clientInfoText} numberOfLines={1}>{request.clientName}</Text>
              {request.clientRating != null && Number(request.clientRating) > 0 ? (
                <View style={styles.miniRatingRow}>
                  <Star size={11} color="#FBBF24" fill="#FBBF24" />
                  <Text style={styles.miniRatingText}>{Number(request.clientRating).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
          {request.masterName && viewerRole === 'client' && (request.status === 'in_progress' || request.status === 'completed') ? (
            <View style={styles.executorInfoRow}>
              {request.executorAvatar && isSafeImageUri(request.executorAvatar) ? (
                <Image
                  source={{ uri: request.executorAvatar }}
                  style={styles.executorMiniAvatar}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={120}
                />
              ) : (
                <View style={styles.executorMiniAvatarPlaceholder}>
                  <User size={12} color={Colors.info} />
                </View>
              )}
              <Text style={styles.executorInfoText} numberOfLines={1}>{request.masterName}</Text>
              {request.executorIsFullyVerified ? <VerifiedBadge size="small" /> : null}
              {request.executorRating != null && Number(request.executorRating) > 0 ? (
                <View style={styles.miniRatingRow}>
                  <Star size={11} color="#FBBF24" fill="#FBBF24" />
                  <Text style={styles.miniRatingText}>{Number(request.executorRating).toFixed(1)}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <StatusBadge status={request.status} />
          {(request.proposalCount ?? proposals.length) > 0 && (
            <View style={styles.proposalCount}>
              <Text style={styles.proposalCountText}>{request.proposalCount ?? proposals.length}</Text>
              <Text style={styles.proposalCountLabel}>откл.</Text>
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  cardActive: {
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    backgroundColor: 'rgba(245,158,11,0.03)',
  },
  cardNew: {
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 3,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceTag: {
    fontSize: 14,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  chevronWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: {
    gap: 8,
    marginBottom: 14,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    fontSize: 13,
    color: Colors.textSecondary,
    flex: 1,
  },
  offerText: {
    color: '#6EE7A3',
    fontWeight: '600' as const,
  },
  postedText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  bestOfferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,158,11,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
  },
  bestOfferContent: {
    flex: 1,
  },
  bestOfferName: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '700' as const,
    flex: 1,
  },
  bestOfferNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  bestOfferMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  bestOfferDetails: {
    flex: 1,
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  executorMiniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  executorMiniAvatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(56,189,248,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(251,191,36,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniRatingText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FBBF24',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  proposalCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(22,163,74,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  proposalCountText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  proposalCountLabel: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  clientInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(22,163,74,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.12)',
  },
  clientMiniAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  clientMiniAvatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clientInfoText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600' as const,
    flex: 1,
  },
  executorInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(56,189,248,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.12)',
  },
  executorInfoText: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600' as const,
    flex: 1,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  urgentBadgeText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  unpaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  unpaidBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
});
