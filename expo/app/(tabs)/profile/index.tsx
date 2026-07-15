import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  Animated,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from '@/components/MImage';
import { useRouter } from 'expo-router';
import {
  User,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CircleHelp as HelpCircle,
  LogOut,
  Wrench,
  Plus,
  Trash2,
  Check,
  Settings,
  Star,
  X,
  Pencil,
  Clock,
  Navigation,
  Camera,
  BarChart3,
  CheckCircle,
  History,
  FileText,
  ImagePlus,
  Fingerprint,
  ScanFace,
  Eye,
  EyeOff,
  Hash,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { imagePickerAssetToDataUri } from '@/lib/strip-image-for-upload';
import { uploadFileToS3 } from '@/lib/upload-to-s3';
import { METALLIC_BORDER_COLOR, METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import {
  emailInputProps,
  familyNameInputProps,
  givenNameInputProps,
  numericNoSuggestProps,
  passwordInputProps,
  phoneInputProps,
  plainFieldProps,
  streetAddressInputProps,
} from '@/lib/text-input-autofill';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { useMRefreshControl } from '@/components/MRefreshControl';
import { useRequests } from '@/providers/RequestsProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useServiceCategories } from '@/lib/use-service-categories';
import ServiceIcon from '@/components/ServiceIcon';
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';
import MLoader from '@/components/MLoader';
import VerifiedBadge from '@/components/VerifiedBadge';
import { PortfolioPhoto } from '@/types';
import { DollarSign } from 'lucide-react-native';
import { useBiometric } from '@/providers/BiometricProvider';
import { roleLabels, roleColors } from '@/lib/profile/constants';
import { useProfileLocation } from '@/lib/profile/useProfileLocation';
import { AnimatedAvatarRing } from '@/components/profile/AnimatedAvatarRing';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import ZoomableImage from '@/components/ZoomableImage';
import { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import ScreenErrorBoundary from '@/components/ScreenErrorBoundary';

function validatePhone(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return 'Номер телефона слишком короткий';
  if (cleaned.length > 12) return 'Номер телефона слишком длинный';
  return null;
}

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'Введите email';
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email.trim())) return 'Некорректный формат email';
  return null;
}

function ProfileScreenInner() {
  const { requests, refetch: refetchRequests } = useRequests();
  const floatingHeaderHeight = useFloatingHeaderHeight();
  const [historyExpanded, setHistoryExpanded] = useState<boolean>(false);
  const [historyShowAll, setHistoryShowAll] = useState<boolean>(false);
  const { user, logout, role, updateProfile, addAddress, removeAddress, switchDemoRole } = useAuth();
  const queryClient = useQueryClient();
  const [isSwitchingRole, setIsSwitchingRole] = useState<boolean>(false);
  const [demoSticky, setDemoSticky] = useState<boolean>(false);
  useEffect(() => {
    if (user?.isDemo) {
      if (!demoSticky) {
        console.log('[Profile] Demo mode detected, pinning role switcher visible');
        setDemoSticky(true);
      }
    }
  }, [user?.isDemo, demoSticky]);
  const demoVisible = !!(user?.isDemo) || demoSticky;

  const handleSwitchDemoRole = useCallback(async (nextRole: 'client' | 'executor') => {
    if (isSwitchingRole) return;
    if (role === nextRole) return;
    try {
      setIsSwitchingRole(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await switchDemoRole(nextRole);
      await queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      console.error('[Profile] switchDemoRole error:', err?.message);
      Alert.alert('Не удалось переключить роль', err?.message || 'Повторите попытку позже.');
    } finally {
      setIsSwitchingRole(false);
    }
  }, [isSwitchingRole, role, switchDemoRole, queryClient]);
  const { biometricAvailable, biometricEnabled, biometricLabel, biometricType, enableBiometric, disableBiometric } = useBiometric();
  const router = useRouter();
  const [servicesExpanded, setServicesExpanded] = useState<boolean>(false);
  const [addressesExpanded, setAddressesExpanded] = useState<boolean>(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState<boolean>(false);
  const [showEditServicesModal, setShowEditServicesModal] = useState<boolean>(false);
  const [editServiceIds, setEditServiceIds] = useState<string[]>([]);

  const [showEditPhoneModal, setShowEditPhoneModal] = useState<boolean>(false);
  const [showEditEmailModal, setShowEditEmailModal] = useState<boolean>(false);
  const [showEditNameModal, setShowEditNameModal] = useState<boolean>(false);
  const [showEditAddressModal, setShowEditAddressModal] = useState<boolean>(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);

  const [editPhone, setEditPhone] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editFirstName, setEditFirstName] = useState<string>('');
  const [editLastName, setEditLastName] = useState<string>('');
  const [editNameError, setEditNameError] = useState<string>('');
  const [editPhoneError, setEditPhoneError] = useState<string>('');
  const [editEmailError, setEditEmailError] = useState<string>('');

  const [addrLabel, setAddrLabel] = useState<string>('');
  const [addrStreet, setAddrStreet] = useState<string>('');
  const [addrHouse, setAddrHouse] = useState<string>('');
  const [addrBuilding, setAddrBuilding] = useState<string>('');
  const [addrApartment, setAddrApartment] = useState<string>('');
  const [addrEntrance, setAddrEntrance] = useState<string>('');
  const [addrFloor, setAddrFloor] = useState<string>('');
  const [addrIntercom, setAddrIntercom] = useState<string>('');
  const [addrError, setAddrError] = useState<string>('');

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const { locationInfo, locationLoading } = useProfileLocation();

  const [supportChatLoading, setSupportChatLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState<boolean>(false);

  const [aboutExpanded, setAboutExpanded] = useState<boolean>(false);
  const [showEditAboutModal, setShowEditAboutModal] = useState<boolean>(false);
  const [editAbout, setEditAbout] = useState<string>('');
  const [editAboutError, setEditAboutError] = useState<string>('');

  const [showEditStatusModal, setShowEditStatusModal] = useState<boolean>(false);
  const [editStatusText, setEditStatusText] = useState<string>('');
  const [editStatusError, setEditStatusError] = useState<string>('');

  const [portfolioExpanded, setPortfolioExpanded] = useState<boolean>(false);
  const [portfolioPhotos, setPortfolioPhotos] = useState<PortfolioPhoto[]>([]);
  const [showPhotoViewer, setShowPhotoViewer] = useState<boolean>(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number>(0);

  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerScale = useRef(new Animated.Value(0.95)).current;

  const getOrCreateSupportChat = trpc.chats.getOrCreateSupportChat.useMutation();

  const deleteAccountMutation = trpc.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Аккаунт удалён', 'Ваш аккаунт был успешно удалён.', [
        {
          text: 'OK',
          onPress: () => {
            void logout();
            router.replace('/login');
          },
        },
      ]);
    },
    onError: (err) => {
      console.error('[Profile] Delete account error:', err.message);
      Alert.alert('Ошибка', err.message || 'Не удалось удалить аккаунт');
    },
    onSettled: () => {
      setIsDeletingAccount(false);
    },
  });

  const portfolioQuery = trpc.auth.getPortfolioPhotos.useQuery(undefined, {
    enabled: role === 'executor',
    staleTime: 30_000,
    refetchOnMount: true,
  });

  const addPortfolioPhotoMutation = trpc.auth.addPortfolioPhoto.useMutation({
    onSuccess: () => {
      void portfolioQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
    },
  });

  const removePortfolioPhotoMutation = trpc.auth.removePortfolioPhoto.useMutation({
    onSuccess: () => {
      void portfolioQuery.refetch();
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
    },
  });

  useEffect(() => {
    if (!portfolioQuery.data) return;
    // Guard against unexpected API payloads to avoid profile screen crashes.
    if (Array.isArray(portfolioQuery.data)) {
      setPortfolioPhotos(
        (portfolioQuery.data as unknown as PortfolioPhoto[]).filter(
          (photo): photo is PortfolioPhoto =>
            !!photo &&
            typeof photo.id === 'string' &&
            typeof photo.photoUrl === 'string'
        )
      );
      return;
    }
    setPortfolioPhotos([]);
  }, [portfolioQuery.data]);

  const executorSummaryQuery = trpc.requests.executorSummary.useQuery(undefined, {
    enabled: role === 'executor',
    staleTime: 20_000,
    gcTime: 300_000,
    refetchOnMount: true,
  });

  const executorEarnings = useMemo(() => {
    if (!executorSummaryQuery.data) return { monthTotal: 0, allTimeTotal: 0 };
    const data = executorSummaryQuery.data as {
      monthly?: unknown;
      yearly?: unknown;
    };
    const monthly = Array.isArray(data.monthly) ? data.monthly : [];
    const yearly = Array.isArray(data.yearly) ? data.yearly : [];
    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = monthly.find(
      (m: { month?: string; total?: number }) => m && typeof m === 'object' && m.month === currentMonthKey,
    ) as { total?: number } | undefined;
    const allTime = yearly.reduce((acc: number, y: { total?: unknown }) => {
      const t = Number(y?.total);
      return acc + (Number.isFinite(t) ? t : 0);
    }, 0);
    const monthTotal = Number(currentMonth?.total);
    return {
      monthTotal: Number.isFinite(monthTotal) ? monthTotal : 0,
      allTimeTotal: allTime,
    };
  }, [executorSummaryQuery.data]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetchRequests(),
        queryClient.invalidateQueries({ queryKey: [['auth', 'me']] }),
        role === 'executor' ? queryClient.invalidateQueries({ queryKey: [['auth', 'getPortfolioPhotos']] }) : Promise.resolve(),
        role === 'executor' ? queryClient.invalidateQueries({ queryKey: [['requests', 'executorSummary']] }) : Promise.resolve(),
      ]);
      console.log('[Profile] Refreshed all queries');
    } catch (err) {
      console.error('[Profile] Refresh error:', err);
    } finally {
      setRefreshing(false);
    }
  }, [refetchRequests, queryClient, role]);

  const { refreshControl: profileRefreshControl } = useMRefreshControl(refreshing, handleRefresh);

  const handlePickAvatar = useCallback(async () => {
    try {
      const currentPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
      let granted = currentPermission.granted;
      if (!granted) {
        const requestedPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        granted = requestedPermission.granted;
      }
      if (!granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к галерее, чтобы выбрать фото профиля.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: Platform.OS === 'web',
      });
      if (!result.canceled && (result.assets?.length ?? 0) > 0) {
        const asset = result.assets?.[0];
        if (!asset) return;
        const avatarUri = await imagePickerAssetToDataUri(asset.base64, asset.uri);
        if (!avatarUri) {
          Alert.alert('Внимание', 'Не удалось обработать фото. Попробуйте другое изображение.');
          return;
        }
        const uploadedAvatar = await uploadFileToS3(avatarUri, { prefix: 'avatars' });
        await updateProfile({ avatar: uploadedAvatar.url });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log('[Profile] Avatar updated');
      }
    } catch (err) {
      console.error('[Profile] Avatar pick error:', err);
      Alert.alert('Ошибка', 'Не удалось обновить фото');
    }
  }, [updateProfile]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(headerScale, { toValue: 1, tension: 50, friction: 9, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [headerOpacity, headerScale]);

  const handleOpenSupportChat = useCallback(async () => {
    setSupportChatLoading(true);
    try {
      const chatId = await getOrCreateSupportChat.mutateAsync();
      console.log('[Profile] Support chat ID:', chatId);
      router.push({ pathname: '/chat-room', params: { chatId: chatId as string } });
    } catch (err) {
      console.error('[Profile] Failed to open support chat:', err);
      Alert.alert('Ошибка', 'Не удалось открыть чат с поддержкой');
    } finally {
      setSupportChatLoading(false);
    }
  }, [getOrCreateSupportChat, router]);

  const [showBiometricPasswordModal, setShowBiometricPasswordModal] = useState<boolean>(false);
  const [biometricPassword, setBiometricPassword] = useState<string>('');
  const [biometricPasswordError, setBiometricPasswordError] = useState<string>('');
  const [showBiometricPassword, setShowBiometricPassword] = useState<boolean>(false);

  const handleToggleBiometric = useCallback(async () => {
    if (biometricEnabled) {
      Alert.alert(
        'Отключить ' + biometricLabel + '?',
        'Быстрый вход будет недоступен.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Отключить',
            style: 'destructive',
            onPress: async () => {
              await disableBiometric();
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ]
      );
    } else {
      if (!user?.phone && !user?.email) {
        Alert.alert('Ошибка', 'Для включения быстрого входа нужен телефон или email.');
        return;
      }
      if (user?.hasPassword === false) {
        void (async () => {
          const ok = await enableBiometric();
          if (ok) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert(biometricLabel + ' включён', 'Теперь вы можете входить быстро.');
          }
        })();
        return;
      }
      setShowBiometricPasswordModal(true);
    }
  }, [biometricEnabled, biometricLabel, disableBiometric, enableBiometric, user?.phone, user?.email, user?.hasPassword]);

  const handleConfirmBiometric = useCallback(async () => {
    if (!biometricPassword.trim()) {
      setBiometricPasswordError('Введите пароль');
      return;
    }
    setIsSaving(true);
    try {
      const success = await enableBiometric(biometricPassword.trim());
      if (success) {
        setShowBiometricPasswordModal(false);
        setBiometricPassword('');
        setBiometricPasswordError('');
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(biometricLabel + ' включён', 'Теперь вы можете входить быстро.');
      }
    } catch {
      setBiometricPasswordError('Не удалось включить биометрию');
    } finally {
      setIsSaving(false);
    }
  }, [biometricPassword, user?.phone, user?.email, enableBiometric, biometricLabel]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Удалить аккаунт?',
      'Это действие необратимо. Все ваши данные, заявки, чаты и история будут удалены навсегда.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить навсегда',
          style: 'destructive',
          onPress: () => {
            setIsDeletingAccount(true);
            deleteAccountMutation.mutate({ confirmPassword: undefined });
          },
        },
      ]
    );
  }, [deleteAccountMutation]);

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          void logout();
          router.replace('/login');
        },
      },
    ]);
  };

  const displayName = user?.name ?? 'Пользователь';
  const displayPhone = user?.phone ?? '+7 (---) ---';
  const displayEmail = user?.email ?? '';
  const displayRole = role ? roleLabels[role] : '';
  const displayRoleColor = role ? roleColors[role] : Colors.primary;
  const userAddresses = useMemo(() => user?.addresses ?? [], [user?.addresses]);
  const subscribedServiceIds = useMemo(() => user?.subscribedServiceIds ?? [], [user?.subscribedServiceIds]);
  const serviceCategories = useServiceCategories();

  const subscribedServices = useMemo(() => {
    return serviceCategories.filter((s) => subscribedServiceIds.includes(s.id));
  }, [subscribedServiceIds, serviceCategories]);

  const safeRequests = useMemo(() => {
    return (requests ?? []).filter(
      (item): item is (typeof requests)[number] =>
        !!item &&
        typeof item === 'object' &&
        typeof (item as { id?: unknown }).id === 'string'
    );
  }, [requests]);

  const inProgressCount = useMemo(() => {
    if (!user) return 0;
    const fromRequests = role === 'executor'
      ? safeRequests.filter((r) => r.status === 'in_progress' && r.executorId === user.id).length
      : safeRequests.filter((r) => r.status === 'in_progress' && r.clientId === user.id).length;
    const fromProfile = user.inProgressCount;
    return fromRequests > 0 ? fromRequests : (fromProfile ?? 0);
  }, [safeRequests, user, role]);

  const myCompletedList = useMemo(() => {
    if (!user) return [];
    if (role === 'executor') {
      return safeRequests.filter((r) => r.status === 'completed' && r.executorId === user.id)
        .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime());
    }
    return safeRequests.filter((r) => r.status === 'completed' && r.clientId === user.id)
      .sort((a, b) => new Date(b.completedAt ?? b.createdAt).getTime() - new Date(a.completedAt ?? a.createdAt).getTime());
  }, [safeRequests, user, role]);

  const myCompletedCount = useMemo(() => {
    const fromList = myCompletedList.length;
    const fromProfile = user?.completedCount ?? 0;
    return Math.max(fromList, fromProfile);
  }, [myCompletedList, user]);

  const averageRating = useMemo(() => {
    if (!user) return null;
    if (user.rating != null && user.rating > 0) {
      return Number(user.rating).toFixed(1);
    }
    return null;
  }, [user]);

  const handleEditName = useCallback(() => {
    setEditFirstName(user?.firstName ?? '');
    setEditLastName(user?.lastName ?? '');
    setEditNameError('');
    setShowEditNameModal(true);
  }, [user?.firstName, user?.lastName]);

  const handleSaveName = useCallback(async () => {
    if (!editFirstName.trim()) {
      setEditNameError('Введите имя');
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ firstName: editFirstName.trim(), lastName: editLastName.trim() });
      setShowEditNameModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Name updated');
    } catch {
      setEditNameError('Не удалось обновить имя');
    } finally {
      setIsSaving(false);
    }
  }, [editFirstName, editLastName, updateProfile]);

  const handleEditPhone = useCallback(() => {
    setEditPhone(user?.phone ?? '');
    setEditPhoneError('');
    setShowEditPhoneModal(true);
  }, [user?.phone]);

  const handleSavePhone = useCallback(async () => {
    const error = validatePhone(editPhone);
    if (error) {
      setEditPhoneError(error);
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ phone: editPhone.trim() });
      setShowEditPhoneModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Phone updated');
    } catch (err: any) {
      const msg = err?.message?.includes('используется') ? 'Этот номер уже используется' : 'Не удалось обновить номер';
      setEditPhoneError(msg);
    } finally {
      setIsSaving(false);
    }
  }, [editPhone, updateProfile]);

  const handleEditEmail = useCallback(() => {
    setEditEmail(user?.email ?? '');
    setEditEmailError('');
    setShowEditEmailModal(true);
  }, [user?.email]);

  const handleSaveEmail = useCallback(async () => {
    const error = validateEmail(editEmail);
    if (error) {
      setEditEmailError(error);
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ email: editEmail.trim() });
      setShowEditEmailModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Email updated');
    } catch {
      setEditEmailError('Не удалось обновить email');
    } finally {
      setIsSaving(false);
    }
  }, [editEmail, updateProfile]);

  const resetAddressFields = useCallback(() => {
    setAddrLabel('');
    setAddrStreet('');
    setAddrHouse('');
    setAddrBuilding('');
    setAddrApartment('');
    setAddrEntrance('');
    setAddrFloor('');
    setAddrIntercom('');
    setAddrError('');
    setEditingAddressId(null);
  }, []);

  const handleOpenAddAddress = useCallback(() => {
    resetAddressFields();
    setShowAddAddressModal(true);
  }, [resetAddressFields]);

  const handleOpenEditAddress = useCallback((addrId: string) => {
    const addr = userAddresses.find((a) => a.id === addrId);
    if (!addr) return;
    setEditingAddressId(addrId);
    setAddrLabel(addr.label ?? '');
    setAddrStreet(addr.street ?? '');
    setAddrHouse(addr.house ?? '');
    setAddrBuilding(addr.building ?? '');
    setAddrApartment(addr.apartment ?? '');
    setAddrEntrance(addr.entrance ?? '');
    setAddrFloor(addr.floor ?? '');
    setAddrIntercom(addr.intercom ?? '');
    setAddrError('');
    setShowEditAddressModal(true);
  }, [userAddresses]);

  const handleSaveNewAddress = useCallback(async () => {
    if (!addrStreet.trim()) {
      setAddrError('Укажите улицу');
      return;
    }
    if (!addrHouse.trim()) {
      setAddrError('Укажите дом');
      return;
    }
    setIsSaving(true);
    try {
      const parts = [
        addrStreet.trim(),
        addrHouse.trim() ? `д. ${addrHouse.trim()}` : '',
        addrBuilding.trim() ? `корп. ${addrBuilding.trim()}` : '',
        addrApartment.trim() ? `кв. ${addrApartment.trim()}` : '',
        addrEntrance.trim() ? `подъезд ${addrEntrance.trim()}` : '',
        addrFloor.trim() ? `этаж ${addrFloor.trim()}` : '',
        addrIntercom.trim() ? `домофон ${addrIntercom.trim()}` : '',
      ].filter(Boolean);

      await addAddress({
        label: addrLabel.trim() || 'Дом',
        fullAddress: parts.join(', '),
        city: locationInfo?.city ?? user?.city ?? '',
        street: addrStreet.trim(),
        house: addrHouse.trim(),
        building: addrBuilding.trim() || undefined,
        apartment: addrApartment.trim() || undefined,
        entrance: addrEntrance.trim() || undefined,
        floor: addrFloor.trim() || undefined,
        intercom: addrIntercom.trim() || undefined,
      });
      setShowAddAddressModal(false);
      resetAddressFields();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Address added');
    } catch {
      setAddrError('Не удалось добавить адрес');
    } finally {
      setIsSaving(false);
    }
  }, [addrLabel, addrStreet, addrHouse, addrBuilding, addrApartment, addrEntrance, addrFloor, addrIntercom, addAddress, resetAddressFields, locationInfo]);

  const handleUpdateAddress = useCallback(async () => {
    if (!editingAddressId) return;
    if (!addrStreet.trim()) {
      setAddrError('Укажите улицу');
      return;
    }
    if (!addrHouse.trim()) {
      setAddrError('Укажите дом');
      return;
    }
    setIsSaving(true);
    try {
      await removeAddress(editingAddressId);
      const parts = [
        addrStreet.trim(),
        addrHouse.trim() ? `д. ${addrHouse.trim()}` : '',
        addrBuilding.trim() ? `корп. ${addrBuilding.trim()}` : '',
        addrApartment.trim() ? `кв. ${addrApartment.trim()}` : '',
        addrEntrance.trim() ? `подъезд ${addrEntrance.trim()}` : '',
        addrFloor.trim() ? `этаж ${addrFloor.trim()}` : '',
        addrIntercom.trim() ? `домофон ${addrIntercom.trim()}` : '',
      ].filter(Boolean);

      await addAddress({
        label: addrLabel.trim() || 'Дом',
        fullAddress: parts.join(', '),
        city: locationInfo?.city ?? user?.city ?? '',
        street: addrStreet.trim(),
        house: addrHouse.trim(),
        building: addrBuilding.trim() || undefined,
        apartment: addrApartment.trim() || undefined,
        entrance: addrEntrance.trim() || undefined,
        floor: addrFloor.trim() || undefined,
        intercom: addrIntercom.trim() || undefined,
      });
      setShowEditAddressModal(false);
      resetAddressFields();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Address updated');
    } catch {
      setAddrError('Не удалось обновить адрес');
    } finally {
      setIsSaving(false);
    }
  }, [editingAddressId, addrLabel, addrStreet, addrHouse, addrBuilding, addrApartment, addrEntrance, addrFloor, addrIntercom, addAddress, removeAddress, resetAddressFields, locationInfo]);

  const handleDeleteAddress = useCallback((addrId: string) => {
    Alert.alert('Удалить адрес?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAddress(addrId);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            console.log('[Profile] Address deleted:', addrId);
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить адрес');
          }
        },
      },
    ]);
  }, [removeAddress]);

  const openEditServices = useCallback(() => {
    setEditServiceIds([...subscribedServiceIds]);
    setShowEditServicesModal(true);
  }, [subscribedServiceIds]);

  const toggleEditService = useCallback((serviceId: string) => {
    setEditServiceIds((current) =>
      current.includes(serviceId)
        ? current.filter((id) => id !== serviceId)
        : [...current, serviceId]
    );
  }, []);

  const handleSaveServices = useCallback(() => {
    if (editServiceIds.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одну услугу');
      return;
    }
    void updateProfile({ subscribedServiceIds: editServiceIds });
    setShowEditServicesModal(false);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    console.log('[Profile] Services updated:', editServiceIds);
  }, [editServiceIds, updateProfile]);

  const handleEditStatus = useCallback(() => {
    setEditStatusText(user?.statusText ?? '');
    setEditStatusError('');
    setShowEditStatusModal(true);
  }, [user?.statusText]);

  const handleSaveStatus = useCallback(async () => {
    const words = editStatusText.trim().split(/\s+/).filter(Boolean);
    if (words.length > 5) {
      setEditStatusError('Максимум 5 слов');
      return;
    }
    setIsSaving(true);
    try {
      await updateProfile({ statusText: editStatusText.trim() });
      setShowEditStatusModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] Status updated');
    } catch {
      setEditStatusError('Не удалось обновить статус');
    } finally {
      setIsSaving(false);
    }
  }, [editStatusText, updateProfile]);

  const handleEditAbout = useCallback(() => {
    setEditAbout(user?.about ?? '');
    setEditAboutError('');
    setShowEditAboutModal(true);
  }, [user?.about]);

  const handleSaveAbout = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateProfile({ about: editAbout.trim() });
      setShowEditAboutModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[Profile] About updated');
    } catch {
      setEditAboutError('Не удалось обновить информацию');
    } finally {
      setIsSaving(false);
    }
  }, [editAbout, updateProfile]);

  const handleAddPortfolioPhoto = useCallback(async () => {
    try {
      const currentPermission = await ImagePicker.getMediaLibraryPermissionsAsync();
      let granted = currentPermission.granted;
      if (!granted) {
        const requestedPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        granted = requestedPermission.granted;
      }
      if (!granted) {
        Alert.alert('Нет доступа', 'Разрешите доступ к галерее, чтобы добавить фото в портфолио.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.6,
        base64: Platform.OS === 'web',
      });
      if (!result.canceled && (result.assets?.length ?? 0) > 0) {
        const asset = result.assets?.[0];
        if (!asset) return;
        setIsSaving(true);
        const photoUri = await imagePickerAssetToDataUri(asset.base64, asset.uri, { maxEdge: 1024, maxBytes: 800 * 1024 });
        if (!photoUri) {
          setIsSaving(false);
          Alert.alert('Внимание', 'Не удалось обработать фото. Попробуйте другое изображение.');
          return;
        }
        console.log('[Profile] Portfolio photo data URI length:', photoUri.length);
        try {
          const uploadedPortfolio = await uploadFileToS3(photoUri, { prefix: 'portfolio' });
          await addPortfolioPhotoMutation.mutateAsync({ photoUrl: uploadedPortfolio.url });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          console.log('[Profile] Portfolio photo added successfully');
        } catch (saveErr: any) {
          console.error('[Profile] Portfolio photo save error:', saveErr?.message || saveErr);
          Alert.alert('Ошибка', saveErr?.message || 'Не удалось сохранить фото. Попробуйте фото меньшего размера.');
        } finally {
          setIsSaving(false);
        }
      }
    } catch (err: any) {
      console.error('[Profile] Portfolio photo add error:', err?.message || err);
      Alert.alert('Ошибка', 'Не удалось добавить фото');
      setIsSaving(false);
    }
  }, [addPortfolioPhotoMutation]);

  const handleRemovePortfolioPhoto = useCallback((photoId: string) => {
    Alert.alert('Удалить фото?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await removePortfolioPhotoMutation.mutateAsync({ photoId });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            console.log('[Profile] Portfolio photo removed:', photoId);
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить фото');
          }
        },
      },
    ]);
  }, [removePortfolioPhotoMutation]);

  const renderAddressFormFields = () => (
    <View style={styles.addressFormFields}>
      <View style={styles.formRow}>
        <Text style={styles.formFieldLabel}>Название</Text>
        <TextInput
          {...plainFieldProps}
          style={styles.modalInput}
          value={addrLabel}
          onChangeText={setAddrLabel}
          placeholder="Дом, Работа, Дача..."
          placeholderTextColor={Colors.textMuted}
          testID="addr-label"
        />
      </View>
      <View style={styles.formRow}>
        <Text style={styles.formFieldLabel}>Улица <Text style={styles.requiredStar}>*</Text></Text>
        <TextInput
          {...streetAddressInputProps}
          style={styles.modalInput}
          value={addrStreet}
          onChangeText={(t) => { setAddrStreet(t); setAddrError(''); }}
          placeholder="ул. Ленина"
          placeholderTextColor={Colors.textMuted}
          testID="addr-street"
        />
      </View>
      <View style={styles.formRowDouble}>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Дом <Text style={styles.requiredStar}>*</Text></Text>
          <TextInput
            {...plainFieldProps}
            style={styles.modalInput}
            value={addrHouse}
            onChangeText={(t) => { setAddrHouse(t); setAddrError(''); }}
            placeholder="12"
            placeholderTextColor={Colors.textMuted}
            testID="addr-house"
          />
        </View>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Корпус</Text>
          <TextInput
            {...plainFieldProps}
            style={styles.modalInput}
            value={addrBuilding}
            onChangeText={setAddrBuilding}
            placeholder="—"
            placeholderTextColor={Colors.textMuted}
            testID="addr-building"
          />
        </View>
      </View>
      <View style={styles.formRowDouble}>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Квартира</Text>
          <TextInput
            {...numericNoSuggestProps}
            style={styles.modalInput}
            value={addrApartment}
            onChangeText={setAddrApartment}
            placeholder="45"
            placeholderTextColor={Colors.textMuted}
            testID="addr-apartment"
          />
        </View>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Подъезд</Text>
          <TextInput
            {...numericNoSuggestProps}
            style={styles.modalInput}
            value={addrEntrance}
            onChangeText={setAddrEntrance}
            placeholder="2"
            placeholderTextColor={Colors.textMuted}
            testID="addr-entrance"
          />
        </View>
      </View>
      <View style={styles.formRowDouble}>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Этаж</Text>
          <TextInput
            {...numericNoSuggestProps}
            style={styles.modalInput}
            value={addrFloor}
            onChangeText={setAddrFloor}
            placeholder="3"
            placeholderTextColor={Colors.textMuted}
            testID="addr-floor"
          />
        </View>
        <View style={styles.formFieldHalf}>
          <Text style={styles.formFieldLabel}>Домофон</Text>
          <TextInput
            {...plainFieldProps}
            style={styles.modalInput}
            value={addrIntercom}
            onChangeText={setAddrIntercom}
            placeholder="45К1234"
            placeholderTextColor={Colors.textMuted}
            testID="addr-intercom"
          />
        </View>
      </View>
      {addrError ? <Text style={styles.formError}>{addrError}</Text> : null}
    </View>
  );

  if (!user) {
    return (
      <View style={styles.userLoadingGate}>
        <MLoader size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]}
      showsVerticalScrollIndicator={false}
      refreshControl={profileRefreshControl}
    >
      <Animated.View style={{ opacity: headerOpacity, transform: [{ scale: headerScale }] }}>
        <LinearGradient
          colors={['#052E1C', '#0A5537', '#0D7A4B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileHeader}
        >
          <View style={styles.profileHeaderDecor1} />
          <View style={styles.profileHeaderDecor2} />

          <View style={styles.avatarSection}>
            <TouchableOpacity style={styles.avatarOuter} onPress={handlePickAvatar} activeOpacity={0.8} testID="pick-avatar">
              <AnimatedAvatarRing color={displayRoleColor} />
              {user?.avatar && isSafeImageUri(user.avatar) ? (
                <Image
                  source={{ uri: user.avatar }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={160}
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: displayRoleColor + '30' }]}>
                  {role === 'executor' ? <Wrench size={32} color={displayRoleColor} /> : <User size={32} color={displayRoleColor} />}
                </View>
              )}
              <View style={styles.avatarCameraBadge}>
                <Camera size={12} color={Colors.white} />
              </View>
              {user?.isFullyVerified ? (
                <View style={styles.avatarVerifiedBadge}>
                  <VerifiedBadge size="medium" />
                </View>
              ) : null}
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleEditName} activeOpacity={0.7} style={styles.nameRow}>
            <Text style={styles.name}>{displayName}</Text>
            <Pencil size={14} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
          <View style={[styles.roleBadge, { backgroundColor: displayRoleColor + '20', borderColor: displayRoleColor + '40' }]}>
            <View style={[styles.roleDot, { backgroundColor: displayRoleColor }]} />
            <Text style={[styles.roleText, { color: displayRoleColor }]}>{displayRole}</Text>
          </View>
          {user?.userNumber ? (
            <View style={styles.userIdBadge}>
              <Hash size={11} color="rgba(255,255,255,0.5)" />
              <Text style={styles.userIdText}>ID: {user.userNumber}</Text>
            </View>
          ) : null}
          <Text style={styles.phone}>{displayPhone}</Text>

          {role === 'executor' && user?.statusText ? (
            <TouchableOpacity onPress={handleEditStatus} activeOpacity={0.7} style={styles.statusTextRow}>
              <Text style={styles.statusTextDisplay}>«{user.statusText}»</Text>
            </TouchableOpacity>
          ) : role === 'executor' ? (
            <TouchableOpacity onPress={handleEditStatus} activeOpacity={0.7} style={styles.statusTextRowEmpty}>
              <Pencil size={12} color="rgba(255,255,255,0.4)" />
              <Text style={styles.statusTextEmpty}>Добавить статус</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.statsRow}>
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                console.log('[Navigation Error]', 'profile stat in progress → requests', {
                  userId: user?.id ?? null,
                  hasUser: !!user,
                  role,
                });
                router.push('/(tabs)/requests');
              }}
            >
              <Text style={styles.statValue}>{inProgressCount}</Text>
              <Text style={styles.statLabel}>В работе</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              activeOpacity={0.7}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                console.log('[Navigation Error]', 'profile stat completed → requests', {
                  userId: user?.id ?? null,
                  hasUser: !!user,
                  role,
                });
                router.push('/(tabs)/requests');
              }}
            >
              <Text style={styles.statValue}>{myCompletedCount}</Text>
              <Text style={styles.statLabel}>Выполнено</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <View style={styles.ratingRow}>
                {averageRating ? <Star size={14} color="#FBBF24" fill="#FBBF24" /> : null}
                <Text style={styles.statValue}>{averageRating ?? '—'}</Text>
              </View>
              <Text style={styles.statLabel}>Рейтинг</Text>
            </View>
          </View>

          {role === 'executor' ? (
            <TouchableOpacity
              style={styles.earningsRow}
              activeOpacity={0.7}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push('/executor-summary');
              }}
            >
              <View style={styles.earningsIconWrap}>
                <DollarSign size={14} color="#4ADE80" />
              </View>
              <View style={styles.earningsInfo}>
                <Text style={styles.earningsLabel}>Заработок за месяц</Text>
                <Text style={styles.earningsValue}>
                  {executorEarnings.monthTotal > 0
                    ? `${executorEarnings.monthTotal.toLocaleString('ru-RU')} ₽`
                    : '0 ₽'}
                </Text>
              </View>
              <View style={styles.earningsDividerVert} />
              <View style={styles.earningsInfo}>
                <Text style={styles.earningsLabel}>Всего</Text>
                <Text style={styles.earningsValue}>
                  {executorEarnings.allTimeTotal > 0
                    ? `${executorEarnings.allTimeTotal.toLocaleString('ru-RU')} ₽`
                    : '0 ₽'}
                </Text>
              </View>
              <ChevronRight size={14} color="rgba(255,255,255,0.4)" />
            </TouchableOpacity>
          ) : null}
        </LinearGradient>
      </Animated.View>

      {demoVisible ? (
        <View style={styles.demoCard} testID="demo-role-switcher">
          <View style={styles.demoHeader}>
            <View style={styles.demoBadge}>
              <Text style={styles.demoBadgeText}>DEMO</Text>
            </View>
            <Text style={styles.demoTitle}>Режим тестового аккаунта</Text>
          </View>
          <Text style={styles.demoSub}>Можно переключаться между ролями клиент/исполнитель для тестирования приложения.</Text>
          <View style={styles.demoSegment}>
            <TouchableOpacity
              style={[styles.demoSegmentItem, role === 'client' && styles.demoSegmentItemActive]}
              onPress={() => handleSwitchDemoRole('client')}
              disabled={isSwitchingRole || role === 'client'}
              activeOpacity={0.8}
              testID="demo-role-client"
            >
              <User size={16} color={role === 'client' ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.demoSegmentText, role === 'client' && styles.demoSegmentTextActive]}>Клиент</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.demoSegmentItem, role === 'executor' && styles.demoSegmentItemActive]}
              onPress={() => handleSwitchDemoRole('executor')}
              disabled={isSwitchingRole || role === 'executor'}
              activeOpacity={0.8}
              testID="demo-role-executor"
            >
              <Wrench size={16} color={role === 'executor' ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.demoSegmentText, role === 'executor' && styles.demoSegmentTextActive]}>Исполнитель</Text>
            </TouchableOpacity>
          </View>
          {isSwitchingRole ? (
            <Text style={styles.demoHint}>Переключаем роль...</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.contactSection}>
        <TouchableOpacity
          style={styles.contactRow}
          activeOpacity={0.7}
          onPress={handleEditPhone}
          testID="edit-phone"
        >
          <View style={[styles.contactIconWrap, { backgroundColor: 'rgba(56,189,248,0.1)' }]}>
            <Phone size={16} color={Colors.info} />
          </View>
          <Text style={styles.contactText}>{displayPhone}</Text>
          <Pencil size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.contactDivider} />
        <TouchableOpacity
          style={styles.contactRow}
          activeOpacity={0.7}
          onPress={handleEditEmail}
          testID="edit-email"
        >
          <View style={[styles.contactIconWrap, { backgroundColor: 'rgba(168,85,247,0.1)' }]}>
            <Mail size={16} color="#A855F7" />
          </View>
          <Text style={styles.contactText}>{displayEmail || 'Добавить email'}</Text>
          <Pencil size={14} color={Colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.contactDivider} />
        <View style={styles.contactRow}>
          <View style={[styles.contactIconWrap, { backgroundColor: 'rgba(74,222,128,0.1)' }]}>
            <Navigation size={16} color="#4ADE80" />
          </View>
          {locationLoading ? (
            <MLoader size="small" color={Colors.textMuted} />
          ) : (
            <View style={styles.locationContent}>
              <Text style={styles.contactText}>{locationInfo?.city ?? 'Неизвестно'}</Text>
              <View style={styles.timezoneBadge}>
                <Clock size={10} color={Colors.textMuted} />
                <Text style={styles.timezoneText}>{locationInfo?.offset ?? ''}</Text>
              </View>
            </View>
          )}
        </View>
      </View>

      {role === 'client' ? (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.sectionHeaderButton}
            onPress={() => setAddressesExpanded((v) => !v)}
            activeOpacity={0.82}
            testID="toggle-addresses"
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(74,222,128,0.1)' }]}>
                <MapPin size={16} color="#4ADE80" />
              </View>
              <View>
                <Text style={styles.sectionHeaderTitle}>Мои адреса</Text>
                <Text style={styles.sectionHeaderSub}>{userAddresses.length} адресов</Text>
              </View>
            </View>
            {addressesExpanded ? <ChevronUp size={18} color={Colors.textSecondary} /> : <ChevronDown size={18} color={Colors.textSecondary} />}
          </TouchableOpacity>
          {addressesExpanded ? (
            <View style={styles.expandedContent}>
              {userAddresses.map((addr) => (
                <TouchableOpacity
                  key={addr.id}
                  style={styles.addressItem}
                  activeOpacity={0.7}
                  onPress={() => handleOpenEditAddress(addr.id)}
                >
                  <View style={styles.addressItemContent}>
                    <Text style={styles.addressItemLabel}>{addr.label}</Text>
                    <Text style={styles.addressItemText}>{addr.address}</Text>
                  </View>
                  <View style={styles.addressActions}>
                    <TouchableOpacity
                      onPress={() => handleOpenEditAddress(addr.id)}
                      style={styles.editButton}
                      testID={`edit-address-${addr.id}`}
                    >
                      <Pencil size={14} color={Colors.info} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteAddress(addr.id)}
                      style={styles.deleteButton}
                      testID={`delete-address-${addr.id}`}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleOpenAddAddress}
                activeOpacity={0.8}
                testID="add-address"
              >
                <Plus size={18} color={Colors.primary} />
                <Text style={styles.addButtonText}>Добавить адрес</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {role === 'executor' ? (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.sectionHeaderButton}
            onPress={() => setAboutExpanded((v) => !v)}
            activeOpacity={0.82}
            testID="toggle-about"
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(168,85,247,0.1)' }]}>
                <FileText size={16} color="#A855F7" />
              </View>
              <View>
                <Text style={styles.sectionHeaderTitle}>О себе</Text>
                <Text style={styles.sectionHeaderSub}>{user?.about ? 'Заполнено' : 'Не заполнено'}</Text>
              </View>
            </View>
            {aboutExpanded ? <ChevronUp size={18} color={Colors.textSecondary} /> : <ChevronDown size={18} color={Colors.textSecondary} />}
          </TouchableOpacity>
          {aboutExpanded ? (
            <View style={styles.expandedContent}>
              {user?.about ? (
                <View style={styles.aboutTextCard}>
                  <Text style={styles.aboutText}>{user.about}</Text>
                </View>
              ) : (
                <View style={styles.aboutEmptyCard}>
                  <Text style={styles.aboutEmptyText}>Расскажите о себе, своём опыте и навыках</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleEditAbout}
                activeOpacity={0.8}
                testID="edit-about"
              >
                <Pencil size={16} color={Colors.primary} />
                <Text style={styles.addButtonText}>{user?.about ? 'Редактировать' : 'Написать о себе'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {role === 'executor' ? (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.sectionHeaderButton}
            onPress={() => setPortfolioExpanded((v) => !v)}
            activeOpacity={0.82}
            testID="toggle-portfolio"
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(245,158,11,0.1)' }]}>
                <ImagePlus size={16} color="#F59E0B" />
              </View>
              <View>
                <Text style={styles.sectionHeaderTitle}>Портфолио</Text>
                <Text style={styles.sectionHeaderSub}>{portfolioPhotos.length} фото</Text>
              </View>
            </View>
            {portfolioExpanded ? <ChevronUp size={18} color={Colors.textSecondary} /> : <ChevronDown size={18} color={Colors.textSecondary} />}
          </TouchableOpacity>
          {portfolioExpanded ? (
            <View style={styles.expandedContent}>
              {portfolioPhotos.length > 0 ? (
                <View style={styles.portfolioGrid}>
                  {portfolioPhotos.map((photo, idx) => (
                    <TouchableOpacity
                      key={photo.id}
                      style={styles.portfolioPhotoWrap}
                      activeOpacity={0.8}
                      onPress={() => { setPhotoViewerIndex(idx); setShowPhotoViewer(true); }}
                      onLongPress={() => handleRemovePortfolioPhoto(photo.id)}
                    >
                      {isSafeImageUri(photo.photoUrl) ? (
                        <Image
                          source={{ uri: photo.photoUrl }}
                          style={styles.portfolioPhoto}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={120}
                        />
                      ) : (
                        <View style={[styles.portfolioPhoto, { backgroundColor: Colors.cardSecondary }]} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.aboutEmptyCard}>
                  <Text style={styles.aboutEmptyText}>Добавьте фото своих работ</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => void handleAddPortfolioPhoto()}
                activeOpacity={0.8}
                testID="add-portfolio-photo"
              >
                <ImagePlus size={18} color={Colors.primary} />
                <Text style={styles.addButtonText}>Добавить фото</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {role === 'executor' ? (
        <View style={styles.sectionCard}>
          <TouchableOpacity
            style={styles.sectionHeaderButton}
            onPress={() => setServicesExpanded((v) => !v)}
            activeOpacity={0.82}
            testID="toggle-services-profile"
          >
            <View style={styles.sectionHeaderLeft}>
              <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(56,189,248,0.1)' }]}>
                <Settings size={16} color={Colors.info} />
              </View>
              <View>
                <Text style={styles.sectionHeaderTitle}>Мои услуги</Text>
                <Text style={styles.sectionHeaderSub}>{subscribedServices.length} услуг выбрано</Text>
              </View>
            </View>
            {servicesExpanded ? <ChevronUp size={18} color={Colors.textSecondary} /> : <ChevronDown size={18} color={Colors.textSecondary} />}
          </TouchableOpacity>
          {servicesExpanded ? (
            <View style={styles.expandedContent}>
              {subscribedServices.map((service) => (
                <View key={service.id} style={styles.serviceItem}>
                  <View style={[styles.serviceItemIcon, { backgroundColor: service.bgColor }]}>
                    <ServiceIcon name={service.icon} size={16} color={service.color} />
                  </View>
                  <Text style={styles.serviceItemText}>{service.name}</Text>
                </View>
              ))}
              <TouchableOpacity
                style={styles.addButton}
                onPress={openEditServices}
                activeOpacity={0.8}
                testID="edit-services"
              >
                <Settings size={18} color={Colors.primary} />
                <Text style={styles.addButtonText}>Редактировать услуги</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.sectionCard}>
        <TouchableOpacity
          style={styles.sectionHeaderButton}
          onPress={() => { setHistoryExpanded((v) => !v); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          activeOpacity={0.82}
          testID="toggle-history"
        >
          <View style={styles.sectionHeaderLeft}>
            <View style={[styles.sectionIconWrap, { backgroundColor: 'rgba(34,197,94,0.1)' }]}>
              <History size={16} color={Colors.success} />
            </View>
            <View>
              <Text style={styles.sectionHeaderTitle}>История и сводка</Text>
              <Text style={styles.sectionHeaderSub}>{myCompletedCount} {myCompletedCount === 1 ? 'выполнена' : myCompletedCount < 5 ? 'выполнены' : 'выполнено'}</Text>
            </View>
          </View>
          {historyExpanded ? <ChevronUp size={18} color={Colors.textSecondary} /> : <ChevronDown size={18} color={Colors.textSecondary} />}
        </TouchableOpacity>
        {historyExpanded ? (
          <View style={styles.expandedContent}>
            {role === 'executor' ? (
              <TouchableOpacity
                style={styles.summaryLinkCard}
                activeOpacity={0.7}
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('/executor-summary');
                }}
                testID="executor-summary-btn"
              >
                <View style={[styles.summaryLinkIcon, { backgroundColor: 'rgba(74,222,128,0.1)' }]}>
                  <BarChart3 size={18} color={Colors.success} />
                </View>
                <View style={styles.summaryLinkInfo}>
                  <Text style={styles.summaryLinkTitle}>Сводные данные</Text>
                  <Text style={styles.summaryLinkSub}>Статистика и аналитика</Text>
                </View>
                <ChevronRight size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            ) : null}
            {myCompletedList.length === 0 ? (
              <View style={styles.historyEmptyCard}>
                <Text style={styles.historyEmptyText}>Завершённых заявок пока нет</Text>
              </View>
            ) : (
              <>
                {myCompletedList.slice(0, historyShowAll ? myCompletedList.length : 5).map((req) => {
                  const cat = serviceCategories.find((c) => c.id === req.categoryId);
                  const completedDate = req.completedAt ? new Date(req.completedAt) : new Date(req.createdAt);
                  const dateStr = `${completedDate.getDate().toString().padStart(2, '0')}.${(completedDate.getMonth() + 1).toString().padStart(2, '0')}.${completedDate.getFullYear()}`;
                  const ratingVal = role === 'executor' ? req.clientRatingByExecutor : req.executorRatingByClient;
                  const reviewText = role === 'executor' ? req.clientReviewByExecutor : req.executorReviewByClient;
                  const counterpartyName = role === 'executor' ? req.clientName : req.masterName;

                  return (
                    <TouchableOpacity
                      key={req.id}
                      style={styles.historyItem}
                      activeOpacity={0.7}
                      onPress={() => router.push({ pathname: '/request-details', params: { id: req.id } })}
                    >
                      <View style={styles.historyItemTop}>
                        <View style={[styles.historyItemIcon, { backgroundColor: cat?.bgColor ?? Colors.primaryLight }]}>
                          <ServiceIcon name={cat?.icon ?? 'Wrench'} size={16} color={cat?.color ?? Colors.primary} />
                        </View>
                        <View style={styles.historyItemInfo}>
                          <Text style={styles.historyItemTitle} numberOfLines={1}>{req.categoryName}</Text>
                          <View style={styles.historyItemMetaRow}>
                            <View style={styles.historyCompletedBadge}>
                              <CheckCircle size={10} color={Colors.success} />
                              <Text style={styles.historyCompletedText}>{dateStr}</Text>
                            </View>
                            {req.acceptablePrice ? (
                              <Text style={styles.historyPrice}>{req.acceptablePrice}</Text>
                            ) : null}
                          </View>
                        </View>
                        {ratingVal ? (
                          <View style={styles.historyRatingBadge}>
                            <Star size={12} color={Colors.accent} fill={Colors.accent} />
                            <Text style={styles.historyRatingText}>{ratingVal}</Text>
                          </View>
                        ) : null}
                      </View>
                      {counterpartyName ? (
                        <View style={styles.historyCounterparty}>
                          <User size={11} color={Colors.textMuted} />
                          <Text style={styles.historyCounterpartyText}>{role === 'executor' ? 'Клиент' : 'Исполнитель'}: {counterpartyName}</Text>
                        </View>
                      ) : null}
                      {reviewText ? (
                        <Text style={styles.historyReview} numberOfLines={2}>«{reviewText}»</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
                {myCompletedList.length > 5 && !historyShowAll ? (
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setHistoryShowAll(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addButtonText}>Показать все ({myCompletedList.length})</Text>
                  </TouchableOpacity>
                ) : myCompletedList.length > 5 && historyShowAll ? (
                  <TouchableOpacity
                    style={styles.addButton}
                    onPress={() => setHistoryShowAll(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.addButtonText}>Свернуть</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.addButton, { marginTop: 4 }]}
                  onPress={() => {
                    console.log('[Navigation Error]', 'profile history CTA → requests', {
                      tab: 'history',
                      userId: user?.id ?? null,
                      hasUser: !!user,
                      role,
                    });
                    router.push({ pathname: '/(tabs)/requests', params: { tab: 'history' } });
                  }}
                  activeOpacity={0.8}
                >
                  <History size={16} color={Colors.primary} />
                  <Text style={styles.addButtonText}>Перейти в историю</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.menuSection}>
        {biometricAvailable && Platform.OS !== 'web' ? (
          <>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.6}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void handleToggleBiometric();
              }}
              testID="toggle-biometric"
            >
              <View style={[styles.menuIcon, { backgroundColor: biometricEnabled ? 'rgba(74,222,128,0.12)' : 'rgba(127,164,139,0.12)' }]}>
                {biometricType === 'facial' ? (
                  <ScanFace size={20} color={biometricEnabled ? '#4ADE80' : Colors.textSecondary} />
                ) : (
                  <Fingerprint size={20} color={biometricEnabled ? '#4ADE80' : Colors.textSecondary} />
                )}
              </View>
              <View style={styles.biometricMenuContent}>
                <Text style={styles.menuLabel}>{biometricLabel}</Text>
                <Text style={styles.biometricStatusText}>
                  {biometricEnabled ? 'Включён' : 'Выключен'}
                </Text>
              </View>
              <View style={[styles.biometricToggle, biometricEnabled && styles.biometricToggleActive]}>
                <View style={[styles.biometricToggleDot, biometricEnabled && styles.biometricToggleDotActive]} />
              </View>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
          </>
        ) : null}
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            void handleOpenSupportChat();
          }}
        >
          <View style={[styles.menuIcon, { backgroundColor: Colors.textSecondary + '15' }]}>
            <HelpCircle size={20} color={Colors.textSecondary} />
          </View>
          <Text style={styles.menuLabel}>Помощь и поддержка</Text>
          <View style={styles.menuChevronWrap}>
            {supportChatLoading ? (
              <MLoader size="small" color={Colors.textMuted} />
            ) : (
              <ChevronRight size={16} color={Colors.textMuted} />
            )}
          </View>
        </TouchableOpacity>
        <View style={styles.menuDivider} />
        <TouchableOpacity
          style={styles.menuItem}
          activeOpacity={0.6}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/settings');
          }}
          testID="open-settings"
        >
          <View style={[styles.menuIcon, { backgroundColor: 'rgba(167,139,250,0.12)' }]}>
            <Settings size={20} color="#A78BFA" />
          </View>
          <Text style={styles.menuLabel}>Настройки</Text>
          <View style={styles.menuChevronWrap}>
            <ChevronRight size={16} color={Colors.textMuted} />
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        activeOpacity={0.7}
        onPress={handleLogout}
      >
        <LogOut size={18} color={Colors.danger} />
        <Text style={styles.logoutText}>Выйти</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.deleteAccountButton}
        activeOpacity={0.7}
        onPress={handleDeleteAccount}
        disabled={isDeletingAccount}
        testID="delete-account-profile"
      >
        {isDeletingAccount ? (
          <MLoader size="small" color={Colors.danger} />
        ) : (
          <>
            <Trash2 size={16} color={Colors.textMuted} />
            <Text style={styles.deleteAccountText}>Удалить аккаунт</Text>
          </>
        )}
      </TouchableOpacity>

      <Text style={styles.footerText}>musorka.su</Text>

      <View style={{ height: 100 }} />

      <Modal visible={showEditNameModal} transparent animationType="slide" onRequestClose={() => setShowEditNameModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditNameModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Имя и фамилия</Text>
              <TouchableOpacity onPress={() => setShowEditNameModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <View style={styles.nameFormFields}>
              <View style={styles.formRow}>
                <Text style={styles.formFieldLabel}>Имя <Text style={styles.requiredStar}>*</Text></Text>
                <TextInput
                  {...givenNameInputProps}
                  style={[styles.modalInput, editNameError ? styles.modalInputError : null]}
                  value={editFirstName}
                  onChangeText={(t) => { setEditFirstName(t); setEditNameError(''); }}
                  placeholder="Иван"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                  testID="edit-first-name"
                />
              </View>
              <View style={styles.formRow}>
                <Text style={styles.formFieldLabel}>Фамилия</Text>
                <TextInput
                  {...familyNameInputProps}
                  style={styles.modalInput}
                  value={editLastName}
                  onChangeText={setEditLastName}
                  placeholder="Иванов"
                  placeholderTextColor={Colors.textMuted}
                  testID="edit-last-name"
                />
              </View>
            </View>
            {editNameError ? <Text style={styles.formError}>{editNameError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSaveName()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-name"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditPhoneModal} transparent animationType="slide" onRequestClose={() => setShowEditPhoneModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditPhoneModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Номер телефона</Text>
              <TouchableOpacity onPress={() => setShowEditPhoneModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              {...phoneInputProps}
              style={[styles.modalInput, editPhoneError ? styles.modalInputError : null]}
              value={editPhone}
              onChangeText={(t) => { setEditPhone(t); setEditPhoneError(''); }}
              placeholder="+7 (999) 123-45-67"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              testID="edit-phone-input"
            />
            {editPhoneError ? <Text style={styles.formError}>{editPhoneError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSavePhone()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-phone"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditEmailModal} transparent animationType="slide" onRequestClose={() => setShowEditEmailModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditEmailModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Email</Text>
              <TouchableOpacity onPress={() => setShowEditEmailModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              {...emailInputProps}
              style={[styles.modalInput, editEmailError ? styles.modalInputError : null]}
              value={editEmail}
              onChangeText={(t) => { setEditEmail(t); setEditEmailError(''); }}
              placeholder="email@example.com"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              testID="edit-email-input"
            />
            {editEmailError ? <Text style={styles.formError}>{editEmailError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSaveEmail()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-email"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showAddAddressModal} transparent animationType="slide" onRequestClose={() => setShowAddAddressModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowAddAddressModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый адрес</Text>
              <TouchableOpacity onPress={() => setShowAddAddressModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.addressFormScroll}>
              {renderAddressFormFields()}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSaveNewAddress()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-address"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditAddressModal} transparent animationType="slide" onRequestClose={() => setShowEditAddressModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditAddressModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Редактировать адрес</Text>
              <TouchableOpacity onPress={() => setShowEditAddressModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={styles.addressFormScroll}>
              {renderAddressFormFields()}
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleUpdateAddress()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="update-address"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditServicesModal} transparent animationType="slide" onRequestClose={() => setShowEditServicesModal(false)}>
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditServicesModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Редактировать услуги</Text>
              <TouchableOpacity onPress={() => setShowEditServicesModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Выберите услуги, по которым хотите получать заявки</Text>
            <ScrollView style={styles.servicesScrollModal} showsVerticalScrollIndicator={false}>
              {serviceCategories.map((service) => {
                const selected = editServiceIds.includes(service.id);
                return (
                  <TouchableOpacity
                    key={service.id}
                    style={[styles.serviceChipModal, selected && styles.serviceChipModalSelected]}
                    onPress={() => toggleEditService(service.id)}
                    activeOpacity={0.82}
                    testID={`edit-service-${service.id}`}
                  >
                    <View style={[styles.serviceItemIcon, { backgroundColor: service.bgColor }]}>
                      <ServiceIcon name={service.icon} size={16} color={service.color} />
                    </View>
                    <Text style={[styles.serviceChipModalText, selected && styles.serviceChipModalTextSelected]}>{service.name}</Text>
                    {selected ? <Check size={16} color={Colors.white} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalSaveButton} onPress={handleSaveServices} activeOpacity={0.85} testID="save-services">
              <Text style={styles.modalSaveText}>Сохранить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditStatusModal} transparent animationType="slide" onRequestClose={() => setShowEditStatusModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditStatusModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Статус</Text>
              <TouchableOpacity onPress={() => setShowEditStatusModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Короткая фраза (не более 5 слов), видимая всем</Text>
            <TextInput
              {...plainFieldProps}
              style={[styles.modalInput, editStatusError ? styles.modalInputError : null]}
              value={editStatusText}
              onChangeText={(t) => { setEditStatusText(t); setEditStatusError(''); }}
              placeholder="Работаю на совесть!"
              placeholderTextColor={Colors.textMuted}
              maxLength={60}
              autoFocus
              testID="edit-status-input"
            />
            <Text style={styles.statusWordCount}>
              {editStatusText.trim().split(/\s+/).filter(Boolean).length} / 5 слов
            </Text>
            {editStatusError ? <Text style={styles.formError}>{editStatusError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSaveStatus()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-status"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showEditAboutModal} transparent animationType="slide" onRequestClose={() => setShowEditAboutModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowEditAboutModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>О себе</Text>
              <TouchableOpacity onPress={() => setShowEditAboutModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Расскажите о своём опыте, навыках и квалификации</Text>
            <TextInput
              style={[styles.modalInput, styles.aboutTextArea, editAboutError ? styles.modalInputError : null]}
              value={editAbout}
              onChangeText={(t) => { setEditAbout(t); setEditAboutError(''); }}
              placeholder="Опытный сантехник с 10-летним стажем..."
              placeholderTextColor={Colors.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus
              testID="edit-about-input"
            />
            {editAboutError ? <Text style={styles.formError}>{editAboutError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleSaveAbout()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="save-about"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showBiometricPasswordModal} transparent animationType="slide" onRequestClose={() => setShowBiometricPasswordModal(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={styles.modalOverlayTouch} activeOpacity={1} onPress={() => setShowBiometricPasswordModal(false)} />
          <View style={styles.modalCard}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{biometricLabel}</Text>
              <TouchableOpacity onPress={() => setShowBiometricPasswordModal(false)} style={styles.modalCloseBtn}>
                <X size={20} color={Colors.textMuted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.biometricModalDesc}>
              Введите пароль аккаунта, чтобы включить быстрый вход
            </Text>
            <View style={styles.biometricPasswordWrap}>
              <TextInput
                {...passwordInputProps}
                style={[styles.modalInput, biometricPasswordError ? styles.modalInputError : null]}
                value={biometricPassword}
                onChangeText={(t) => { setBiometricPassword(t); setBiometricPasswordError(''); }}
                placeholder="Пароль"
                placeholderTextColor={Colors.textMuted}
                secureTextEntry={!showBiometricPassword}
                autoFocus
                testID="biometric-password-input"
              />
              <TouchableOpacity
                onPress={() => setShowBiometricPassword((v) => !v)}
                style={styles.biometricEyeBtn}
              >
                {showBiometricPassword ? (
                  <EyeOff size={16} color={Colors.textMuted} />
                ) : (
                  <Eye size={16} color={Colors.textMuted} />
                )}
              </TouchableOpacity>
            </View>
            {biometricPasswordError ? <Text style={styles.formError}>{biometricPasswordError}</Text> : null}
            <TouchableOpacity
              style={[styles.modalSaveButton, isSaving && styles.modalSaveButtonDisabled]}
              onPress={() => void handleConfirmBiometric()}
              activeOpacity={0.85}
              disabled={isSaving}
              testID="confirm-biometric"
            >
              {isSaving ? (
                <MLoader size="small" color={Colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Включить</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showPhotoViewer} transparent animationType="fade" onRequestClose={() => setShowPhotoViewer(false)}>
        <View style={styles.photoViewerOverlay}>
          <TouchableOpacity style={styles.photoViewerCloseBtn} onPress={() => setShowPhotoViewer(false)}>
            <X size={24} color={Colors.white} />
          </TouchableOpacity>
          {portfolioPhotos[photoViewerIndex] && isSafeImageUri(portfolioPhotos[photoViewerIndex].photoUrl) ? (
            <ZoomableImage
              uri={portfolioPhotos[photoViewerIndex].photoUrl}
              style={styles.photoViewerImage}
              contentFit="contain"
            />
          ) : null}
          <View style={styles.photoViewerActions}>
            <TouchableOpacity
              style={styles.photoViewerDeleteBtn}
              onPress={() => {
                const photo = portfolioPhotos[photoViewerIndex];
                if (photo) {
                  setShowPhotoViewer(false);
                  handleRemovePortfolioPhoto(photo.id);
                }
              }}
            >
              <Trash2 size={18} color={Colors.danger} />
              <Text style={styles.photoViewerDeleteText}>Удалить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

export default function ProfileScreen() {
  return (
    <ScreenErrorBoundary screenName="Профиль">
      <ProfileScreenInner />
    </ScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  userLoadingGate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 20,
  },
  profileHeader: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  profileHeaderDecor1: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(255,255,255,0.04)',
    top: -60,
    right: -40,
  },
  profileHeaderDecor2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(110,231,163,0.05)',
    bottom: -30,
    left: -20,
  },
  avatarSection: {
    marginBottom: 16,
  },
  avatarOuter: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontSize: 22,
    fontWeight: '800' as const,
    color: Colors.white,
    letterSpacing: -0.3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  nameFormFields: {
    gap: 12,
    marginBottom: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  userIdBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 6,
  },
  userIdText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
  phone: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 18,
    padding: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.white,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  earningsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    backgroundColor: 'rgba(74,222,128,0.08)',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(74,222,128,0.15)',
  },
  earningsIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(74,222,128,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  earningsInfo: {
    flex: 1,
  },
  earningsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  earningsValue: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#4ADE80',
    marginTop: 1,
  },
  earningsDividerVert: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  statusTextRow: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusTextDisplay: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.7)',
    fontStyle: 'italic' as const,
    textAlign: 'center' as const,
  },
  statusTextRowEmpty: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    marginBottom: 14,
    paddingVertical: 4,
  },
  statusTextEmpty: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '600' as const,
  },
  statusWordCount: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'right' as const,
    marginTop: 6,
  },
  contactSection: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  contactIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 46,
  },
  contactText: {
    fontSize: 14,
    color: Colors.text,
    flex: 1,
  },
  locationContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timezoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(127,164,139,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timezoneText: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600' as const,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    overflow: 'hidden',
  },
  sectionHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  sectionHeaderSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  expandedContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  addressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  addressItemContent: {
    flex: 1,
  },
  addressItemLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 2,
  },
  addressItemText: {
    fontSize: 14,
    color: Colors.text,
  },
  addressActions: {
    flexDirection: 'row',
    gap: 6,
    marginLeft: 8,
  },
  editButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.infoLight,
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dangerLight,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  serviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  serviceItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  menuSection: {
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  menuDivider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 50,
  },
  menuChevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCompletedBadge: {
    backgroundColor: 'rgba(34,197,94,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginRight: 8,
  },
  menuCompletedCount: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.success,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  demoCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  demoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  demoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#FBBF24',
  },
  demoBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#1F2937',
    letterSpacing: 0.8,
  },
  demoTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  demoSub: {
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 12,
    lineHeight: 17,
  },
  demoSegment: {
    flexDirection: 'row',
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  demoSegmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  demoSegmentItemActive: {
    backgroundColor: Colors.primary,
  },
  demoSegmentText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  demoSegmentTextActive: {
    color: Colors.white,
  },
  demoHint: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  footerText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 12,
  },
  deleteAccountText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'flex-end',
  },
  modalOverlayTouch: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: Colors.text,
  },
  modalInputError: {
    borderColor: Colors.danger,
  },
  modalSaveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  modalSaveButtonDisabled: {
    opacity: 0.7,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  addressFormScroll: {
    maxHeight: 400,
  },
  addressFormFields: {
    gap: 12,
  },
  formRow: {
    gap: 6,
  },
  formRowDouble: {
    flexDirection: 'row',
    gap: 10,
  },
  formFieldHalf: {
    flex: 1,
    gap: 6,
  },
  formFieldLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
  },
  requiredStar: {
    color: Colors.danger,
  },
  formError: {
    fontSize: 13,
    color: Colors.danger,
    marginTop: 6,
  },
  servicesScrollModal: {
    maxHeight: 400,
    marginBottom: 6,
  },
  serviceChipModal: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  serviceChipModalSelected: {
    backgroundColor: Colors.primaryDark,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  serviceChipModalText: {
    flex: 1,
    fontSize: 13,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  serviceChipModalTextSelected: {
    color: Colors.white,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarVerifiedBadge: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: '#052E1C',
  },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#052E1C',
  },
  historyEmptyCard: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center' as const,
  },
  historyEmptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  historyItem: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    gap: 8,
  },
  historyItemTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  historyItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  historyItemInfo: {
    flex: 1,
    gap: 3,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  historyItemMetaRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  historyCompletedBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    backgroundColor: 'rgba(34,197,94,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  historyCompletedText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '600' as const,
  },
  historyPrice: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  historyRatingBadge: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: 'rgba(245,158,11,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  historyRatingText: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '700' as const,
  },
  historyCounterparty: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    marginLeft: 46,
  },
  historyCounterpartyText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  historyReview: {
    fontSize: 12,
    color: Colors.textMuted,
    fontStyle: 'italic' as const,
    marginLeft: 46,
    lineHeight: 17,
  },
  summaryLinkCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
    gap: 10,
  },
  summaryLinkIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  summaryLinkInfo: {
    flex: 1,
    gap: 2,
  },
  summaryLinkTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  summaryLinkSub: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  verifiedBadgeInline: {
    marginLeft: 4,
  },
  aboutTextCard: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  aboutText: {
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  aboutEmptyCard: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center' as const,
  },
  aboutEmptyText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  aboutTextArea: {
    minHeight: 120,
    textAlignVertical: 'top' as const,
  },
  portfolioGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  portfolioPhotoWrap: {
    width: '31%' as any,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden' as const,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR,
  },
  portfolioPhoto: {
    width: '100%' as any,
    height: '100%' as any,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  photoViewerCloseBtn: {
    position: 'absolute' as const,
    top: 60,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 10,
  },
  photoViewerImage: {
    width: '90%' as any,
    height: '60%' as any,
  },
  photoViewerActions: {
    position: 'absolute' as const,
    bottom: 60,
    alignItems: 'center' as const,
  },
  photoViewerDeleteBtn: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    backgroundColor: 'rgba(248,113,113,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.3)',
  },
  photoViewerDeleteText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.danger,
  },
  biometricMenuContent: {
    flex: 1,
  },
  biometricStatusText: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 1,
  },
  biometricToggle: {
    width: 44,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(127,164,139,0.2)',
    padding: 3,
    justifyContent: 'center' as const,
  },
  biometricToggleActive: {
    backgroundColor: 'rgba(74,222,128,0.3)',
  },
  biometricToggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.textMuted,
  },
  biometricToggleDotActive: {
    backgroundColor: '#4ADE80',
    alignSelf: 'flex-end' as const,
  },
  biometricModalDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
  biometricPasswordWrap: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  biometricEyeBtn: {
    position: 'absolute' as const,
    right: 14,
    top: 14,
  },
});
