import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  Linking,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import {
  Bell,
  BellOff,
  Moon,
  Shield,
  FileText,
  Trash2,
  ChevronRight,
  MessageSquare,
  ClipboardList,
  Megaphone,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Lock,
  X,
  Eye,
  EyeOff,
  User,
  Home,
  Plus,
  Pencil,
  ShieldCheck,
  ShieldOff,
  LifeBuoy,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
const { height: SCREEN_HEIGHT } = Dimensions.get('window');
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useAuth } from '@/providers/AuthProvider';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { trpc } from '@/lib/trpc';
import MLoader from '@/components/MLoader';
import RegionCityPicker from '@/components/RegionCityPicker';
import {
  phoneInputProps,
  emailInputProps,
  passwordInputProps,
  newPasswordInputProps,
  plainFieldProps,
  numericNoSuggestProps,
  streetAddressInputProps,
} from '@/lib/text-input-autofill';

const NOTIF_SETTINGS_KEY = 'musorka_notification_settings';
const SUPPORT_URL = 'https://app.musorka.su/support';

interface NotificationSettings {
  newMessages: boolean;
  requestUpdates: boolean;
  promotions: boolean;
  systemAlerts: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  newMessages: true,
  requestUpdates: true,
  promotions: true,
  systemAlerts: true,
};

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

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout, role, updateProfile, addAddress, removeAddress } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [dnd, setDnd] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const floatingHeaderHeight = useFloatingHeaderHeight();

  const [showEditPhoneModal, setShowEditPhoneModal] = useState<boolean>(false);
  const [showEditEmailModal, setShowEditEmailModal] = useState<boolean>(false);
  const [showEditLocationModal, setShowEditLocationModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showAddAddressModal, setShowAddAddressModal] = useState<boolean>(false);
  const [show2FAModal, setShow2FAModal] = useState<boolean>(false);
  const [twoFACode, setTwoFACode] = useState<string>('');
  const [twoFAError, setTwoFAError] = useState<string>('');
  const [twoFAMaskedEmail, setTwoFAMaskedEmail] = useState<string>('');
  const [twoFAStep, setTwoFAStep] = useState<'confirm' | 'code'>('confirm');
  const [is2FAToggling, setIs2FAToggling] = useState<boolean>(false);

  const [editPhone, setEditPhone] = useState<string>('');
  const [editPhoneError, setEditPhoneError] = useState<string>('');
  const [editEmail, setEditEmail] = useState<string>('');
  const [editEmailError, setEditEmailError] = useState<string>('');
  const [editRegion, setEditRegion] = useState<string>('');
  const [editCity, setEditCity] = useState<string>('');
  const [editLocationError, setEditLocationError] = useState<string>('');

  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [showCurrentPassword, setShowCurrentPassword] = useState<boolean>(false);
  const [showNewPassword, setShowNewPassword] = useState<boolean>(false);

  const [addrLabel, setAddrLabel] = useState<string>('');
  const [addrStreet, setAddrStreet] = useState<string>('');
  const [addrHouse, setAddrHouse] = useState<string>('');
  const [addrBuilding, setAddrBuilding] = useState<string>('');
  const [addrApartment, setAddrApartment] = useState<string>('');
  const [addrEntrance, setAddrEntrance] = useState<string>('');
  const [addrFloor, setAddrFloor] = useState<string>('');
  const [addrIntercom, setAddrIntercom] = useState<string>('');
  const [addrError, setAddrError] = useState<string>('');

  const twoFAStatusQuery = trpc.auth.get2FAStatus.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60000,
  });

  const toggle2FAMutation = trpc.auth.toggle2FA.useMutation({
    onSuccess: (data: any) => {
      if (data.needsVerification) {
        setTwoFAMaskedEmail(data.email || '');
        setTwoFAStep('code');
        setTwoFACode('');
        setTwoFAError('');
        setIs2FAToggling(false);
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void twoFAStatusQuery.refetch();
      setShow2FAModal(false);
      setTwoFACode('');
      setTwoFAError('');
      setIs2FAToggling(false);
      Alert.alert('Готово', data.enabled ? 'Двухфакторная аутентификация включена' : 'Двухфакторная аутентификация отключена');
    },
    onError: (err) => {
      console.error('[Settings] toggle2FA error:', err.message);
      setTwoFAError(err.message || 'Ошибка');
      setIs2FAToggling(false);
    },
  });

  const saveSettingsMutation = trpc.notifications.saveSettings.useMutation({
    onError: (err) => {
      console.error('[Settings] Failed to sync notification settings to server:', err.message);
    },
  });

  const notifSettingsQuery = trpc.notifications.getSettings.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60000,
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Успех', 'Пароль успешно изменён');
      setShowChangePasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
    },
    onError: (err) => {
      console.error('[Settings] Change password error:', err.message);
      setPasswordError(err.message || 'Не удалось сменить пароль');
    },
    onSettled: () => {
      setIsSaving(false);
    },
  });

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
      console.error('[Settings] Delete account error:', err.message);
      Alert.alert('Ошибка', err.message || 'Не удалось удалить аккаунт');
    },
    onSettled: () => {
      setIsDeleting(false);
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(NOTIF_SETTINGS_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as NotificationSettings;
          setSettings(parsed);
          const allOff = !parsed.newMessages && !parsed.requestUpdates && !parsed.promotions && !parsed.systemAlerts;
          setDnd(allOff);
        }
      } catch (e) {
        console.error('[Settings] Failed to load notification settings:', e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (notifSettingsQuery.data) {
      const serverSettings = notifSettingsQuery.data as Record<string, unknown>;
      const nm = serverSettings.new_messages ?? serverSettings.newMessages;
      const ru = serverSettings.request_updates ?? serverSettings.requestUpdates;
      const pr = serverSettings.promotions;
      const sa = serverSettings.system_alerts ?? serverSettings.systemAlerts;
      if (nm !== undefined) {
        const parsed: NotificationSettings = {
          newMessages: nm === true,
          requestUpdates: ru === true,
          promotions: pr === true,
          systemAlerts: sa === true,
        };
        setSettings(parsed);
        const allOff = !parsed.newMessages && !parsed.requestUpdates && !parsed.promotions && !parsed.systemAlerts;
        setDnd(allOff);
        void AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(parsed));
        console.log('[Settings] Loaded notification settings from server');
      }
    }
  }, [notifSettingsQuery.data]);

  const saveSettings = useCallback(async (newSettings: NotificationSettings) => {
    setSettings(newSettings);
    try {
      await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify(newSettings));
      saveSettingsMutation.mutate(newSettings);
      console.log('[Settings] Notification settings saved and synced');
    } catch (e) {
      console.error('[Settings] Failed to save settings:', e);
    }
  }, [saveSettingsMutation]);

  const handleToggle = useCallback((key: keyof NotificationSettings) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newSettings = { ...settings, [key]: !settings[key] };
    const allOff = !newSettings.newMessages && !newSettings.requestUpdates && !newSettings.promotions && !newSettings.systemAlerts;
    setDnd(allOff);
    void saveSettings(newSettings);
  }, [settings, saveSettings]);

  const handleDndToggle = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const newDnd = !dnd;
    setDnd(newDnd);
    if (newDnd) {
      const allOff: NotificationSettings = {
        newMessages: false,
        requestUpdates: false,
        promotions: false,
        systemAlerts: false,
      };
      void saveSettings(allOff);
    } else {
      void saveSettings(DEFAULT_SETTINGS);
    }
  }, [dnd, saveSettings]);

  const handleEditPhone = useCallback(() => {
    setEditPhone(user?.phone ?? '');
    setEditPhoneError('');
    setShowEditPhoneModal(true);
  }, [user?.phone]);

  const handleSavePhone = useCallback(async () => {
    const error = validatePhone(editPhone);
    if (error) { setEditPhoneError(error); return; }
    setIsSaving(true);
    try {
      await updateProfile({ phone: editPhone.trim() });
      setShowEditPhoneModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    if (error) { setEditEmailError(error); return; }
    setIsSaving(true);
    try {
      await updateProfile({ email: editEmail.trim() });
      setShowEditEmailModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setEditEmailError('Не удалось обновить email');
    } finally {
      setIsSaving(false);
    }
  }, [editEmail, updateProfile]);

  const handleEditLocation = useCallback(() => {
    setEditRegion(user?.region ?? '');
    setEditCity(user?.city ?? '');
    setEditLocationError('');
    setShowEditLocationModal(true);
  }, [user?.region, user?.city]);

  const handleSaveLocation = useCallback(async () => {
    if (!editRegion) { setEditLocationError('Выберите регион'); return; }
    if (!editCity) { setEditLocationError('Выберите город'); return; }
    setIsSaving(true);
    try {
      await updateProfile({ city: editCity, region: editRegion });
      setShowEditLocationModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setEditLocationError('Не удалось обновить местоположение');
    } finally {
      setIsSaving(false);
    }
  }, [editRegion, editCity, updateProfile]);

  const handleChangePassword = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowChangePasswordModal(true);
  }, []);

  const handleSavePassword = useCallback(() => {
    if (!currentPassword.trim()) { setPasswordError('Введите текущий пароль'); return; }
    if (newPassword.length < 4) { setPasswordError('Новый пароль минимум 4 символа'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('Пароли не совпадают'); return; }
    setIsSaving(true);
    setPasswordError('');
    changePasswordMutation.mutate({ currentPassword: currentPassword.trim(), newPassword: newPassword });
  }, [currentPassword, newPassword, confirmPassword, changePasswordMutation]);

  const handleOpenAddAddress = useCallback(() => {
    setAddrLabel('');
    setAddrStreet('');
    setAddrHouse('');
    setAddrBuilding('');
    setAddrApartment('');
    setAddrEntrance('');
    setAddrFloor('');
    setAddrIntercom('');
    setAddrError('');
    setShowAddAddressModal(true);
  }, []);

  const handleSaveNewAddress = useCallback(async () => {
    if (!addrStreet.trim()) { setAddrError('Укажите улицу'); return; }
    if (!addrHouse.trim()) { setAddrError('Укажите дом'); return; }
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
        city: user?.city ?? '',
        street: addrStreet.trim(),
        house: addrHouse.trim(),
        building: addrBuilding.trim() || undefined,
        apartment: addrApartment.trim() || undefined,
        entrance: addrEntrance.trim() || undefined,
        floor: addrFloor.trim() || undefined,
        intercom: addrIntercom.trim() || undefined,
      });
      setShowAddAddressModal(false);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setAddrError('Не удалось добавить адрес');
    } finally {
      setIsSaving(false);
    }
  }, [addrLabel, addrStreet, addrHouse, addrBuilding, addrApartment, addrEntrance, addrFloor, addrIntercom, addAddress, user?.city]);

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
          } catch {
            Alert.alert('Ошибка', 'Не удалось удалить адрес');
          }
        },
      },
    ]);
  }, [removeAddress]);

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
            setIsDeleting(true);
            deleteAccountMutation.mutate({ confirmPassword: undefined });
          },
        },
      ]
    );
  }, [deleteAccountMutation]);

  const handleOpenUrl = useCallback((url: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void Linking.openURL(url);
  }, []);

  const userAddresses = user?.addresses ?? [];

  if (!loaded) {
    return (
      <View style={s.loadingContainer}>
        <Stack.Screen options={{ title: 'Настройки' }} />
        <MLoader size="large" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
    <FloatingHeader showBack title="Настройки" />
    <ScrollView style={s.container} contentContainerStyle={[s.content, { paddingTop: floatingHeaderHeight }]} showsVerticalScrollIndicator={false}>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Учётные данные</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.accountRow} activeOpacity={0.7} onPress={handleEditPhone} testID="settings-edit-phone">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(56,189,248,0.12)' }]}>
              <Phone size={18} color="#38BDF8" />
            </View>
            <View style={s.accountInfo}>
              <Text style={s.accountLabel}>Телефон</Text>
              <Text style={s.accountValue}>{user?.phone || 'Не указан'}</Text>
            </View>
            <Pencil size={14} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.accountRow} activeOpacity={0.7} onPress={handleEditEmail} testID="settings-edit-email">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(168,85,247,0.12)' }]}>
              <Mail size={18} color="#A855F7" />
            </View>
            <View style={s.accountInfo}>
              <Text style={s.accountLabel}>Email</Text>
              <Text style={s.accountValue}>{user?.email || 'Не указан'}</Text>
            </View>
            <Pencil size={14} color={Colors.textMuted} />
          </TouchableOpacity>

          <View style={s.divider} />

          <TouchableOpacity style={s.accountRow} activeOpacity={0.7} onPress={handleEditLocation} testID="settings-edit-location">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(74,222,128,0.12)' }]}>
              <MapPin size={18} color="#4ADE80" />
            </View>
            <View style={s.accountInfo}>
              <Text style={s.accountLabel}>Город / Регион</Text>
              <Text style={s.accountValue} numberOfLines={1}>
                {user?.city ? `${user.city}${user.region ? `, ${user.region}` : ''}` : 'Не указан'}
              </Text>
            </View>
            <Pencil size={14} color={Colors.textMuted} />
          </TouchableOpacity>

          {user?.hasPassword !== false ? (
            <>
              <View style={s.divider} />
              <TouchableOpacity style={s.accountRow} activeOpacity={0.7} onPress={handleChangePassword} testID="settings-change-password">
                <View style={[s.iconWrap, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                  <Lock size={18} color="#FBBF24" />
                </View>
                <View style={s.accountInfo}>
                  <Text style={s.accountLabel}>Пароль</Text>
                  <Text style={s.accountValue}>Изменить пароль</Text>
                </View>
                <ChevronRight size={16} color={Colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>

      {role === 'client' ? (
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Адреса</Text>
            <TouchableOpacity onPress={handleOpenAddAddress} activeOpacity={0.7} style={s.addBtn} testID="settings-add-address">
              <Plus size={14} color={Colors.primary} />
              <Text style={s.addBtnText}>Добавить</Text>
            </TouchableOpacity>
          </View>
          {userAddresses.length > 0 ? (
            <View style={s.card}>
              {userAddresses.map((addr, idx) => (
                <React.Fragment key={addr.id}>
                  {idx > 0 ? <View style={s.divider} /> : null}
                  <View style={s.addressRow}>
                    <View style={[s.iconWrap, { backgroundColor: 'rgba(56,189,248,0.08)' }]}>
                      <Home size={16} color={Colors.info} />
                    </View>
                    <View style={s.addressInfo}>
                      <Text style={s.addressLabel}>{addr.label || 'Адрес'}</Text>
                      <Text style={s.addressText} numberOfLines={2}>{addr.address || '—'}</Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteAddress(addr.id)}
                      activeOpacity={0.7}
                      style={s.addressDeleteBtn}
                    >
                      <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                  </View>
                </React.Fragment>
              ))}
            </View>
          ) : (
            <View style={s.emptyCard}>
              <Text style={s.emptyText}>Адреса не добавлены</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Уведомления</Text>
        <View style={s.card}>
          <View style={s.dndRow}>
            <View style={[s.iconWrap, { backgroundColor: dnd ? 'rgba(248,113,113,0.12)' : 'rgba(127,164,139,0.12)' }]}>
              {dnd ? <BellOff size={20} color={Colors.danger} /> : <Moon size={20} color={Colors.textSecondary} />}
            </View>
            <View style={s.dndTextWrap}>
              <Text style={s.dndTitle}>Не беспокоить</Text>
              <Text style={s.dndSubtitle}>Отключить все уведомления</Text>
            </View>
            <Switch
              value={dnd}
              onValueChange={handleDndToggle}
              trackColor={{ false: Colors.border, true: Colors.danger + '80' }}
              thumbColor={dnd ? Colors.danger : Colors.textMuted}
              testID="dnd-switch"
            />
          </View>

          <View style={s.divider} />

          <NotifRow
            icon={<MessageSquare size={18} color="#38BDF8" />}
            iconBg="rgba(56,189,248,0.12)"
            label="Новые сообщения"
            value={settings.newMessages}
            onToggle={() => handleToggle('newMessages')}
            disabled={dnd}
            testID="notif-messages"
          />
          <NotifRow
            icon={<ClipboardList size={18} color="#4ADE80" />}
            iconBg="rgba(74,222,128,0.12)"
            label="Обновления заявок"
            value={settings.requestUpdates}
            onToggle={() => handleToggle('requestUpdates')}
            disabled={dnd}
            testID="notif-requests"
          />
          <NotifRow
            icon={<Megaphone size={18} color="#FBBF24" />}
            iconBg="rgba(251,191,36,0.12)"
            label="Акции и новости"
            value={settings.promotions}
            onToggle={() => handleToggle('promotions')}
            disabled={dnd}
            testID="notif-promotions"
          />
          <NotifRow
            icon={<Bell size={18} color="#A78BFA" />}
            iconBg="rgba(167,139,250,0.12)"
            label="Системные уведомления"
            value={settings.systemAlerts}
            onToggle={() => handleToggle('systemAlerts')}
            disabled={dnd}
            testID="notif-system"
          />
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Безопасность</Text>
        <View style={s.card}>
          <View style={s.notifRow}>
            <View style={[s.iconWrap, { backgroundColor: 'rgba(74,222,128,0.12)' }]}>
              {twoFAStatusQuery.data?.enabled !== false ? (
                <ShieldCheck size={18} color="#4ADE80" />
              ) : (
                <ShieldOff size={18} color={Colors.textMuted} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.notifLabel}>Двухфакторная аутентификация</Text>
              <Text style={[s.dndSubtitle, { marginTop: 2 }]}>
                {twoFAStatusQuery.data?.enabled !== false ? 'Код по email при каждом входе' : 'Вход без кода подтверждения'}
              </Text>
            </View>
            <Switch
              value={twoFAStatusQuery.data?.enabled !== false}
              onValueChange={(val) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                if (val) {
                  setIs2FAToggling(true);
                  toggle2FAMutation.mutate({ enabled: true });
                } else {
                  setTwoFAStep('confirm');
                  setTwoFACode('');
                  setTwoFAError('');
                  setShow2FAModal(true);
                }
              }}
              trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
              thumbColor={twoFAStatusQuery.data?.enabled !== false ? Colors.primary : Colors.textMuted}
              testID="2fa-switch"
            />
          </View>
        </View>
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Правовая информация</Text>
        <View style={s.card}>
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/legal'); }} testID="privacy-link">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(56,189,248,0.12)' }]}>
              <Shield size={18} color="#38BDF8" />
            </View>
            <Text style={s.linkText}>Политика конфиденциальности</Text>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/legal'); }} testID="terms-link">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(167,139,250,0.12)' }]}>
              <FileText size={18} color="#A78BFA" />
            </View>
            <Text style={s.linkText}>Пользовательское соглашение</Text>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
          <View style={s.divider} />
          <TouchableOpacity style={s.linkRow} activeOpacity={0.7} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/help'); }} testID="support-link">
            <View style={[s.iconWrap, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
              <LifeBuoy size={18} color="#22C55E" />
            </View>
            <Text style={s.linkText}>Служба поддержки</Text>
            <ChevronRight size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.section}>
        <Text style={[s.sectionTitle, { color: Colors.danger }]}>Опасная зона</Text>
        <TouchableOpacity
          style={s.deleteButton}
          activeOpacity={0.7}
          onPress={handleDeleteAccount}
          disabled={isDeleting}
          testID="delete-account-settings"
        >
          {isDeleting ? (
            <MLoader size="small" color={Colors.danger} />
          ) : (
            <>
              <Trash2 size={18} color={Colors.danger} />
              <Text style={s.deleteButtonText}>Удалить аккаунт</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={s.deleteHint}>
          Все ваши данные будут безвозвратно удалены.{'\n'}Это действие нельзя отменить.
        </Text>
      </View>

      <View style={{ height: 60 }} />

      </ScrollView>

      <EditModal
        visible={showEditPhoneModal}
        title="Изменить телефон"
        onClose={() => setShowEditPhoneModal(false)}
        onSave={handleSavePhone}
        saving={isSaving}
      >
        <TextInput
          {...phoneInputProps}
          style={s.modalInput}
          value={editPhone}
          onChangeText={(t) => { setEditPhone(t); setEditPhoneError(''); }}
          placeholder="+7 (999) 123-45-67"
          placeholderTextColor={Colors.textMuted}
          testID="edit-phone-input"
        />
        {editPhoneError ? <Text style={s.formError}>{editPhoneError}</Text> : null}
      </EditModal>

      <EditModal
        visible={showEditEmailModal}
        title="Изменить email"
        onClose={() => setShowEditEmailModal(false)}
        onSave={handleSaveEmail}
        saving={isSaving}
      >
        <TextInput
          {...emailInputProps}
          style={s.modalInput}
          value={editEmail}
          onChangeText={(t) => { setEditEmail(t); setEditEmailError(''); }}
          placeholder="email@example.com"
          placeholderTextColor={Colors.textMuted}
          testID="edit-email-input"
        />
        {editEmailError ? <Text style={s.formError}>{editEmailError}</Text> : null}
      </EditModal>

      <EditModal
        visible={showEditLocationModal}
        title="Изменить город и регион"
        onClose={() => setShowEditLocationModal(false)}
        onSave={handleSaveLocation}
        saving={isSaving}
      >
        <RegionCityPicker
          region={editRegion}
          city={editCity}
          onRegionChange={(r) => { setEditRegion(r); setEditLocationError(''); }}
          onCityChange={(c) => { setEditCity(c); setEditLocationError(''); }}
          inline
        />
        {editLocationError ? <Text style={s.formError}>{editLocationError}</Text> : null}
      </EditModal>

      <EditModal
        visible={showChangePasswordModal}
        title="Сменить пароль"
        onClose={() => setShowChangePasswordModal(false)}
        onSave={handleSavePassword}
        saving={isSaving}
        saveLabel="Сменить"
      >
        <View style={s.passwordFieldWrap}>
          <TextInput
            {...passwordInputProps}
            style={[s.modalInput, { flex: 1, paddingRight: 44 }]}
            value={currentPassword}
            onChangeText={(t) => { setCurrentPassword(t); setPasswordError(''); }}
            placeholder="Текущий пароль"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showCurrentPassword}
            testID="current-password-input"
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowCurrentPassword(!showCurrentPassword)}
            activeOpacity={0.7}
          >
            {showCurrentPassword ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>
        <View style={s.passwordFieldWrap}>
          <TextInput
            {...newPasswordInputProps}
            style={[s.modalInput, { flex: 1, paddingRight: 44 }]}
            value={newPassword}
            onChangeText={(t) => { setNewPassword(t); setPasswordError(''); }}
            placeholder="Новый пароль (мин. 4 символа)"
            placeholderTextColor={Colors.textMuted}
            secureTextEntry={!showNewPassword}
            testID="new-password-input"
          />
          <TouchableOpacity
            style={s.eyeBtn}
            onPress={() => setShowNewPassword(!showNewPassword)}
            activeOpacity={0.7}
          >
            {showNewPassword ? <EyeOff size={18} color={Colors.textMuted} /> : <Eye size={18} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>
        <TextInput
          {...newPasswordInputProps}
          style={s.modalInput}
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setPasswordError(''); }}
          placeholder="Подтвердите новый пароль"
          placeholderTextColor={Colors.textMuted}
          secureTextEntry={!showNewPassword}
          testID="confirm-password-input"
        />
        {passwordError ? <Text style={s.formError}>{passwordError}</Text> : null}
      </EditModal>

      <EditModal
        visible={show2FAModal}
        title="Отключить 2FA"
        onClose={() => { setShow2FAModal(false); setTwoFACode(''); setTwoFAError(''); }}
        onSave={() => {
          if (twoFAStep === 'confirm') {
            setIs2FAToggling(true);
            toggle2FAMutation.mutate({ enabled: false });
          } else {
            if (twoFACode.length !== 6) {
              setTwoFAError('Код должен содержать 6 цифр');
              return;
            }
            setIs2FAToggling(true);
            toggle2FAMutation.mutate({ enabled: false, verificationCode: twoFACode });
          }
        }}
        saving={is2FAToggling}
        saveLabel={twoFAStep === 'confirm' ? 'Отправить код' : 'Подтвердить'}
      >
        {twoFAStep === 'confirm' ? (
          <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 20 }}>
            Для отключения двухфакторной аутентификации мы отправим код подтверждения на ваш email.
          </Text>
        ) : (
          <>
            <Text style={{ fontSize: 14, color: Colors.text, lineHeight: 20, marginBottom: 12 }}>
              Код отправлен на {twoFAMaskedEmail}
            </Text>
            <TextInput
              style={s.modalInput}
              value={twoFACode}
              onChangeText={(t) => { setTwoFACode(t.replace(/[^0-9]/g, '').slice(0, 6)); setTwoFAError(''); }}
              placeholder="000000"
              placeholderTextColor={Colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              textAlign="center"
              testID="2fa-code-input"
            />
          </>
        )}
        {twoFAError ? <Text style={s.formError}>{twoFAError}</Text> : null}
      </EditModal>

      <EditModal
        visible={showAddAddressModal}
        title="Добавить адрес"
        onClose={() => setShowAddAddressModal(false)}
        onSave={handleSaveNewAddress}
        saving={isSaving}
        saveLabel="Добавить"
      >
        <TextInput
          {...plainFieldProps}
          style={s.modalInput}
          value={addrLabel}
          onChangeText={setAddrLabel}
          placeholder="Название (Дом, Работа...)"
          placeholderTextColor={Colors.textMuted}
          testID="addr-label-settings"
        />
        <TextInput
          {...streetAddressInputProps}
          style={s.modalInput}
          value={addrStreet}
          onChangeText={(t) => { setAddrStreet(t); setAddrError(''); }}
          placeholder="Улица *"
          placeholderTextColor={Colors.textMuted}
          testID="addr-street-settings"
        />
        <View style={s.formRowDouble}>
          <TextInput
            {...plainFieldProps}
            style={[s.modalInput, s.halfInput]}
            value={addrHouse}
            onChangeText={(t) => { setAddrHouse(t); setAddrError(''); }}
            placeholder="Дом *"
            placeholderTextColor={Colors.textMuted}
            testID="addr-house-settings"
          />
          <TextInput
            {...plainFieldProps}
            style={[s.modalInput, s.halfInput]}
            value={addrBuilding}
            onChangeText={setAddrBuilding}
            placeholder="Корпус"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={s.formRowDouble}>
          <TextInput
            {...numericNoSuggestProps}
            style={[s.modalInput, s.halfInput]}
            value={addrApartment}
            onChangeText={setAddrApartment}
            placeholder="Квартира"
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            {...numericNoSuggestProps}
            style={[s.modalInput, s.halfInput]}
            value={addrEntrance}
            onChangeText={setAddrEntrance}
            placeholder="Подъезд"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        <View style={s.formRowDouble}>
          <TextInput
            {...numericNoSuggestProps}
            style={[s.modalInput, s.halfInput]}
            value={addrFloor}
            onChangeText={setAddrFloor}
            placeholder="Этаж"
            placeholderTextColor={Colors.textMuted}
          />
          <TextInput
            {...plainFieldProps}
            style={[s.modalInput, s.halfInput]}
            value={addrIntercom}
            onChangeText={setAddrIntercom}
            placeholder="Домофон"
            placeholderTextColor={Colors.textMuted}
          />
        </View>
        {addrError ? <Text style={s.formError}>{addrError}</Text> : null}
      </EditModal>
    </View>
  );
}

function EditModal({
  visible,
  title,
  onClose,
  onSave,
  saving,
  saveLabel,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  saveLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={s.modalCloseBtn} activeOpacity={0.7}>
              <X size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={s.modalBodyScroll} contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {children}
          </ScrollView>
          <TouchableOpacity
            style={[s.modalSaveBtn, saving && s.modalSaveBtnDisabled]}
            onPress={onSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving ? (
              <MLoader size="small" color={Colors.white} />
            ) : (
              <Text style={s.modalSaveBtnText}>{saveLabel ?? 'Сохранить'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function NotifRow({
  icon,
  iconBg,
  label,
  value,
  onToggle,
  disabled,
  testID,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: boolean;
  onToggle: () => void;
  disabled: boolean;
  testID: string;
}) {
  return (
    <View style={[s.notifRow, disabled && s.notifRowDisabled]}>
      <View style={[s.iconWrap, { backgroundColor: iconBg }]}>{icon}</View>
      <Text style={[s.notifLabel, disabled && s.notifLabelDisabled]}>{label}</Text>
      <Switch
        value={value && !disabled}
        onValueChange={onToggle}
        disabled={disabled}
        trackColor={{ false: Colors.border, true: Colors.primary + '80' }}
        thumbColor={value && !disabled ? Colors.primary : Colors.textMuted}
        testID={testID}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginBottom: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: METALLIC_SHADOW_COLOR, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 4 },
      android: { elevation: 2 },
      default: {},
    }),
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  accountValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 2,
  },
  addressText: {
    fontSize: 12,
    color: Colors.textMuted,
    lineHeight: 16,
  },
  addressDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(248,113,113,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(22,163,74,0.1)',
    marginBottom: 10,
    marginRight: 4,
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  dndRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  dndTextWrap: {
    flex: 1,
  },
  dndTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  dndSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
    marginLeft: 50,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  notifRowDisabled: {
    opacity: 0.45,
  },
  notifLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  notifLabelDisabled: {
    color: Colors.textMuted,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(200,130,130,0.35)',
    paddingVertical: 16,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.danger,
  },
  deleteHint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    borderBottomWidth: 0,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyScroll: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  modalBody: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 8,
  },
  modalInput: {
    backgroundColor: Colors.backgroundSecondary,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  modalSaveBtn: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  modalSaveBtnDisabled: {
    opacity: 0.6,
  },
  modalSaveBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  formError: {
    fontSize: 13,
    color: Colors.danger,
    marginTop: 2,
    marginLeft: 4,
  },
  formRowDouble: {
    flexDirection: 'row',
    gap: 10,
  },
  halfInput: {
    flex: 1,
  },
  passwordFieldWrap: {
    position: 'relative' as const,
  },
  eyeBtn: {
    position: 'absolute' as const,
    right: 12,
    top: 14,
    padding: 2,
  },
});
