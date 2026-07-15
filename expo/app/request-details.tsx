import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
  TouchableOpacity,
  Modal,
  Dimensions,
  Animated,
  PanResponder,
  Linking,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from '@/components/MImage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { pickPhotos } from '@/lib/pick-photo';
import { uploadManyToS3 } from '@/lib/upload-to-s3';
import { resizeForLive } from '@/lib/resize-for-live';

function assertAllAreHttps(urls: string[]): void {
  for (const u of urls) {
    if (!u.startsWith('https://') && !u.startsWith('http://')) {
      throw new Error('Photo upload incomplete: ' + u.slice(0, 32));
    }
  }
}
import ZoomableImage from '@/components/ZoomableImage';
import PhotoSourceSheet from '@/components/PhotoSourceSheet';
import { chatComposerProps, numericNoSuggestProps, plainFieldProps } from '@/lib/text-input-autofill';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import {
  MapPin,
  Calendar,
  Clock,
  User,
  Star,
  XCircle,
  CheckCircle,
  FileText,
  MessageCircle,
  Wallet,
  CreditCard,
  Camera,
  ChevronLeft,
  ChevronRight,
  X,
  ZoomIn,
  Phone,
  Zap,
  AlertCircle,
  Navigation,
  Car,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useMRefreshControl } from '@/components/MRefreshControl';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { useServiceCategories } from '@/lib/use-service-categories';
import { useRequests } from '@/providers/RequestsProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useChats } from '@/providers/ChatProvider';
import StatusBadge from '@/components/StatusBadge';
import ServiceIcon from '@/components/ServiceIcon';
import AnimatedActionButton from '@/components/AnimatedActionButton';
import RatingModal from '@/components/RatingModal';
import VerifiedBadge from '@/components/VerifiedBadge';
import { RequestProposal, ChatMessage, ServiceRequest } from '@/types';
import { trpc } from '@/lib/trpc';
import MLoader from '@/components/MLoader';
import { formatCreatedAtInCityTz, getTimezoneAbbr } from '@/lib/region-timezone';

type GeoCoords = { lat: string; lon: string };

function extractHouseNumber(address: string): string | null {
  const m = address.match(/(?:^|[\s,])(?:д\.?|дом)?\s*(\d+[а-яА-Яa-zA-Z\/\-]*)\b/);
  if (m && m[1]) {
    const raw = m[1].trim();
    if (/^\d/.test(raw)) return raw;
  }
  const any = address.match(/\b(\d+[а-яА-Яa-zA-Z\/\-]*)\b/);
  return any && any[1] ? any[1] : null;
}

function cleanAddress(addressRaw: string): string {
  return (addressRaw ?? '')
    .trim()
    .replace(/\b(кв|квартира|кв\.|офис|оф\.|подъезд|под\.|этаж|эт\.)\s*\d+\w*/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*$/g, '')
    .trim();
}

function formatAddressForYandex(cityRaw: string, addressRaw: string): string {
  let s = (addressRaw ?? '').toString();

  s = s.replace(/[,;]+/g, ' ');

  s = s.replace(/\b(кв\.?|квартира|апартаменты|апарт\.?|офис|оф\.?)\s*[№#:]?\s*[\wа-яА-Я\-\/]+/gi, ' ');
  s = s.replace(/\b(подъезд|под\.?|п\.)\s*[№#:]?\s*[\wа-яА-Я\-\/]+/gi, ' ');
  s = s.replace(/\b\d+\s*(?:-?(?:й|ый|ой|ая|я))?\s*(подъезд|под\.?)\b/gi, ' ');
  s = s.replace(/\b(этаж|эт\.?)\s*[№#:]?\s*[\wа-яА-Я\-\/]+/gi, ' ');
  s = s.replace(/\b\d+\s*(?:-?(?:й|ый|ой|ая|я))?\s*(этаж|эт\.?)\b/gi, ' ');
  s = s.replace(/\b(домофон|код\s*домофона|код)\s*[№#:]?\s*[\wа-яА-Я\-\/]+/gi, ' ');

  s = s.replace(/\b(улица|ул\.?|проспект|пр-т|пр-кт|просп\.?|переулок|пер\.?|бульвар|б-р|бул\.?|шоссе|ш\.?|площадь|пл\.?|проезд|набережная|наб\.?|тупик|туп\.?|микрорайон|мкр\.?|мкрн\.?|аллея|тракт)\.?/gi, ' ');
  s = s.replace(/\b(дом|д\.)\s*/gi, ' ');
  s = s.replace(/\b(корпус|корп\.?|к\.)\s*/gi, ' ');
  s = s.replace(/\b(строение|стр\.?)\s*/gi, ' ');

  s = s.replace(/\s+/g, ' ').trim();
  const c = (cityRaw ?? '').replace(/[,;]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (c) {
    const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const cityRe = new RegExp(`\\b${escaped}\\b`, 'gi');
    s = s.replace(cityRe, ' ').replace(/\s+/g, ' ').trim();
  }

  const result = [c, s].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  console.log('[formatAddressForYandex]', { cityRaw, addressRaw, result });
  return result;
}

function normalizeAddressVariants(cityRaw: string, addressRaw: string): string[] {
  const city = (cityRaw ?? '').trim();
  const compact = cleanAddress(addressRaw);
  const yandexStyle = formatAddressForYandex(cityRaw, addressRaw);
  const variants: string[] = [];
  const push = (v: string) => {
    const x = v.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    if (x && !variants.includes(x)) variants.push(x);
  };
  push(yandexStyle);
  push([city, compact, 'Россия'].filter(Boolean).join(', '));
  push([city, compact].filter(Boolean).join(', '));
  push([compact, city, 'Россия'].filter(Boolean).join(', '));
  push([compact, 'Россия'].filter(Boolean).join(', '));
  push(compact);
  return variants;
}

async function geocodeNominatimStructured(city: string, address: string): Promise<GeoCoords | null> {
  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: '1',
      countrycodes: 'ru',
      addressdetails: '1',
      'accept-language': 'ru',
    });
    if (city) params.set('city', city);
    if (address) params.set('street', address);
    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'ru', 'User-Agent': 'rork-app/1.0 (support@rork.app)' },
    });
    const data = (await res.json()) as Array<{ lat: string; lon: string; address?: { house_number?: string } }>;
    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      console.log('[geocodeNominatimStructured] hit:', data[0]);
      return { lat: data[0].lat, lon: data[0].lon };
    }
  } catch (e) {
    console.log('[geocodeNominatimStructured] error:', e);
  }
  return null;
}

async function geocodeNominatim(q: string, expectedHouse: string | null): Promise<GeoCoords | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=ru&addressdetails=1&accept-language=ru&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'ru', 'User-Agent': 'rork-app/1.0 (support@rork.app)' },
    });
    const data = (await res.json()) as Array<{
      lat: string;
      lon: string;
      address?: { house_number?: string };
      type?: string;
      class?: string;
    }>;
    if (!data || data.length === 0) return null;
    if (expectedHouse) {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[\-\/]/g, '');
      const wanted = normalize(expectedHouse);
      const matched = data.find((d) => d.address?.house_number && normalize(d.address.house_number) === wanted);
      if (matched) return { lat: matched.lat, lon: matched.lon };
    }
    const withHouse = data.find((d) => d.address?.house_number);
    if (withHouse) return { lat: withHouse.lat, lon: withHouse.lon };
    return { lat: data[0].lat, lon: data[0].lon };
  } catch (e) {
    console.log('[geocodeNominatim] error:', e);
  }
  return null;
}

async function geocodePhoton(q: string, expectedHouse: string | null): Promise<GeoCoords | null> {
  try {
    const url = `https://photon.komoot.io/api/?limit=5&lang=ru&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const data = (await res.json()) as { features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { housenumber?: string; countrycode?: string };
    }> };
    const features = (data?.features ?? []).filter((f) => f?.properties?.countrycode === 'RU' || !f?.properties?.countrycode);
    if (features.length === 0) return null;
    if (expectedHouse) {
      const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '').replace(/[\-\/]/g, '');
      const wanted = normalize(expectedHouse);
      const matched = features.find((f) => f.properties?.housenumber && normalize(f.properties.housenumber) === wanted);
      if (matched?.geometry?.coordinates && matched.geometry.coordinates.length === 2) {
        return { lon: String(matched.geometry.coordinates[0]), lat: String(matched.geometry.coordinates[1]) };
      }
    }
    const withHouse = features.find((f) => f.properties?.housenumber);
    const pick = withHouse ?? features[0];
    const coords = pick?.geometry?.coordinates;
    if (coords && coords.length === 2) {
      return { lon: String(coords[0]), lat: String(coords[1]) };
    }
  } catch (e) {
    console.log('[geocodePhoton] error:', e);
  }
  return null;
}

async function geocodeAddress(city: string, address: string): Promise<GeoCoords | null> {
  const compact = cleanAddress(address);
  const expectedHouse = extractHouseNumber(compact);
  console.log('[geocodeAddress] city:', city, 'address:', compact, 'house:', expectedHouse);

  const structured = await geocodeNominatimStructured(city, compact);
  if (structured) {
    console.log('[geocodeAddress] structured hit:', structured);
    return structured;
  }

  const variants = normalizeAddressVariants(city, address);
  console.log('[geocodeAddress] variants:', variants);
  for (const q of variants) {
    const r = await geocodeNominatim(q, expectedHouse);
    if (r) {
      console.log('[geocodeAddress] nominatim hit:', q, r);
      return r;
    }
  }
  for (const q of variants) {
    const r = await geocodePhoton(q, expectedHouse);
    if (r) {
      console.log('[geocodeAddress] photon hit:', q, r);
      return r;
    }
  }
  console.log('[geocodeAddress] no result');
  return null;
}

interface ProfileInfo {
  name: string;
  avatar?: string | null;
  rating?: number | null;
  ratingCount?: number;
  ordersCount?: number;
  role: 'client' | 'executor';
}

function ProfileModal({ visible, onClose, profile }: { visible: boolean; onClose: () => void; profile: ProfileInfo | null }) {
  if (!profile) return null;

  const ratingStr = profile.rating != null ? Number(profile.rating).toFixed(1) : '—';
  const starsCount = profile.rating != null ? Math.round(Number(profile.rating)) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={profileModalStyles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={profileModalStyles.card}>
          <View style={profileModalStyles.header}>
            {profile.avatar ? (
              <Image source={{ uri: profile.avatar }} style={profileModalStyles.avatar} />
            ) : (
              <View style={profileModalStyles.avatarPlaceholder}>
                <User size={32} color={Colors.primary} />
              </View>
            )}
            <Text style={profileModalStyles.name}>{profile.name}</Text>
            <Text style={profileModalStyles.roleLabel}>
              {profile.role === 'executor' ? 'Исполнитель' : 'Клиент'}
            </Text>
          </View>

          <View style={profileModalStyles.statsRow}>
            <View style={profileModalStyles.statItem}>
              <View style={profileModalStyles.starsRow}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    size={16}
                    color={i < starsCount ? '#FBBF24' : 'rgba(255,255,255,0.15)'}
                    fill={i < starsCount ? '#FBBF24' : 'transparent'}
                  />
                ))}
              </View>
              <Text style={profileModalStyles.statValue}>{ratingStr}</Text>
              <Text style={profileModalStyles.statLabel}>
                {profile.ratingCount ? `${profile.ratingCount} оценок` : 'Нет оценок'}
              </Text>
            </View>

            <View style={profileModalStyles.statDivider} />

            <View style={profileModalStyles.statItem}>
              <Text style={profileModalStyles.statBigValue}>{profile.ordersCount ?? 0}</Text>
              <Text style={profileModalStyles.statLabel}>
                {profile.role === 'executor' ? 'Выполнено' : 'Заказов'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={profileModalStyles.closeButton} onPress={onClose} activeOpacity={0.8}>
            <Text style={profileModalStyles.closeButtonText}>Закрыть</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const profileModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.3)',
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderWidth: 3,
    borderColor: 'rgba(22,163,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  roleLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '600' as const,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.borderLight,
    marginHorizontal: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: '#FBBF24',
  },
  statBigValue: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  closeButton: {
    marginTop: 20,
    backgroundColor: Colors.primaryDark,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const hoursArr = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minutesArr = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getMonthLabel(d: Date): string {
  return d.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function getCalendarDays(d: Date): Array<number | null> {
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leading = (firstDay.getDay() + 6) % 7;
  const days: Array<number | null> = [];
  for (let i = 0; i < leading; i += 1) days.push(null);
  for (let day = 1; day <= lastDay.getDate(); day += 1) days.push(day);
  return days;
}

const paymentLabels: Record<string, string> = {
  cash: 'Наличные',
  transfer: 'Перевод',
  online: 'Онлайн',
};





type RequestChatComposerProps = {
  value: string;
  onChangeText: (v: string) => void;
  onSend: () => void;
  canSend: boolean;
  isSending: boolean;
  inputStyle: any;
  onFocusScroll: () => void;
};

const RequestChatComposer = React.memo(function RequestChatComposer({
  value,
  onChangeText,
  onSend,
  canSend,
  isSending,
  inputStyle,
  onFocusScroll,
}: RequestChatComposerProps) {
  return (
    <>
      <TextInput
        {...chatComposerProps}
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        placeholder="Написать сообщение"
        placeholderTextColor={Colors.textMuted}
        testID="request-chat-input"
        onFocus={onFocusScroll}
        multiline
      />
      <AnimatedActionButton
        label="Отправить сообщение"
        onPress={onSend}
        icon={<MessageCircle size={18} color={Colors.white} />}
        disabled={!canSend}
        loading={isSending}
        testID="send-request-chat-message"
      />
    </>
  );
});

export default function RequestDetailsScreen() {
  const { id, adminMode } = useLocalSearchParams<{ id: string; adminMode?: string }>();
  const isAdminMode = adminMode === 'true';
  const router = useRouter();
  const {
    requests,
    updateStatus,
    proposeConditions,
    acceptProposal,
    declineProposal,
    completeRequest,
    rateRequestParticipants,
    ignoreRequest,
    refetch,
    mutationLoading,
  } = useRequests();
  const { getOrCreateRequestChat, sendMessage, markChatAsRead, isSendingMessage } = useChats();
  const { user, role } = useAuth();
  const floatingHeaderHeight = useFloatingHeaderHeight();

  const [proposalPrice, setProposalPrice] = React.useState<string>('');
  const [proposalDate, setProposalDate] = React.useState<string>('');
  const [proposalTime, setProposalTime] = React.useState<string>('');
  const [proposalText, setProposalText] = React.useState<string>('');
  const [showProposalModal, setShowProposalModal] = React.useState<boolean>(false);
  const [showProposalDateModal, setShowProposalDateModal] = React.useState<boolean>(false);
  const [showProposalTimeModal, setShowProposalTimeModal] = React.useState<boolean>(false);
  const [proposalVisibleMonth, setProposalVisibleMonth] = React.useState<Date>(new Date());
  const [proposalSelectedHour, setProposalSelectedHour] = React.useState<string>('10');
  const [proposalSelectedMinute, setProposalSelectedMinute] = React.useState<string>('00');
  const [photoViewerVisible, setPhotoViewerVisible] = React.useState<boolean>(false);
  const [photoViewerIndex, setPhotoViewerIndex] = React.useState<number>(0);
  const [photoViewerPhotos, setPhotoViewerPhotos] = React.useState<string[]>([]);
  const proposalHourScrollRef = React.useRef<ScrollView>(null);
  const proposalMinuteScrollRef = React.useRef<ScrollView>(null);
  const mainScrollRef = React.useRef<ScrollView>(null);
  const [chatMessage, setChatMessage] = React.useState<string>('');
  const [selectedProposalId, setSelectedProposalId] = React.useState<string | null>(null);
  const [showRatingModal, setShowRatingModal] = React.useState<boolean>(false);
  const [ratingSubmitted, setRatingSubmitted] = React.useState<boolean>(false);
  const [completionPhotos, setCompletionPhotos] = React.useState<string[]>([]);
  const [completionPhotoBusy, setCompletionPhotoBusy] = React.useState<boolean>(false);
  const [chatId, setChatId] = React.useState<string | null>(null);
  const [chatLoading, setChatLoading] = React.useState<boolean>(false);
  const [ratingSubmitting, setRatingSubmitting] = React.useState<boolean>(false);
  const [showPaymentModal, setShowPaymentModal] = React.useState<boolean>(false);
  const [isPaidChecked, setIsPaidChecked] = React.useState<boolean>(false);
  const [showProposalWarning, setShowProposalWarning] = React.useState<boolean>(false);
  const [proposalWarningAcknowledged, setProposalWarningAcknowledged] = React.useState<boolean>(false);
  const [pendingProposalAction, setPendingProposalAction] = React.useState<'own' | 'accept' | null>(null);

  const [refreshing, setRefreshing] = React.useState<boolean>(false);
  const [localAcceptingProposal, setLocalAcceptingProposal] = React.useState<string | null>(null);
  const [localCompleting, setLocalCompleting] = React.useState<boolean>(false);
  const [localProposing, setLocalProposing] = React.useState<boolean>(false);
  const [localDeclining, setLocalDeclining] = React.useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = React.useState<boolean>(false);
  const [profileModalData, _setProfileModalData] = React.useState<ProfileInfo | null>(null);
  const initializedRef = React.useRef<string | null>(null);
  const chatKeyRef = React.useRef<string | null>(null);
  const markedReadRef = React.useRef<string | null>(null);

  const localRequest = React.useMemo(() => requests.find((item) => item.id === id), [id, requests]);

  const freshQuery = trpc.requests.getById.useQuery(
    { id: id ?? '' },
    {
      enabled: !!id,
      staleTime: 5_000,
      refetchInterval: 15_000,
      refetchOnMount: true,
    }
  );

  const request = React.useMemo(() => {
    const fresh = freshQuery.data as unknown as ServiceRequest | undefined;
    if (!localRequest && !fresh) return undefined;
    if (!localRequest && fresh) return fresh;
    if (localRequest && !fresh) return localRequest;
    const base = localRequest!;
    const freshData = fresh!;
    console.log('[RequestDetails] Fresh data - clientAvatar:', freshData.clientAvatar, 'clientRating:', freshData.clientRating, 'executorAvatar:', freshData.executorAvatar, 'executorRating:', freshData.executorRating, 'clientPhone:', freshData.clientPhone, 'executorPhone:', freshData.executorPhone);
    return {
      ...base,
      ...freshData,
      proposals: (freshData.proposals && freshData.proposals.length > 0) ? freshData.proposals : base.proposals,
      status: base.status === 'completed' && freshData.status !== 'completed' ? base.status : freshData.status,
      clientPhone: freshData.clientPhone ?? base.clientPhone ?? null,
      executorPhone: freshData.executorPhone ?? base.executorPhone ?? null,
      clientAvatar: freshData.clientAvatar ?? base.clientAvatar ?? null,
      clientRating: freshData.clientRating ?? base.clientRating ?? null,
      clientRatingCount: freshData.clientRatingCount ?? base.clientRatingCount ?? 0,
      clientRequestsCount: freshData.clientRequestsCount ?? base.clientRequestsCount ?? 0,
      clientName: freshData.clientName ?? base.clientName ?? null,
      executorAvatar: freshData.executorAvatar ?? base.executorAvatar ?? null,
      executorRating: freshData.executorRating ?? base.executorRating ?? null,
      executorRatingCount: freshData.executorRatingCount ?? base.executorRatingCount ?? 0,
      executorCompletedCount: freshData.executorCompletedCount ?? base.executorCompletedCount ?? 0,
      masterName: freshData.masterName ?? base.masterName ?? null,
    };
  }, [localRequest, freshQuery.data]);

  React.useEffect(() => {
    if (!request) return;
    if (initializedRef.current !== request.id) {
      initializedRef.current = request.id;
      setProposalDate(request.date ?? '');
      setProposalTime(request.time ?? '');
      setProposalPrice('');
      setProposalText('');
      if (request.proposals.length > 0) {
        setSelectedProposalId(request.selectedProposalId ?? request.proposals[0]?.id ?? null);
      }
    }
  }, [request]);

  const proposalCalendarDays = React.useMemo(() => getCalendarDays(proposalVisibleMonth), [proposalVisibleMonth]);

  const openProposalDatePicker = React.useCallback(() => {
    if (proposalDate) {
      const parts = proposalDate.split('-');
      if (parts.length === 3) {
        setProposalVisibleMonth(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
      }
    }
    setShowProposalDateModal(true);
  }, [proposalDate]);

  const handleProposalDayPress = React.useCallback((day: number) => {
    const nextDate = new Date(proposalVisibleMonth.getFullYear(), proposalVisibleMonth.getMonth(), day);
    setProposalDate(formatDateStr(nextDate));
    setShowProposalDateModal(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [proposalVisibleMonth]);

  const openProposalTimePicker = React.useCallback(() => {
    const [hour = '10', minute = '00'] = (proposalTime || '10:00').split(':');
    setProposalSelectedHour(hour);
    setProposalSelectedMinute(minute);
    setShowProposalTimeModal(true);
    setTimeout(() => {
      const hourIndex = hoursArr.indexOf(hour);
      const minuteIndex = minutesArr.indexOf(minute);
      proposalHourScrollRef.current?.scrollTo({ y: Math.max(hourIndex, 0) * 44, animated: false });
      proposalMinuteScrollRef.current?.scrollTo({ y: Math.max(minuteIndex, 0) * 44, animated: false });
    }, 40);
  }, [proposalTime]);

  const handleConfirmProposalTime = React.useCallback(() => {
    const nextTime = `${proposalSelectedHour}:${proposalSelectedMinute}`;
    setProposalTime(nextTime);
    setShowProposalTimeModal(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [proposalSelectedHour, proposalSelectedMinute]);

  const photoViewerPanX = React.useRef(new Animated.Value(0)).current;
  const photoViewerPanY = React.useRef(new Animated.Value(0)).current;
  const photoViewerOpacity = React.useRef(new Animated.Value(1)).current;
  const swipeDirection = React.useRef<'none' | 'horizontal' | 'vertical'>('none');
  const photoIndexRef = React.useRef(0);

  React.useEffect(() => {
    photoIndexRef.current = photoViewerIndex;
  }, [photoViewerIndex]);

  const photoViewerPanResponder = React.useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (e, gs) => {
      if (e.nativeEvent.touches.length >= 2) return false;
      return Math.abs(gs.dx) > 14 || Math.abs(gs.dy) > 14;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: () => {
      swipeDirection.current = 'none';
    },
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

  const openPhotoViewer = React.useCallback((photos: string[], index: number) => {
    setPhotoViewerPhotos(photos);
    setPhotoViewerIndex(index);
    photoIndexRef.current = index;
    photoViewerPanX.setValue(0);
    photoViewerPanY.setValue(0);
    photoViewerOpacity.setValue(1);
    setPhotoViewerVisible(true);
  }, [photoViewerPanX, photoViewerPanY, photoViewerOpacity]);

  const serviceCategories = useServiceCategories();
  const category = React.useMemo(() => serviceCategories.find((item) => item.id === request?.categoryId), [request?.categoryId, serviceCategories]);
  const isClientOwner = Boolean(role === 'client' && request?.clientId === user?.id);
  const isAssignedExecutor = Boolean(role === 'executor' && request?.executorId === user?.id);
  const ownProposal = React.useMemo(() => {
    if (!request || !user) return null;
    return request.proposals.find((item) => item.executorId === user.id) ?? null;
  }, [request, user]);
  const trpcUtils = trpc.useUtils();
  const canExecutorOffer = Boolean(role === 'executor' && request?.status === 'new' && user && !isClientOwner && !ownProposal);

  const canClientRateExecutor = Boolean(
    isClientOwner && request?.status === 'completed' && request.executorId && !request.executorRatingByClient
  );
  const canExecutorRateClient = Boolean(
    isAssignedExecutor && request?.status === 'completed' && request.clientId && !request.clientRatingByExecutor
  );
  const showRatingPrompt = !ratingSubmitted && (canClientRateExecutor || canExecutorRateClient);

  const prevStatusRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!request) return;
    prevStatusRef.current = request.status;
  }, [request?.status, request]);

  const sortedProposals = React.useMemo(() => {
    if (!request) return [];
    return [...request.proposals].sort((left, right) => {
      const leftRating = left.executorRating ?? 0;
      const rightRating = right.executorRating ?? 0;
      if (rightRating !== leftRating) return rightRating - leftRating;

      const leftVerified = left.executorIsFullyVerified ? 1 : 0;
      const rightVerified = right.executorIsFullyVerified ? 1 : 0;
      if (leftVerified !== rightVerified) return rightVerified - leftVerified;

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });
  }, [request]);

  const selectedProposal = React.useMemo(() => {
    if (!request) return null;
    if (role === 'executor') return ownProposal;
    return sortedProposals.find((item) => item.id === selectedProposalId) ?? sortedProposals[0] ?? null;
  }, [ownProposal, request, role, selectedProposalId, sortedProposals]);

  const activeChatConfig = React.useMemo(() => {
    if (!request || !user) return null;
    if (role === 'executor') {
      if (!request.clientId || !request.clientName) return null;
      return {
        requestId: request.id,
        chatKey: `${request.id}_${user.id}`,
        participantIds: [user.id, request.clientId],
        participantNames: [user.name, request.clientName],
        title: request.clientName,
      };
    }
    if (!selectedProposal) return null;
    return {
      requestId: request.id,
      chatKey: `${request.id}_${selectedProposal.executorId}`,
      participantIds: [user.id, selectedProposal.executorId],
      participantNames: [user.name, selectedProposal.executorName],
      title: selectedProposal.executorName,
    };
  }, [request, role, selectedProposal, user]);

  React.useEffect(() => {
    if (!activeChatConfig) {
      chatKeyRef.current = null;
      setChatId(null);
      return;
    }
    if (chatKeyRef.current === activeChatConfig.chatKey) return;
    chatKeyRef.current = activeChatConfig.chatKey;
    const currentKey = activeChatConfig.chatKey;

    setChatLoading(true);
    void (async () => {
      try {
        const newChatId = await getOrCreateRequestChat(
          activeChatConfig.requestId,
          activeChatConfig.participantIds,
          activeChatConfig.participantNames
        );
        if (chatKeyRef.current === currentKey && newChatId) {
          setChatId(newChatId);
          console.log('[RequestDetails] Chat created/found:', newChatId);
        }
      } catch (err) {
        console.error('[RequestDetails] Chat creation error:', err);
      } finally {
        setChatLoading(false);
      }
    })();
  }, [activeChatConfig, getOrCreateRequestChat]);

  const backendMessagesQuery = trpc.chats.messages.useQuery(
    { chatId: chatId ?? '' },
    {
      enabled: !!chatId,
      refetchInterval: 5_000,
      staleTime: 2_000,
      refetchOnMount: true,
    }
  );

  const chatMessages: ChatMessage[] = React.useMemo(() => {
    if (backendMessagesQuery.data) {
      return backendMessagesQuery.data as unknown as ChatMessage[];
    }
    return [];
  }, [backendMessagesQuery.data]);

  React.useEffect(() => {
    if (chatId && markedReadRef.current !== chatId) {
      markedReadRef.current = chatId;
      markChatAsRead(chatId);
    }
  }, [chatId, markChatAsRead]);

  const doAcceptClientConditions = React.useCallback(() => {
    if (!request || !user) return;
    const capturedRequest = request;
    const capturedUser = user;
    setTimeout(() => {
      try { Alert.alert(
        'Принять условия клиента?',
        `Вы соглашаетесь на условия:\n${capturedRequest.acceptablePrice ? `Цена: ${capturedRequest.acceptablePrice} ₽` : 'Цена не указана'}\nДата: ${capturedRequest.date ?? 'Не указана'}\nВремя: ${capturedRequest.time ?? 'Не указано'}`,
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Принять',
            onPress: async () => {
              setLocalProposing(true);
              try {
                await proposeConditions(capturedRequest.id, {
                  executorId: capturedUser.id,
                  executorName: capturedUser.name,
                  price: capturedRequest.acceptablePrice ?? '',
                  scheduledDate: capturedRequest.date ?? null,
                  scheduledTime: capturedRequest.time ?? null,
                  conditions: 'Принимаю условия клиента',
                });
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                console.log('[RequestDetailsScreen] Accepted client conditions:', capturedRequest.id, capturedUser.id);
              } catch (err: any) {
                console.error('[RequestDetailsScreen] Accept client conditions failed:', err?.message);
                Alert.alert('Ошибка', err?.message ?? 'Не удалось отправить предложение. Попробуйте ещё раз.');
              } finally {
                setLocalProposing(false);
              }
            },
          },
        ]
      ); } catch (e) { console.log('[RequestDetails] Alert open error:', e); }
    }, 500);
  }, [proposeConditions, request, user]);

  const handleOpenProposalWarning = React.useCallback((action: 'own' | 'accept') => {
    setPendingProposalAction(action);
    setProposalWarningAcknowledged(false);
    setShowProposalWarning(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleConfirmProposalWarning = React.useCallback(() => {
    if (!proposalWarningAcknowledged) return;
    const action = pendingProposalAction;
    setShowProposalWarning(false);
    setPendingProposalAction(null);
    if (action === 'own') {
      if (!request) return;
      setProposalDate(request.date ?? '');
      setProposalTime(request.time ?? '');
      setProposalPrice('');
      setProposalText('');
      setTimeout(() => { setShowProposalModal(true); }, 450);
    } else if (action === 'accept') {
      doAcceptClientConditions();
    }
  }, [proposalWarningAcknowledged, pendingProposalAction, request, doAcceptClientConditions]);

  const handleOpenProposalModal = React.useCallback(() => {
    handleOpenProposalWarning('own');
  }, [handleOpenProposalWarning]);

  const handleSendProposal = React.useCallback(async () => {
    if (!request || !user) return;
    if (!proposalPrice?.trim() || !proposalText?.trim()) {
      Alert.alert('Заполните предложение', 'Нужно указать цену и условия.');
      return;
    }
    setLocalProposing(true);
    try {
      await proposeConditions(request.id, {
        executorId: user.id,
        executorName: user.name,
        price: proposalPrice.trim(),
        scheduledDate: proposalDate?.trim() || null,
        scheduledTime: proposalTime?.trim() || null,
        conditions: proposalText.trim(),
      });
      setShowProposalModal(false);
      setProposalPrice('');
      setProposalDate(request.date ?? '');
      setProposalTime(request.time ?? '');
      setProposalText('');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[RequestDetailsScreen] Proposal submitted:', request.id, user.id);
    } catch (err: any) {
      console.error('[RequestDetailsScreen] Send proposal failed:', err?.message);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось отправить предложение. Попробуйте ещё раз.');
    } finally {
      setLocalProposing(false);
    }
  }, [proposalDate, proposalPrice, proposalText, proposalTime, proposeConditions, request, user]);

  const handleAcceptClientConditions = React.useCallback(() => {
    handleOpenProposalWarning('accept');
  }, [handleOpenProposalWarning]);

  const handleAcceptProposal = React.useCallback(async (proposalId: string) => {
    if (!request || !id) return;
    setLocalAcceptingProposal(proposalId);
    try {
      let realProposalId = proposalId;
      const isOptimisticId = proposalId.includes('_') && !proposalId.includes('-');
      if (isOptimisticId) {
        console.log('[RequestDetails] Optimistic proposal ID detected, refetching...');
        const freshData = await trpcUtils.requests.getById.fetch({ id }, { staleTime: 0 });
        const freshReq = freshData as unknown as ServiceRequest | undefined;
        if (freshReq && freshReq.proposals && freshReq.proposals.length > 0) {
          const matching = freshReq.proposals.find((p) => {
            const origProposal = request.proposals.find((op) => op.id === proposalId);
            return origProposal && p.executorId === origProposal.executorId;
          });
          if (matching) {
            realProposalId = matching.id;
            console.log('[RequestDetails] Resolved optimistic ID to real:', realProposalId);
          }
        }
      }
      await acceptProposal(request.id, realProposalId);
      console.log('[RequestDetailsScreen] Proposal accepted:', request.id, realProposalId);
    } catch (err: any) {
      console.error('[RequestDetailsScreen] Accept proposal failed:', err);
      Alert.alert('Ошибка', err?.message ?? 'Не удалось принять предложение. Попробуйте ещё раз.');
    } finally {
      setLocalAcceptingProposal(null);
    }
  }, [acceptProposal, request, id, trpcUtils]);

  const handleDeclineProposal = React.useCallback((proposalId: string) => {
    if (!request) return;
    Alert.alert('Игнорировать предложение?', 'Исполнитель получит уведомление об отклонении.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Игнорировать',
        style: 'destructive',
        onPress: async () => {
          setLocalDeclining(proposalId);
          try {
            await declineProposal(request.id, proposalId);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            console.log('[RequestDetailsScreen] Proposal declined:', request.id, proposalId);
          } finally {
            setLocalDeclining(null);
          }
        },
      },
    ]);
  }, [declineProposal, request]);

  const handleCompleteRequest = React.useCallback(() => {
    if (!request) return;
    setTimeout(() => {
      try { Alert.alert('Завершить заявку?', 'Подтвердите, что заявка выполнена.', [
        { text: 'Нет', style: 'cancel' },
        {
          text: 'Завершить',
          onPress: () => {
            setIsPaidChecked(false);
            setTimeout(() => { setShowPaymentModal(true); }, 300);
          },
        },
      ]); } catch (e) { console.log('[RequestDetails] Complete alert error:', e); }
    }, 50);
  }, [request]);

  const handlePaymentConfirmAndComplete = React.useCallback(async () => {
    if (!request) return;
    setShowPaymentModal(false);
    setLocalCompleting(true);
    const capturedRequest = request;
    const shouldShowRating = canExecutorRateClient || role === 'executor';
    try {
      let photosToSend: string[] | undefined = completionPhotos.length > 0 ? completionPhotos : undefined;
      if (photosToSend && photosToSend.length > 0) {
        try {
          const resized = await Promise.all(photosToSend.map((u) => resizeForLive(u)));
          photosToSend = await uploadManyToS3(resized, { prefix: 'completions' });
          assertAllAreHttps(photosToSend);
          console.log('[RequestDetailsScreen] Completion photos uploaded:', photosToSend.length);
        } catch (uploadErr: any) {
          console.error('[RequestDetailsScreen] S3 upload error:', uploadErr?.message);
          setLocalCompleting(false);
          setTimeout(() => {
            try { Alert.alert('Ошибка загрузки', 'Не удалось загрузить фото. Проверьте интернет.'); } catch {}
          }, 200);
          return;
        }
      }
      await completeRequest(capturedRequest.id, photosToSend, isPaidChecked);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[RequestDetailsScreen] Request completed:', capturedRequest.id, 'isPaid:', isPaidChecked);
      if (shouldShowRating) {
        setTimeout(() => { setShowRatingModal(true); }, 450);
      }
    } catch (err: any) {
      console.error('[RequestDetailsScreen] Complete request failed:', err?.message);
      setTimeout(() => {
        try { Alert.alert('Ошибка', err?.message ?? 'Не удалось завершить заявку. Попробуйте ещё раз.'); } catch {}
      }, 350);
    } finally {
      setLocalCompleting(false);
    }
  }, [completeRequest, completionPhotos, request, canExecutorRateClient, role, isPaidChecked]);

  const [showCompletionPhotoSheet, setShowCompletionPhotoSheet] = React.useState<boolean>(false);

  const handleCompletionPhotoFromSource = React.useCallback(async (src: 'camera' | 'gallery') => {
    setCompletionPhotoBusy(true);
    try {
      const isAndroid = Platform.OS === 'android';
      const uris = await pickPhotos(src, {
        multiple: src === 'gallery',
        selectionLimit: isAndroid ? 2 : 3,
        maxEdge: isAndroid ? 800 : 1200,
        maxBytes: isAndroid ? 400 * 1024 : 900 * 1024,
        quality: isAndroid ? 0.4 : 0.5,
      });
      if (!uris) return;
      if (uris.length === 0) {
        Alert.alert('Внимание', 'Не удалось обработать фото. Попробуйте ещё раз.');
        return;
      }
      setCompletionPhotos((prev) => [...prev, ...uris].slice(0, 10));
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } finally {
      setCompletionPhotoBusy(false);
    }
  }, []);

  const handlePickCompletionPhoto = React.useCallback(() => {
    setShowCompletionPhotoSheet(true);
  }, []);

  const handleRatingSubmit = React.useCallback((rating: number, review: string) => {
    if (!request) return;
    setRatingSubmitting(true);
    if (canClientRateExecutor) {
      rateRequestParticipants(request.id, {
        executorRatingByClient: rating,
        executorReviewByClient: review || undefined,
      });
    } else if (canExecutorRateClient) {
      rateRequestParticipants(request.id, {
        clientRatingByExecutor: rating,
        clientReviewByExecutor: review || undefined,
      });
    }
    setTimeout(() => {
      setRatingSubmitting(false);
      setShowRatingModal(false);
      setRatingSubmitted(true);
    }, 2000);
  }, [canClientRateExecutor, canExecutorRateClient, rateRequestParticipants, request]);

  const composerInputStyle = React.useMemo(() => [styles.input, styles.chatInput], []);
  const handleComposerFocus = React.useCallback(() => {
    setTimeout(() => { mainScrollRef.current?.scrollToEnd({ animated: true }); }, 300);
  }, []);

  const handleSendChatMessage = React.useCallback(() => {
    if (!chatId || !user || !chatMessage.trim()) return;
    sendMessage(chatId, user.id, user.name, user.role, chatMessage.trim());
    setChatMessage('');
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => {
      void backendMessagesQuery.refetch();
    }, 150);
  }, [chatId, chatMessage, sendMessage, user, backendMessagesQuery]);

  const handleOpenFullChat = React.useCallback(() => {
    if (!chatId) return;
    router.push({ pathname: '/chat-room', params: { chatId } });
  }, [chatId, router]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
      console.log('[RequestDetails] Refreshed');
    } catch (err) {
      console.error('[RequestDetails] Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const { refreshControl: detailRefreshControl } = useMRefreshControl(refreshing, handleRefresh);

  const openClientProfile = React.useCallback(() => {
    if (!request || !request.clientId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/public-profile', params: { userId: request.clientId, requestId: request.id } });
  }, [request, router]);

  const openExecutorProfile = React.useCallback((proposal: RequestProposal) => {
    if (!request) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/public-profile', params: { userId: proposal.executorId, requestId: request.id } });
  }, [request, router]);

  const openAssignedExecutorProfile = React.useCallback(() => {
    if (!request || !request.executorId) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/public-profile', params: { userId: request.executorId, requestId: request.id } });
  }, [request, router]);

  const handleIgnore = React.useCallback(() => {
    if (!request || !user) return;
    Alert.alert('Удалить заявку?', 'Заявка будет безвозвратно удалена из вашего списка. Вы больше не увидите её.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: () => {
          ignoreRequest(request.id, user.id);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          router.back();
        },
      },
    ]);
  }, [request, user, ignoreRequest, router]);

  const handleCancel = React.useCallback(() => {
    if (!request) return;
    Alert.alert('Отменить заявку?', 'Вы уверены, что хотите отменить эту заявку?', [
      { text: 'Нет', style: 'cancel' },
      {
        text: 'Отменить',
        style: 'destructive',
        onPress: async () => {
          try {
            await updateStatus(request.id, 'cancelled');
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            router.back();
          } catch (e) {
            console.log('[RequestDetails] Cancel error:', e);
            Alert.alert('Ошибка', 'Не удалось отменить заявку');
          }
        },
      },
    ]);
  }, [request, updateStatus, router]);

  const _isExecutorWithProposal = Boolean(role === 'executor' && ownProposal);
  const canShowPhoneButton = Boolean(
    request && (request.status === 'in_progress' || request.status === 'completed') && (isClientOwner || isAssignedExecutor)
  );

  const [phoneLoading, setPhoneLoading] = React.useState<boolean>(false);

  const handlePhoneCall = React.useCallback(async () => {
    if (!id || !request) return;
    let phone: string | null = null;

    console.log('[RequestDetails] handlePhoneCall - isClientOwner:', isClientOwner, 'isAssignedExecutor:', isAssignedExecutor);

    setPhoneLoading(true);
    try {
      const localClientPh = request.clientPhone ?? null;
      const localExecutorPh = request.executorPhone ?? null;
      if (isClientOwner && localExecutorPh) phone = localExecutorPh;
      if (isAssignedExecutor && localClientPh) phone = localClientPh;
      console.log('[RequestDetails] Local data - clientPhone:', localClientPh, 'executorPhone:', localExecutorPh);

      if (!phone) {
        try {
          const result = await trpcUtils.requests.getPhone.fetch({ requestId: id }, { staleTime: 0 });
          console.log('[RequestDetails] getPhone result:', JSON.stringify(result));
          if (result) {
            if (isClientOwner && result.executorPhone) phone = result.executorPhone;
            if (isAssignedExecutor && result.clientPhone) phone = result.clientPhone;
          }
        } catch (err) {
          console.error('[RequestDetails] getPhone fetch failed:', err);
        }
      }

      if (!phone) {
        console.log('[RequestDetails] No phone found, refetching request details...');
        try {
          const freshData = await trpcUtils.requests.getById.fetch({ id }, { staleTime: 0 });
          const freshReq = freshData as unknown as ServiceRequest | undefined;
          if (freshReq) {
            if (isClientOwner && freshReq.executorPhone) phone = freshReq.executorPhone;
            if (isAssignedExecutor && freshReq.clientPhone) phone = freshReq.clientPhone;
            console.log('[RequestDetails] From fresh getById - clientPhone:', freshReq.clientPhone, 'executorPhone:', freshReq.executorPhone);
          }
        } catch (err) {
          console.error('[RequestDetails] Fresh getById failed:', err);
        }
      }
    } finally {
      setPhoneLoading(false);
    }

    if (!phone) {
      Alert.alert('Номер недоступен', 'Номер телефона не указан в профиле контрагента. Попросите его добавить номер в настройках профиля.');
      return;
    }
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('8') && cleaned.length === 11) {
      cleaned = '+7' + cleaned.substring(1);
    }
    const url = `tel:${cleaned}`;
    console.log('[RequestDetails] Calling:', cleaned);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Linking.openURL(url).catch(() => {
      Alert.alert('Ошибка', 'Не удалось открыть приложение для звонка.');
    });
  }, [id, request, isClientOwner, isAssignedExecutor, trpcUtils]);

  if (!request) {
    return (
      <View style={styles.notFound}>
        <Text style={styles.notFoundText}>Заявка не найдена</Text>
      </View>
    );
  }


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <FloatingHeader showBack title="Детали заявки" />
      <ScrollView
        ref={mainScrollRef}
        contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
        showsVerticalScrollIndicator={false}
        refreshControl={detailRefreshControl}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerCard}>
          <View style={[styles.categoryIcon, { backgroundColor: category?.bgColor ?? Colors.primaryLight }]}>
            <ServiceIcon name={category?.icon ?? 'Wrench'} size={32} color={category?.color ?? Colors.primary} />
          </View>
          <Text style={styles.title}>{request.categoryName}</Text>
          {request.isUrgent ? (
            <View style={styles.urgentBadge}>
              <Zap size={14} color="#FFFFFF" fill="#FFFFFF" />
              <Text style={styles.urgentBadgeText}>Срочная — в ближайшее время</Text>
            </View>
          ) : null}
          {request.isPaid === false && request.status === 'completed' ? (
            <View style={styles.unpaidBadge}>
              <AlertCircle size={14} color={Colors.danger} />
              <Text style={styles.unpaidBadgeText}>Не оплачена клиентом</Text>
            </View>
          ) : null}
          <StatusBadge status={request.status} />
        </View>

        {request.description && !(role === 'executor' && request.status === 'new') ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Описание</Text>
            <View style={styles.cardBlock}>
              <Text style={styles.descriptionText}>{request.description}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Детали</Text>
          <View style={styles.cardBlock}>
            <View style={styles.detailRow}>
              <MapPin size={18} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Адрес</Text>
                <Text style={styles.detailValue}>{request.address}</Text>
                {role === 'executor' && request.address ? (
                  <View style={styles.routeLinksContainer}>
                    <TouchableOpacity
                      onPress={() => {
                        const query = encodeURIComponent([request.city, request.address].filter(Boolean).join(', '));
                        const appUrl = `dgis://2gis.ru/search/${query}`;
                        const webUrl = `https://2gis.ru/search/${query}`;
                        void Haptics.selectionAsync();
                        console.log('[RequestDetails] Open 2GIS route:', webUrl);
                        Linking.canOpenURL(appUrl).then((supported) => {
                          const target = supported ? appUrl : webUrl;
                          Linking.openURL(target).catch(() => {
                            Linking.openURL(webUrl).catch(() => {
                              Alert.alert('Ошибка', 'Не удалось открыть 2GIS');
                            });
                          });
                        }).catch(() => {
                          Linking.openURL(webUrl).catch(() => {
                            Alert.alert('Ошибка', 'Не удалось открыть 2GIS');
                          });
                        });
                      }}
                      activeOpacity={0.7}
                      style={styles.routeLinkButton}
                      testID="open-2gis-route"
                    >
                      <Navigation size={14} color={Colors.primary} />
                      <Text style={styles.routeLinkText}>Как проехать (2GIS)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        const yandexAddr = formatAddressForYandex(request.city ?? '', request.address ?? '');
                        void Haptics.selectionAsync();
                        console.log('[RequestDetails] Open Yandex Taxi for:', yandexAddr);
                        const trackingId = '1178268795219780156';
                        try {
                          await Clipboard.setStringAsync(yandexAddr);
                        } catch (err) {
                          console.log('[RequestDetails] Clipboard error:', err);
                        }
                        const openTaxi = async () => {
                          const appUrl = `yandextaxi://?appmetrica_tracking_id=${trackingId}`;
                          const webUrl = `https://3.redirect.appmetrica.yandex.com/route?appmetrica_tracking_id=${trackingId}`;
                          const supported = await Linking.canOpenURL(appUrl).catch(() => false);
                          if (supported) {
                            await Linking.openURL(appUrl);
                            return;
                          }
                          await Linking.openURL(webUrl);
                        };
                        Alert.alert(
                          'Адрес скопирован',
                          `Адрес "${yandexAddr}" скопирован в буфер обмена. Вставьте его в поле "Куда" в Яндекс Такси.`,
                          [
                            { text: 'Отмена', style: 'cancel' },
                            {
                              text: 'Открыть Такси',
                              onPress: () => {
                                openTaxi().catch((e) => {
                                  console.log('[RequestDetails] Yandex Taxi error:', e);
                                  Alert.alert('Ошибка', 'Не удалось открыть Яндекс Такси');
                                });
                              },
                            },
                          ]
                        );
                      }}
                      activeOpacity={0.7}
                      style={styles.routeLinkButton}
                      testID="open-yandex-taxi"
                    >
                      <Car size={14} color={Colors.primary} />
                      <Text style={styles.routeLinkText}>Заказать Яндекс Такси</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.detailRow}>
              <Calendar size={18} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Дата</Text>
                <Text style={styles.detailValue}>{request.date}</Text>
              </View>
            </View>
            <View style={styles.detailRow}>
              <Clock size={18} color={Colors.primary} />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Время</Text>
                <Text style={styles.detailValue}>{request.isUrgent ? 'В ближайшее время' : request.time}</Text>
              </View>
            </View>
            {request.createdAt ? (
              <View style={styles.detailRow}>
                <Clock size={18} color={Colors.textMuted} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Размещено</Text>
                  <Text style={styles.detailValue}>
                    {formatCreatedAtInCityTz(request.createdAt, request.city)}
                    {getTimezoneAbbr(request.city) ? ` (${getTimezoneAbbr(request.city)})` : ''}
                  </Text>
                </View>
              </View>
            ) : null}
            {request.acceptablePrice ? (
              <View style={styles.detailRow}>
                <Wallet size={18} color={Colors.accent} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Приемлемая цена</Text>
                  <Text style={styles.detailValue}>{request.acceptablePrice}</Text>
                </View>
              </View>
            ) : null}
            {request.paymentMethod ? (
              <View style={styles.detailRow}>
                <CreditCard size={18} color={Colors.info} />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Способ оплаты</Text>
                  <Text style={styles.detailValue}>{paymentLabels[request.paymentMethod] ?? request.paymentMethod}</Text>
                </View>
              </View>
            ) : null}
            {request.clientName && !isClientOwner ? (
              <TouchableOpacity style={styles.detailRow} onPress={openClientProfile} activeOpacity={0.7}>
                {request.clientAvatar ? (
                  <Image source={{ uri: request.clientAvatar }} style={styles.clientAvatarSmall} />
                ) : (
                  <View style={styles.clientAvatarPlaceholder}>
                    <User size={16} color={Colors.primary} />
                  </View>
                )}
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Клиент</Text>
                  <Text style={[styles.detailValue, styles.detailValueLink]}>{request.clientName}</Text>
                  <Text style={styles.detailSubValue}>
                    Рейтинг: {request.clientRating != null ? Number(request.clientRating).toFixed(1) : '—'} · Заказов: {request.clientRequestsCount ?? 0}
                  </Text>
                </View>
                <ChevronRight size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            {isClientOwner && request.executorId && request.masterName ? (
              <TouchableOpacity style={styles.detailRow} onPress={openAssignedExecutorProfile} activeOpacity={0.7}>
                {request.executorAvatar ? (
                  <Image source={{ uri: request.executorAvatar }} style={styles.clientAvatarSmall} />
                ) : (
                  <View style={styles.clientAvatarPlaceholder}>
                    <User size={16} color={Colors.info} />
                  </View>
                )}
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Исполнитель</Text>
                  <View style={styles.offerNameRow}>
                    <Text style={[styles.detailValue, styles.detailValueLink]}>{request.masterName}</Text>
                    {request.executorIsFullyVerified ? <VerifiedBadge size="small" /> : null}
                  </View>
                  <Text style={styles.detailSubValue}>
                    Рейтинг: {request.executorRating != null ? Number(request.executorRating).toFixed(1) : '—'} · Выполнено: {request.executorCompletedCount ?? 0}
                  </Text>
                </View>
                <ChevronRight size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {canShowPhoneButton ? (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.phoneCallButton}
              onPress={handlePhoneCall}
              activeOpacity={0.8}
              disabled={phoneLoading}
              testID="phone-call-button"
            >
              {phoneLoading ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Phone size={20} color={Colors.white} />
              )}
              <Text style={styles.phoneCallButtonText}>
                {isClientOwner ? 'Позвонить исполнителю' : 'Позвонить клиенту'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {request.status === 'new' ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Предложения исполнителей</Text>

            {role === 'executor' ? (
              <>
                <View style={styles.executorUnifiedCard}>
                  {request.clientName ? (
                    <TouchableOpacity style={styles.executorClientInfoRow} onPress={openClientProfile} activeOpacity={0.7}>
                      {request.clientAvatar ? (
                        <Image source={{ uri: request.clientAvatar }} style={styles.executorClientAvatar} />
                      ) : (
                        <View style={styles.executorClientAvatarPlaceholder}>
                          <User size={20} color={Colors.primary} />
                        </View>
                      )}
                      <View style={styles.executorClientInfoText}>
                        <Text style={styles.executorClientName}>{request.clientName}</Text>
                        <View style={styles.executorClientStatsRow}>
                          <Star size={13} color="#FBBF24" fill="#FBBF24" />
                          <Text style={styles.executorClientRating}>
                            {request.clientRating != null ? Number(request.clientRating).toFixed(1) : '—'}
                          </Text>
                          <Text style={styles.executorClientOrders}>
                            · Заказов: {request.clientRequestsCount ?? 0}
                          </Text>
                        </View>
                      </View>
                      <ChevronRight size={16} color={Colors.textMuted} />
                    </TouchableOpacity>
                  ) : null}

                  {request.description ? (
                    <View style={styles.unifiedDescriptionBlock}>
                      <Text style={styles.unifiedDescriptionLabel}>Описание</Text>
                      <Text style={styles.descriptionText}>{request.description}</Text>
                    </View>
                  ) : null}

                  <View style={styles.unifiedProposalCountRow}>
                    <FileText size={18} color={Colors.info} />
                    <Text style={styles.proposalCountText}>
                      Откликов на заявку: {request.proposalCount ?? request.proposals.length}
                    </Text>
                  </View>

                  {ownProposal ? (
                    <View style={styles.unifiedOwnProposalBlock}>
                      <Text style={styles.sectionInnerTitle}>Ваше предложение</Text>
                      <View style={styles.offerMetaGrid}>
                        <View style={styles.offerPriceRow}>
                          <Wallet size={18} color={Colors.accent} />
                          <Text style={styles.offerPriceText}>{ownProposal.price ? `${ownProposal.price} ₽` : 'По договорённости'}</Text>
                        </View>
                        <View style={styles.offerMetaRow}>
                          {ownProposal.scheduledDate ? (
                            <View style={styles.offerMetaChip}>
                              <Calendar size={14} color={Colors.primary} />
                              <Text style={styles.offerMetaChipText}>{ownProposal.scheduledDate}</Text>
                            </View>
                          ) : null}
                          {ownProposal.scheduledTime ? (
                            <View style={styles.offerMetaChip}>
                              <Clock size={14} color={Colors.primary} />
                              <Text style={styles.offerMetaChipText}>{ownProposal.scheduledTime}</Text>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {ownProposal.conditions ? (
                        <View style={styles.offerConditionsWrap}>
                          <Text style={styles.offerConditionsLabel}>Комментарий:</Text>
                          <Text style={styles.offerConditions}>{ownProposal.conditions}</Text>
                        </View>
                      ) : null}
                      <StatusBadge status={ownProposal.status === 'accepted' ? 'in_progress' : ownProposal.status === 'declined' ? 'cancelled' : 'new'} />
                    </View>
                  ) : null}

                  {canExecutorOffer ? (
                    <View style={styles.unifiedExecutorActions}>
                      <TouchableOpacity
                        style={styles.acceptClientButton}
                        onPress={handleAcceptClientConditions}
                        activeOpacity={0.8}
                        disabled={localProposing}
                        testID="accept-client-conditions"
                      >
                        {localProposing ? (
                          <MLoader size="small" color={Colors.white} />
                        ) : (
                          <>
                            <CheckCircle size={20} color={Colors.white} />
                            <Text style={styles.acceptClientButtonText}>Принять условия</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.proposeOwnButton}
                        onPress={handleOpenProposalModal}
                        activeOpacity={0.8}
                        testID="open-proposal-modal"
                      >
                        <FileText size={18} color={Colors.primary} />
                        <Text style={styles.proposeOwnButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Предложить свои</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                {sortedProposals.length > 0 ? (
                  <View style={styles.proposalsList}>
                    {sortedProposals.map((proposal) => {
                      const ratingDisplay = proposal.executorRating ? String(Number(proposal.executorRating).toFixed(1)) : null;
                      const selected = proposal.id === selectedProposal?.id;
                      return (
                        <View key={proposal.id} style={[styles.offerCard, selected && styles.offerCardSelected]}>
                          <TouchableOpacity style={styles.offerTopRow} onPress={() => openExecutorProfile(proposal)} activeOpacity={0.7}>
                            <View style={styles.offerAvatarWrap}>
                              {proposal.executorAvatar ? (
                                <Image source={{ uri: proposal.executorAvatar }} style={styles.offerAvatarImage} />
                              ) : (
                                <View style={styles.offerAvatarCircle}>
                                  <User size={20} color={Colors.info} />
                                </View>
                              )}
                              {ratingDisplay ? (
                                <View style={styles.offerRatingBadge}>
                                  <Star size={10} color="#FBBF24" fill="#FBBF24" />
                                  <Text style={styles.offerRatingBadgeText}>{ratingDisplay}</Text>
                                </View>
                              ) : null}
                            </View>
                            <View style={styles.offerPersonWrap}>
                              <View style={styles.offerNameRow}>
                                <Text style={[styles.offerName, styles.detailValueLink]}>{proposal.executorName}</Text>
                                {proposal.executorIsFullyVerified ? <VerifiedBadge size="small" /> : null}
                              </View>
                              <Text style={styles.offerRating}>
                                {ratingDisplay ? `Рейтинг ${ratingDisplay}` : 'Новый исполнитель'}
                                {proposal.executorCompletedCount ? ` · ${proposal.executorCompletedCount} выполнено` : ''}
                              </Text>
                            </View>
                            <View style={styles.offerTopRightCol}>
                              <StatusBadge status={proposal.status === 'accepted' ? 'in_progress' : request.status} />
                              <ChevronRight size={14} color={Colors.textMuted} style={{ marginTop: 4 }} />
                            </View>
                          </TouchableOpacity>

                          <View style={styles.offerMetaGrid}>
                            <View style={styles.offerPriceRow}>
                              <Wallet size={18} color={Colors.accent} />
                              <Text style={styles.offerPriceText}>{proposal.price ? `${proposal.price} ₽` : 'По договорённости'}</Text>
                            </View>
                            <View style={styles.offerMetaRow}>
                              {proposal.scheduledDate ? (
                                <View style={styles.offerMetaChip}>
                                  <Calendar size={14} color={Colors.primary} />
                                  <Text style={styles.offerMetaChipText}>{proposal.scheduledDate}</Text>
                                </View>
                              ) : null}
                              {proposal.scheduledTime ? (
                                <View style={styles.offerMetaChip}>
                                  <Clock size={14} color={Colors.primary} />
                                  <Text style={styles.offerMetaChipText}>{proposal.scheduledTime}</Text>
                                </View>
                              ) : null}
                            </View>
                          </View>

                          {proposal.conditions ? (
                            <View style={styles.offerConditionsWrap}>
                              <Text style={styles.offerConditionsLabel}>Комментарий:</Text>
                              <Text style={styles.offerConditions}>{proposal.conditions}</Text>
                            </View>
                          ) : null}
                          <View style={styles.offerActions}>
                            <AnimatedActionButton
                              label={selected ? 'Чат открыт ниже' : 'Открыть чат'}
                              onPress={() => setSelectedProposalId(proposal.id)}
                              variant="secondary"
                              style={styles.offerActionButton}
                              testID={`open-proposal-chat-${proposal.id}`}
                            />
                            {isClientOwner && request.status === 'new' && proposal.status !== 'accepted' && proposal.status !== 'declined' ? (
                              <View style={styles.offerActionsRow}>
                                <AnimatedActionButton
                                  label="Принять условия"
                                  onPress={() => {
                                    void handleAcceptProposal(proposal.id);
                                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  }}
                                  icon={<CheckCircle size={18} color={Colors.white} />}
                                  style={styles.offerActionButtonFlex}
                                  loading={localAcceptingProposal === proposal.id}
                                  testID={`accept-proposal-${proposal.id}`}
                                />
                                <TouchableOpacity
                                  style={styles.declineProposalButton}
                                  onPress={() => handleDeclineProposal(proposal.id)}
                                  activeOpacity={0.7}
                                  disabled={localDeclining === proposal.id}
                                  testID={`decline-proposal-${proposal.id}`}
                                >
                                  {localDeclining === proposal.id ? (
                                    <MLoader size="small" color={Colors.danger} />
                                  ) : (
                                    <>
                                      <XCircle size={16} color={Colors.danger} />
                                      <Text style={styles.declineProposalText}>Игнорировать</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            {isClientOwner && proposal.status === 'declined' ? (
                              <View style={styles.declinedBadge}>
                                <Text style={styles.declinedBadgeText}>Отклонено</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.cardBlock}>
                    <Text style={styles.emptyText}>Пока нет предложений. Когда исполнитель отправит цену, дату, время и условия, они появятся здесь списком.</Text>
                  </View>
                )}
              </>
            )}

          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.chatSectionHeader}>
            <Text style={styles.sectionTitle}>Чат в заявке</Text>
            {chatId ? (
              <TouchableOpacity onPress={handleOpenFullChat} activeOpacity={0.7}>
                <Text style={styles.openFullChatLink}>Открыть полный чат</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.cardBlock}>
            {chatLoading ? (
              <View style={styles.chatLoadingContainer}>
                <MLoader size="small" />
                <Text style={styles.chatLoadingText}>Загрузка чата...</Text>
              </View>
            ) : (
              <>
                <Text style={styles.chatTitle}>
                  {activeChatConfig ? `Чат с ${activeChatConfig.title}` : 'Чат появится после первого отклика исполнителя'}
                </Text>
                {chatMessages.length > 0 ? (
                  <View style={styles.messagesList}>
                    {chatMessages.slice(-8).map((message) => {
                      const isOwn = message.senderId === user?.id;
                      return (
                        <View key={message.id} style={[styles.messageBubble, isOwn ? styles.messageOwn : styles.messageOther]}>
                          <Text style={styles.messageAuthor}>{message.senderName}</Text>
                          <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>{message.text}</Text>
                        </View>
                      );
                    })}
                  </View>
                ) : chatId ? (
                  <Text style={styles.emptyText}>Начните переписку прямо внутри этой заявки.</Text>
                ) : (
                  <Text style={styles.emptyText}>Чат станет доступен после отклика исполнителя.</Text>
                )}
                <RequestChatComposer
                  value={chatMessage}
                  onChangeText={setChatMessage}
                  onSend={handleSendChatMessage}
                  canSend={Boolean(chatId) && chatMessage.trim().length > 0}
                  isSending={isSendingMessage}
                  inputStyle={composerInputStyle}
                  onFocusScroll={handleComposerFocus}
                />
              </>
            )}
          </View>
        </View>

        {showRatingPrompt ? (
          <View style={styles.section}>
            <View style={styles.ratingPromptCard}>
              <Star size={24} color={Colors.accent} fill={Colors.accent} />
              <Text style={styles.ratingPromptTitle}>Заявка выполнена!</Text>
              <Text style={styles.ratingPromptText}>
                {canClientRateExecutor
                  ? 'Оцените работу исполнителя и оставьте отзыв'
                  : 'Оцените клиента и оставьте отзыв'}
              </Text>
              <AnimatedActionButton
                label="Поставить оценку"
                onPress={() => setShowRatingModal(true)}
                icon={<Star size={16} color={Colors.white} />}
                loading={mutationLoading.rating}
                testID="open-rating-modal"
              />
            </View>
          </View>
        ) : null}

        {(request.executorRatingByClient || request.clientRatingByExecutor) ? (
          <View style={styles.section}>
            <View style={styles.cardBlock}>
              <Text style={styles.ratingDoneLabel}>Оценки отправлены</Text>
              <Text style={styles.ratingAnonNote}>Оценки анонимны. Вы можете видеть только свой средний балл в профиле.</Text>
            </View>
          </View>
        ) : null}

        {request.completionPhotos && request.completionPhotos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Фото выполненной работы</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
              {request.completionPhotos.map((uri, idx) => (
                <TouchableOpacity
                  key={`completion-${idx}`}
                  activeOpacity={0.85}
                  onPress={() => openPhotoViewer(request.completionPhotos!, idx)}
                >
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <View style={styles.zoomIconOverlay}>
                    <ZoomIn size={14} color={Colors.white} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {request.attachments && request.attachments.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Прикреплённые фото</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
              {request.attachments.map((uri, idx) => (
                <TouchableOpacity
                  key={`attach-${idx}`}
                  activeOpacity={0.85}
                  onPress={() => openPhotoViewer(request.attachments!, idx)}
                >
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <View style={styles.zoomIconOverlay}>
                    <ZoomIn size={14} color={Colors.white} />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          {isAssignedExecutor && request.status === 'in_progress' ? (
            <View style={styles.completionBlock}>
              {completionPhotos.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll}>
                  {completionPhotos.map((uri, idx) => (
                    <TouchableOpacity
                      key={`comp-${idx}`}
                      activeOpacity={0.85}
                      onPress={() => openPhotoViewer(completionPhotos, idx)}
                    >
                      <Image source={{ uri }} style={styles.photoThumb} />
                      <View style={styles.zoomIconOverlay}>
                        <ZoomIn size={14} color={Colors.white} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : null}
              <TouchableOpacity
                style={[styles.addPhotoButton, completionPhotoBusy ? { opacity: 0.55 } : null]}
                onPress={handlePickCompletionPhoto}
                activeOpacity={0.8}
                disabled={completionPhotoBusy || localCompleting}
                testID="add-completion-photo"
              >
                <Camera size={18} color={Colors.primary} />
                <Text style={styles.addPhotoText}>Прикрепить фото выполненной работы</Text>
              </TouchableOpacity>
              <AnimatedActionButton
                label="Заявка выполнена"
                onPress={handleCompleteRequest}
                icon={<CheckCircle size={18} color={Colors.white} />}
                loading={localCompleting}
                testID="complete-request-button"
              />
            </View>
          ) : null}

          {role === 'executor' && request.status === 'new' && !isAssignedExecutor ? (
            <AnimatedActionButton
              label="Удалить заявку у меня"
              onPress={handleIgnore}
              variant="danger"
              icon={<XCircle size={18} color={Colors.white} />}
              style={styles.actionSpacing}
              loading={mutationLoading.ignoring}
              testID="delete-request-for-me"
            />
          ) : null}

          {isClientOwner && (request.status === 'new' || request.status === 'in_progress') ? (
            <AnimatedActionButton
              label="Отменить заявку"
              onPress={handleCancel}
              variant="danger"
              icon={<XCircle size={18} color={Colors.white} />}
              style={styles.actionSpacing}
              loading={mutationLoading.cancelling}
              testID="cancel-request"
            />
          ) : null}
        </View>

        {isAdminMode && request ? (
          <AdminRequestActions requestId={request.id} currentStatus={request.status} onActionDone={() => handleRefresh()} />
        ) : null}

        <View style={styles.bottomSpacer} />
      </ScrollView>

      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        profile={profileModalData}
      />

      {localCompleting ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.completionOverlay}>
            <MLoader size="large" />
            <Text style={styles.completionOverlayText}>Завершаем заявку...</Text>
          </View>
        </Modal>
      ) : null}

      {localAcceptingProposal ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.completionOverlay}>
            <MLoader size="large" />
            <Text style={styles.completionOverlayText}>Принимаем предложение...</Text>
          </View>
        </Modal>
      ) : null}

      {localProposing ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.completionOverlay}>
            <MLoader size="large" />
            <Text style={styles.completionOverlayText}>Отправляем...</Text>
          </View>
        </Modal>
      ) : null}

      <Modal visible={showPaymentModal} transparent animationType="fade" onRequestClose={() => setShowPaymentModal(false)}>
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentModalCard}>
            <Text style={styles.paymentModalTitle}>Подтверждение оплаты</Text>
            <Text style={styles.paymentModalSubtitle}>Заявка Клиентом оплачена в полном объёме?</Text>
            <TouchableOpacity
              style={styles.paymentCheckboxRow}
              onPress={() => {
                setIsPaidChecked((v) => !v);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
              testID="payment-checkbox"
            >
              <View style={[styles.paymentCheckbox, isPaidChecked && styles.paymentCheckboxActive]}>
                {isPaidChecked ? <CheckCircle size={18} color={Colors.white} /> : null}
              </View>
              <Text style={styles.paymentCheckboxLabel}>Да, оплачена полностью</Text>
            </TouchableOpacity>
            {!isPaidChecked ? (
              <Text style={styles.paymentHint}>Если не отмечено — у клиента в истории будет стоять отметка «Не оплачена»</Text>
            ) : null}
            <TouchableOpacity
              style={styles.paymentConfirmButton}
              onPress={handlePaymentConfirmAndComplete}
              activeOpacity={0.85}
              testID="payment-confirm-button"
            >
              <Text style={styles.paymentConfirmButtonText}>Продолжить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.paymentCancelButton}
              onPress={() => setShowPaymentModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.paymentCancelButtonText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <RatingModal
        visible={showRatingModal}
        onClose={() => setShowRatingModal(false)}
        onSubmit={handleRatingSubmit}
        title={canClientRateExecutor ? 'Оценить исполнителя' : 'Оценить клиента'}
        subtitle={canClientRateExecutor ? 'Поставьте звёзды и напишите отзыв' : 'Поставьте звёзды и напишите отзыв'}
        isSubmitting={ratingSubmitting}
        personAvatar={canClientRateExecutor
          ? (request.executorAvatar || request.proposals.find((p) => p.status === 'accepted')?.executorAvatar)
          : request.clientAvatar}
        personName={canClientRateExecutor
          ? (request.masterName || request.proposals.find((p) => p.status === 'accepted')?.executorName)
          : request.clientName ?? undefined}
        personRating={canClientRateExecutor
          ? (request.executorRating ?? request.proposals.find((p) => p.status === 'accepted')?.executorRating)
          : request.clientRating}
        serviceName={request.categoryName}
      />

      <PhotoSourceSheet
        visible={showCompletionPhotoSheet}
        onClose={() => setShowCompletionPhotoSheet(false)}
        onPickCamera={() => handleCompletionPhotoFromSource('camera')}
        onPickGallery={() => handleCompletionPhotoFromSource('gallery')}
        title="Фото выполненной работы"
      />

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
            <View style={styles.swipeIndicator}>
              <View style={styles.swipeIndicatorBar} />
              <Text style={styles.swipeHintText}>Свайп: влево/вправо — листать, вниз — закрыть</Text>
            </View>
            <View style={styles.photoViewerSlide}>
              {photoViewerPhotos[photoViewerIndex] ? (
                <ZoomableImage uri={photoViewerPhotos[photoViewerIndex]} style={styles.photoViewerImage} contentFit="contain" />
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal visible={showProposalWarning} transparent animationType="fade" onRequestClose={() => setShowProposalWarning(false)}>
        <View style={styles.paymentModalOverlay}>
          <View style={styles.paymentModalCard}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <AlertCircle size={36} color="#F59E0B" />
            </View>
            <Text style={styles.paymentModalTitle}>Важное уведомление</Text>
            <Text style={styles.paymentModalSubtitle}>
              В случае, если Вы не явитесь выполнять заявку без уведомления Клиента, Вам будет автоматически поставлена 1 звезда, что сократит Ваш персональный рейтинг.
            </Text>
            <TouchableOpacity
              style={styles.paymentCheckboxRow}
              onPress={() => setProposalWarningAcknowledged((v) => !v)}
              activeOpacity={0.7}
              testID="proposal-warning-checkbox"
            >
              <View style={[styles.paymentCheckbox, proposalWarningAcknowledged && styles.paymentCheckboxActive]}>
                {proposalWarningAcknowledged ? <CheckCircle size={18} color={Colors.white} /> : null}
              </View>
              <Text style={styles.paymentCheckboxLabel}>Ознакомлен</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paymentConfirmButton, !proposalWarningAcknowledged && { opacity: 0.5 }]}
              onPress={handleConfirmProposalWarning}
              activeOpacity={0.85}
              disabled={!proposalWarningAcknowledged}
              testID="confirm-proposal-warning"
            >
              <Text style={styles.paymentConfirmButtonText}>Продолжить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.paymentCancelButton}
              onPress={() => { setShowProposalWarning(false); setPendingProposalAction(null); }}
              activeOpacity={0.7}
            >
              <Text style={styles.paymentCancelButtonText}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showProposalModal} transparent animationType="slide" onRequestClose={() => setShowProposalModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height' }>
          <View style={styles.proposalModalCard}>
            <View style={styles.proposalModalHeader}>
              <Text style={styles.proposalModalTitle}>Предложить условия</Text>
              <TouchableOpacity onPress={() => setShowProposalModal(false)} activeOpacity={0.7} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <X size={22} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TextInput
              {...numericNoSuggestProps}
              style={styles.input}
              value={proposalPrice}
              onChangeText={setProposalPrice}
              placeholder="Цена (₽)"
              placeholderTextColor={Colors.textMuted}
              testID="proposal-price"
            />
            <View style={styles.inlineInputs}>
              <TouchableOpacity
                style={[styles.proposalPickerButton, styles.inputHalf]}
                onPress={openProposalDatePicker}
                activeOpacity={0.8}
                testID="proposal-date-picker"
              >
                <Calendar size={16} color={Colors.primary} />
                <Text style={proposalDate ? styles.proposalPickerText : styles.proposalPickerPlaceholder}>
                  {proposalDate || 'Дата'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.proposalPickerButton, styles.inputHalf]}
                onPress={openProposalTimePicker}
                activeOpacity={0.8}
                testID="proposal-time-picker"
              >
                <Clock size={16} color={Colors.primary} />
                <Text style={proposalTime ? styles.proposalPickerText : styles.proposalPickerPlaceholder}>
                  {proposalTime || 'Время'}
                </Text>
              </TouchableOpacity>
            </View>
            <TextInput
              {...plainFieldProps}
              style={[styles.input, styles.proposalTextArea]}
              value={proposalText}
              onChangeText={setProposalText}
              placeholder="Комментарий к предложению"
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              testID="proposal-conditions"
            />
            <AnimatedActionButton
              label="Отправить предложение"
              onPress={handleSendProposal}
              icon={<FileText size={18} color={Colors.white} />}
              loading={localProposing}
              testID="submit-proposal"
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showProposalDateModal} transparent animationType="slide" onRequestClose={() => setShowProposalDateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setProposalVisibleMonth((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
                <ChevronLeft size={20} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{getMonthLabel(proposalVisibleMonth)}</Text>
              <TouchableOpacity onPress={() => setProposalVisibleMonth((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}>
                <ChevronRight size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>
            <View style={styles.weekRow}>
              {weekDays.map((wd) => (
                <Text key={wd} style={styles.weekDay}>{wd}</Text>
              ))}
            </View>
            <View style={styles.daysGrid}>
              {proposalCalendarDays.map((day, index) => (
                <TouchableOpacity
                  key={`pday-${index}`}
                  style={[
                    styles.dayCell,
                    day === null && styles.dayCellEmpty,
                    day !== null && proposalDate === formatDateStr(new Date(proposalVisibleMonth.getFullYear(), proposalVisibleMonth.getMonth(), day)) && styles.dayCellSelected,
                  ]}
                  disabled={day === null}
                  onPress={() => { if (day !== null) handleProposalDayPress(day); }}
                >
                  <Text style={[
                    styles.dayText,
                    day !== null && proposalDate === formatDateStr(new Date(proposalVisibleMonth.getFullYear(), proposalVisibleMonth.getMonth(), day)) && styles.dayTextSelected,
                  ]}>{day ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showProposalTimeModal} transparent animationType="slide" onRequestClose={() => setShowProposalTimeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Выберите время</Text>
            <View style={styles.timePickerRow}>
              <ScrollView ref={proposalHourScrollRef} style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {hoursArr.map((hour) => (
                  <TouchableOpacity key={hour} style={[styles.timeValue, proposalSelectedHour === hour && styles.timeValueActive]} onPress={() => setProposalSelectedHour(hour)}>
                    <Text style={[styles.timeValueText, proposalSelectedHour === hour && styles.timeValueTextActive]}>{hour}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.timeSeparator}>:</Text>
              <ScrollView ref={proposalMinuteScrollRef} style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {minutesArr.map((minute) => (
                  <TouchableOpacity key={minute} style={[styles.timeValue, proposalSelectedMinute === minute && styles.timeValueActive]} onPress={() => setProposalSelectedMinute(minute)}>
                    <Text style={[styles.timeValueText, proposalSelectedMinute === minute && styles.timeValueTextActive]}>{minute}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmProposalTime}>
              <Text style={styles.confirmButtonText}>Подтвердить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function AdminRequestActions({ requestId, currentStatus, onActionDone }: { requestId: string; currentStatus: string; onActionDone: () => void }) {
  const updateStatusMutation = trpc.admin.updateRequestStatus.useMutation({
    onSuccess: () => { onActionDone(); void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); },
    onError: (err: any) => Alert.alert('Ошибка', err.message),
  });

  const canCancel = currentStatus !== 'cancelled' && currentStatus !== 'completed';
  const canComplete = currentStatus !== 'completed' && currentStatus !== 'cancelled';

  return (
    <View style={adminRequestStyles.container}>
      <View style={adminRequestStyles.header}>
        <AlertCircle size={16} color={Colors.accent} />
        <Text style={adminRequestStyles.headerText}>Управление заявкой</Text>
      </View>
      {canComplete && (
        <TouchableOpacity
          style={adminRequestStyles.actionBtn}
          onPress={() => {
            Alert.alert('Выполнить заявку?', 'Заявка будет переведена в статус Выполнена.', [
              { text: 'Отмена', style: 'cancel' },
              { text: 'Выполнить', onPress: () => updateStatusMutation.mutate({ requestId, status: 'completed' }) },
            ]);
          }}
          activeOpacity={0.7}
          disabled={updateStatusMutation.isPending}
        >
          <View style={[adminRequestStyles.actionIcon, { backgroundColor: Colors.success + '20' }]}>
            <CheckCircle size={18} color={Colors.success} />
          </View>
          <View style={adminRequestStyles.actionInfo}>
            <Text style={adminRequestStyles.actionTitle}>Выполнить заявку</Text>
            <Text style={adminRequestStyles.actionSubtitle}>Перевести в статус «Выполнена»</Text>
          </View>
        </TouchableOpacity>
      )}
      {canCancel && (
        <TouchableOpacity
          style={[adminRequestStyles.actionBtn, { borderColor: Colors.danger + '40' }]}
          onPress={() => {
            Alert.alert('Отменить заявку?', 'Это действие нельзя отменить.', [
              { text: 'Нет', style: 'cancel' },
              { text: 'Отменить', style: 'destructive', onPress: () => updateStatusMutation.mutate({ requestId, status: 'cancelled' }) },
            ]);
          }}
          activeOpacity={0.7}
          disabled={updateStatusMutation.isPending}
        >
          <View style={[adminRequestStyles.actionIcon, { backgroundColor: Colors.danger + '20' }]}>
            <XCircle size={18} color={Colors.danger} />
          </View>
          <View style={adminRequestStyles.actionInfo}>
            <Text style={[adminRequestStyles.actionTitle, { color: Colors.danger }]}>Отменить заявку</Text>
            <Text style={adminRequestStyles.actionSubtitle}>Перевести в статус «Отменена»</Text>
          </View>
        </TouchableOpacity>
      )}
      {updateStatusMutation.isPending && (
        <View style={adminRequestStyles.loadingRow}>
          <MLoader size="small" />
          <Text style={adminRequestStyles.loadingText}>Обновление...</Text>
        </View>
      )}
    </View>
  );
}

const adminRequestStyles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 16, backgroundColor: Colors.card, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: Colors.borderLight },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  headerText: { fontSize: 16, fontWeight: '800' as const, color: Colors.text },
  actionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 15, fontWeight: '600' as const, color: Colors.text },
  actionSubtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12 },
  loadingText: { fontSize: 13, color: Colors.textMuted },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 24,
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  notFoundText: {
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
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  categoryIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 10,
  },
  sectionInnerTitle: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  cardBlock: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  descriptionText: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  detailValueLink: {
    color: Colors.primary,
  },
  routeLinksContainer: {
    marginTop: 4,
    gap: 2,
    alignSelf: 'flex-start',
  },
  routeLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  routeLinkText: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600' as const,
    textDecorationLine: 'underline',
  },
  detailSubValue: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  clientAvatarSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  clientAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(22,163,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposalCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  proposalCountText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  proposalsList: {
    gap: 12,
  },
  offerCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
  },
  offerCardSelected: {
    borderColor: '#5DE28D',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 4,
  },
  offerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  offerTopRightCol: {
    alignItems: 'flex-end',
  },
  offerPersonWrap: {
    flex: 1,
  },
  offerName: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  offerNameRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  offerRating: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  offerAvatarWrap: {
    alignItems: 'center',
    marginRight: 4,
  },
  offerAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(56,189,248,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(56,189,248,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(56,189,248,0.3)',
  },
  offerRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(251,191,36,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  offerRatingBadgeText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FBBF24',
  },
  offerMetaGrid: {
    gap: 10,
    marginBottom: 12,
  },
  offerPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.15)',
  },
  offerPriceText: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.accent,
  },
  offerMetaRow: {
    flexDirection: 'row',
    gap: 8,
  },
  offerMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(22,163,74,0.15)',
  },
  offerMetaChipText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  offerMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  offerMetaText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700' as const,
    flexShrink: 1,
  },
  offerConditionsWrap: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 4,
  },
  offerConditionsLabel: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  offerConditions: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  offerActions: {
    gap: 10,
    marginTop: 14,
  },
  offerActionButton: {
    minWidth: 150,
  },
  completionBlock: {
    gap: 10,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  photosScroll: {
    marginBottom: 8,
  },
  photoThumb: {
    width: 90,
    height: 90,
    borderRadius: 12,
    marginRight: 8,
    backgroundColor: Colors.cardSecondary,
  },
  zoomIconOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  proposalPickerButton: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  proposalPickerText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  proposalPickerPlaceholder: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  ratingAnonNote: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  inlineInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: Colors.text,
    fontSize: 14,
    marginBottom: 10,
  },
  inputHalf: {
    flex: 1,
  },
  textArea: {
    minHeight: 110,
  },
  chatSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  openFullChatLink: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.text,
    marginBottom: 12,
  },
  chatLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  chatLoadingText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  messagesList: {
    gap: 10,
    marginBottom: 12,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 16,
    maxWidth: '92%' as const,
  },
  messageOwn: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primaryDark,
  },
  messageOther: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  messageAuthor: {
    color: Colors.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  messageText: {
    color: Colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  messageTextOwn: {
    color: Colors.white,
  },
  chatInput: {
    marginTop: 4,
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
  ratingPromptCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    gap: 8,
  },
  ratingPromptTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  ratingPromptText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  ratingDoneLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  actionSpacing: {
    marginTop: 10,
  },
  executorUnifiedCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    gap: 14,
  },
  unifiedDescriptionBlock: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  unifiedDescriptionLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  unifiedProposalCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unifiedOwnProposalBlock: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  unifiedExecutorActions: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 4,
  },
  executorActionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  completionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  completionOverlayText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
    marginTop: 8,
  },
  acceptClientButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptClientButtonText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  proposeOwnButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(22,163,74,0.08)',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  proposeOwnButtonText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.primary,
    flexShrink: 1,
  },
  proposalModalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderBottomWidth: 0,
  },
  proposalModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  proposalModalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  proposalTextArea: {
    minHeight: 80,
  },
  urgentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  urgentBadgeText: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#FFFFFF',
  },
  unpaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  unpaidBadgeText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  paymentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  paymentModalCard: {
    backgroundColor: Colors.card,
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  paymentModalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  paymentModalSubtitle: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  paymentCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    marginBottom: 12,
  },
  paymentCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentCheckboxActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
  paymentCheckboxLabel: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
    flex: 1,
  },
  paymentHint: {
    fontSize: 13,
    color: Colors.accent,
    lineHeight: 19,
    marginBottom: 16,
    textAlign: 'center',
  },
  paymentConfirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  paymentConfirmButtonText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  paymentCancelButton: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  paymentCancelButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  bottomSpacer: {
    height: 18,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerClose: {
    position: 'absolute',
    top: 44,
    right: 16,
    zIndex: 10,
    padding: 8,
  },
  photoViewerCloseInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerContent: {
    flex: 1,
    width: '100%' as const,
    justifyContent: 'center',
    alignItems: 'center',
  },
  swipeIndicator: {
    alignItems: 'center',
    paddingTop: 80,
    paddingBottom: 8,
  },
  swipeIndicatorBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  swipeHintText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 6,
  },
  photoViewerCounter: {
    position: 'absolute',
    top: 58,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.8)',
    zIndex: 10,
  },
  photoViewerSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT - 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: SCREEN_WIDTH - 20,
    height: SCREEN_HEIGHT * 0.7,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    minHeight: 340,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600' as const,
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%' as unknown as number,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 14,
  },
  dayCellEmpty: {
    opacity: 0,
  },
  dayCellSelected: {
    backgroundColor: Colors.primary,
  },
  dayText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  dayTextSelected: {
    color: Colors.white,
  },
  timePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  timeColumn: {
    width: 100,
    maxHeight: 220,
  },
  timeValue: {
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  timeValueActive: {
    backgroundColor: Colors.primaryLight,
  },
  timeValueText: {
    fontSize: 18,
    color: Colors.textSecondary,
    fontWeight: '600' as const,
  },
  timeValueTextActive: {
    color: Colors.white,
  },
  timeSeparator: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.primary,
    marginHorizontal: 14,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  offerActionsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  offerActionButtonFlex: {
    flex: 1,
    minWidth: 0,
  },
  declineProposalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.25)',
  },
  declineProposalText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  declinedBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(248,113,113,0.1)',
  },
  declinedBadgeText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  phoneCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0A7A50',
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  phoneCallButtonText: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.white,
  },
  executorClientInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  executorClientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(22,163,74,0.3)',
  },
  executorClientAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(22,163,74,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(22,163,74,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  executorClientInfoText: {
    flex: 1,
  },
  executorClientName: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  executorClientStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  executorClientRating: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FBBF24',
  },
  executorClientOrders: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
});
