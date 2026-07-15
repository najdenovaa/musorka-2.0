import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Dimensions,
  FlatList,
  Keyboard,
  type KeyboardEvent,
} from 'react-native';

import { Image } from '@/components/MImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
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
import PhotoSourceSheet from '@/components/PhotoSourceSheet';
import ZoomableImage from '@/components/ZoomableImage';
import { numericNoSuggestProps, plainFieldProps, streetAddressInputProps } from '@/lib/text-input-autofill';
import { Calendar, Clock3, ChevronDown, ChevronLeft, ChevronRight, MapPin, Wallet, CreditCard, Camera, X, ZoomIn, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG } from '@/constants/metallic';
import MLoader from '@/components/MLoader';
import FloatingHeader, { useFloatingHeaderHeight } from '@/components/FloatingHeader';
import { useServiceCategories } from '@/lib/use-service-categories';
import { useRequests } from '@/providers/RequestsProvider';
import { useAuth } from '@/providers/AuthProvider';
import ServiceIcon from '@/components/ServiceIcon';
import { PaymentMethod } from '@/types';

const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Наличные' },
  { value: 'transfer', label: 'Перевод' },
];

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthLabel(date: Date): string {
  return date.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
}

function getCalendarDays(date: Date): Array<number | null> {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const leading = (firstDay.getDay() + 6) % 7;
  const days: Array<number | null> = [];

  for (let index = 0; index < leading; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(day);
  }

  return days;
}

export default function CreateRequestScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { addRequest } = useRequests();
  const { user, isAuthenticated } = useAuth();
  const serviceCategories = useServiceCategories();

  const defaultAddress = useMemo(() => {
    if (user?.addresses && user.addresses.length > 0) {
      return user.addresses[0]?.address ?? '';
    }
    return '';
  }, [user?.addresses]);

  const [selectedCategory, setSelectedCategory] = useState<string>(params.categoryId ?? serviceCategories[0]?.id ?? '');
  const [description, setDescription] = useState<string>('');
  const [address, setAddress] = useState<string>(defaultAddress);
  const [acceptablePrice, setAcceptablePrice] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [date, setDate] = useState<string>(formatDate(new Date()));
  const [time, setTime] = useState<string>('10:00');
  const [showCategories, setShowCategories] = useState<boolean>(false);
  const [showDateModal, setShowDateModal] = useState<boolean>(false);
  const [showTimeModal, setShowTimeModal] = useState<boolean>(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(new Date());
  const [selectedHour, setSelectedHour] = useState<string>('10');
  const [selectedMinute, setSelectedMinute] = useState<string>('00');
  const [showAddressPicker, setShowAddressPicker] = useState<boolean>(false);
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [photoViewerVisible, setPhotoViewerVisible] = useState<boolean>(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState<number>(0);
  const hourScrollRef = useRef<ScrollView>(null);
  const minuteScrollRef = useRef<ScrollView>(null);

  const selectedCat = useMemo(() => serviceCategories.find((item) => item.id === selectedCategory), [selectedCategory, serviceCategories]);
  const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
  const userAddresses = useMemo(() => user?.addresses ?? [], [user?.addresses]);

  const openTimePicker = useCallback(() => {
    const [hour = '10', minute = '00'] = time.split(':');
    setSelectedHour(hour);
    setSelectedMinute(minute);
    setShowTimeModal(true);
    setTimeout(() => {
      const hourIndex = hours.indexOf(hour);
      const minuteIndex = minutes.indexOf(minute);
      hourScrollRef.current?.scrollTo({ y: Math.max(hourIndex, 0) * 44, animated: false });
      minuteScrollRef.current?.scrollTo({ y: Math.max(minuteIndex, 0) * 44, animated: false });
    }, 40);
  }, [time]);

  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [showPhotoSheet, setShowPhotoSheet] = useState<boolean>(false);

  const handlePickFromSource = useCallback(async (src: 'camera' | 'gallery') => {
    setIsCompressing(true);
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
      setAttachments((prev) => [...prev, ...uris].slice(0, 5));
      // ВНИМАНИЕ: верхний предел 5 оставлен на бизнес-уровне, но сжатие выше держит
      // суммарный объём декодированных битмапов в безопасных рамках для Android.
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      console.log('[CreateRequest] Photos attached:', uris.length, 'from', src);
    } finally {
      setIsCompressing(false);
    }
  }, []);

  const handlePickPhoto = useCallback(() => {
    setShowPhotoSheet(true);
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const submittingRef = useRef<boolean>(false);

  const handleSubmit = useCallback(async () => {
    if (!selectedCategory) {
      Alert.alert('Ошибка', 'Выберите категорию услуги');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Ошибка', 'Укажите адрес');
      return;
    }

    if (!isAuthenticated) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Alert.alert(
        'Требуется вход',
        'Чтобы опубликовать заявку, необходимо войти в аккаунт или зарегистрироваться.',
        [
          { text: 'Отмена', style: 'cancel' },
          {
            text: 'Войти',
            onPress: () => {
              try {
                router.push('/login');
              } catch (e) {
                console.log('[CreateRequest] router.push login error:', e);
              }
            },
          },
        ],
      );
      return;
    }

    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);

    const category = serviceCategories.find((item) => item.id === selectedCategory);

    try {
      let safeAttachments = attachments.length > 0 ? attachments : undefined;
      const totalSize = (safeAttachments ?? []).reduce((sum, a) => sum + a.length, 0);
      console.log('[CreateRequest] Attachments count:', safeAttachments?.length ?? 0, 'total chars:', totalSize);

      if (safeAttachments && safeAttachments.length > 0) {
        try {
          const resized = await Promise.all(safeAttachments.map((u) => resizeForLive(u)));
          const uploaded = await uploadManyToS3(resized, { prefix: 'requests' });
          assertAllAreHttps(uploaded);
          safeAttachments = uploaded;
          console.log('[CreateRequest] Uploaded to S3, urls:', uploaded.length);
        } catch (uploadErr: any) {
          console.error('[CreateRequest] S3 upload error:', uploadErr?.message);
          Alert.alert('Ошибка загрузки', 'Не удалось загрузить фото. Проверьте интернет и попробуйте ещё раз.');
          submittingRef.current = false;
          setIsSubmitting(false);
          return;
        }
      }

      const success = await addRequest({
        categoryId: selectedCategory,
        categoryName: category?.name ?? '',
        title: category?.name ?? 'Заявка',
        description: description.trim(),
        address: address.trim(),
        acceptablePrice: acceptablePrice.trim() || undefined,
        paymentMethod,
        date: isUrgent ? formatDate(new Date()) : (date.trim() || formatDate(new Date())),
        time: isUrgent ? 'В ближайшее время' : (time.trim() || '10:00'),
        isUrgent,
        clientId: user?.id,
        clientName: user?.name,
        attachments: safeAttachments && safeAttachments.length > 0 ? safeAttachments : undefined,
      });

      if (success) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log('[CreateRequest] Request submitted:', category?.name);
        router.back();
      } else {
        console.log('[CreateRequest] Submit returned false');
      }
    } catch (err: any) {
      console.error('[CreateRequest] Submit error:', err?.message, JSON.stringify(err));
      const msg = err?.message || '';
      const isNetwork = msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания');
      Alert.alert(
        isNetwork ? 'Проблема с сетью' : 'Ошибка',
        isNetwork ? 'Проверьте интернет-соединение и попробуйте снова.' : 'Не удалось создать заявку. Попробуйте ещё раз.'
      );
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [acceptablePrice, addRequest, address, attachments, date, description, isUrgent, paymentMethod, selectedCategory, serviceCategories, time, router, user?.id, user?.name, isAuthenticated]);

  const handleDayPress = useCallback((day: number) => {
    const nextDate = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day);
    setDate(formatDate(nextDate));
    setShowDateModal(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[CreateRequest] Date selected:', formatDate(nextDate));
  }, [visibleMonth]);

  const handleConfirmTime = useCallback(() => {
    const nextTime = `${selectedHour}:${selectedMinute}`;
    setTime(nextTime);
    setShowTimeModal(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    console.log('[CreateRequest] Time selected:', nextTime);
  }, [selectedHour, selectedMinute]);

  const floatingHeaderHeight = useFloatingHeaderHeight();
  const insets = useSafeAreaInsets();

  const [keyboardHeight, setKeyboardHeight] = useState<number>(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      <FloatingHeader showBack title="Новая заявка" />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: floatingHeaderHeight }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#0D8A63', '#076C4D']} style={styles.hero}>
          <Text style={styles.heroTitle}>Новая заявка</Text>
          <Text style={styles.heroSubtitle}>Исполнители предложат условия, а вы выберете подходящего</Text>
        </LinearGradient>

        <Text style={styles.label}>Категория услуги</Text>
        <TouchableOpacity
          style={styles.categorySelector}
          onPress={() => setShowCategories((value) => !value)}
          activeOpacity={0.8}
          testID="category-selector"
        >
          <View style={styles.selectedCategoryRow}>
            {selectedCat ? (
              <>
                <View style={[styles.catIconSmall, { backgroundColor: selectedCat.bgColor }]}>
                  <ServiceIcon name={selectedCat.icon} size={20} color={selectedCat.color} />
                </View>
                <Text style={styles.categorySelectorText}>{selectedCat.name}</Text>
              </>
            ) : (
              <Text style={styles.categorySelectorPlaceholder}>Выберите категорию</Text>
            )}
          </View>
          <ChevronDown size={18} color={Colors.textSecondary} />
        </TouchableOpacity>

        {showCategories ? (
          <View style={styles.categoriesWrap}>
            {serviceCategories.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.categoryOption, item.id === selectedCategory && styles.categoryOptionActive]}
                onPress={() => {
                  setSelectedCategory(item.id);
                  setShowCategories(false);
                }}
                activeOpacity={0.75}
                testID={`select-category-${item.id}`}
              >
                <View style={[styles.catIconSmall, { backgroundColor: item.bgColor }]}>
                  <ServiceIcon name={item.icon} size={18} color={item.color} />
                </View>
                <Text style={styles.categoryOptionText}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Краткое описание</Text>
        <TextInput
          {...plainFieldProps}
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Опишите задачу коротко и понятно"
          placeholderTextColor={Colors.textMuted}
          multiline
          testID="request-description"
        />

        <Text style={styles.label}>Приемлемая цена</Text>
        <View style={styles.inputRow}>
          <Wallet size={18} color={Colors.accent} />
          <TextInput
            {...numericNoSuggestProps}
            style={styles.inputInline}
            value={acceptablePrice}
            onChangeText={setAcceptablePrice}
            placeholder="Например: до 3000 ₽"
            placeholderTextColor={Colors.textMuted}
            testID="request-price"
          />
        </View>
        <Text style={styles.priceHint}>Можно не указывать — тогда исполнители сами предложат цены</Text>

        <Text style={styles.label}>Способ оплаты</Text>
        <View style={styles.paymentRow}>
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.value}
              style={[styles.paymentOption, paymentMethod === method.value && styles.paymentOptionActive]}
              onPress={() => {
                setPaymentMethod(method.value);
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              activeOpacity={0.8}
              testID={`payment-${method.value}`}
            >
              <CreditCard size={16} color={paymentMethod === method.value ? Colors.white : Colors.textSecondary} />
              <Text style={[styles.paymentOptionText, paymentMethod === method.value && styles.paymentOptionTextActive]}>
                {method.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Адрес</Text>
        {userAddresses.length > 0 ? (
          <TouchableOpacity
            style={styles.addressPickerButton}
            onPress={() => setShowAddressPicker(true)}
            activeOpacity={0.8}
            testID="open-address-picker"
          >
            <MapPin size={18} color={Colors.primary} />
            <Text style={styles.addressPickerText} numberOfLines={2}>
              {address || 'Выбрать адрес'}
            </Text>
            <ChevronDown size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.inputRow}>
            <MapPin size={18} color={Colors.primary} />
            <TextInput
              {...streetAddressInputProps}
              style={styles.inputInline}
              value={address}
              onChangeText={setAddress}
              placeholder="Улица, дом, квартира"
              placeholderTextColor={Colors.textMuted}
              testID="request-address"
            />
          </View>
        )}

        <TouchableOpacity
          style={[styles.urgentToggle, isUrgent && styles.urgentToggleActive]}
          onPress={() => {
            setIsUrgent((v) => !v);
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }}
          activeOpacity={0.8}
          testID="urgent-toggle"
        >
          <View style={[styles.urgentIconWrap, isUrgent && styles.urgentIconWrapActive]}>
            <Zap size={18} color={isUrgent ? '#FFFFFF' : Colors.accent} fill={isUrgent ? '#FFFFFF' : 'transparent'} />
          </View>
          <View style={styles.urgentTextWrap}>
            <Text style={[styles.urgentTitle, isUrgent && styles.urgentTitleActive]}>В ближайшее время</Text>
            <Text style={styles.urgentSubtitle}>Срочная заявка — исполнители увидят приоритет</Text>
          </View>
          <View style={[styles.urgentCheckbox, isUrgent && styles.urgentCheckboxActive]}>
            {isUrgent ? <View style={styles.urgentCheckboxInner} /> : null}
          </View>
        </TouchableOpacity>

        {!isUrgent ? (
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Дата</Text>
              <TouchableOpacity style={styles.selectorButton} onPress={() => setShowDateModal(true)} activeOpacity={0.8} testID="open-date-picker">
                <Calendar size={18} color={Colors.primary} />
                <Text style={styles.selectorText}>{date}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.rowItem}>
              <Text style={styles.label}>Время</Text>
              <TouchableOpacity style={styles.selectorButton} onPress={openTimePicker} activeOpacity={0.8} testID="open-time-picker">
                <Clock3 size={18} color={Colors.primary} />
                <Text style={styles.selectorText}>{time}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        <Text style={styles.label}>Фото / документы</Text>
        {attachments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.attachmentsScroll}>
            {attachments.map((uri, idx) => (
              <View key={`att-${idx}`} style={styles.attachmentThumbWrap}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setPhotoViewerIndex(idx);
                    setPhotoViewerVisible(true);
                  }}
                  testID={`view-attachment-${idx}`}
                >
                  <Image
                    source={{ uri }}
                    style={styles.attachmentThumb}
                    contentFit="cover"
                    cachePolicy="disk"
                    recyclingKey={uri}
                    transition={0}
                  />
                  <View style={styles.zoomIconOverlay}>
                    <ZoomIn size={14} color={Colors.white} />
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.removeAttachmentButton}
                  onPress={() => handleRemoveAttachment(idx)}
                  activeOpacity={0.7}
                  testID={`remove-attachment-${idx}`}
                >
                  <X size={12} color={Colors.white} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <TouchableOpacity
          style={[styles.addPhotoButton, isCompressing && styles.addPhotoButtonDisabled]}
          onPress={handlePickPhoto}
          activeOpacity={0.8}
          disabled={isCompressing}
          testID="add-photo"
        >
          {isCompressing ? (
            <>
              <MLoader size="small" />
              <Text style={styles.addPhotoText}>Сжатие фото...</Text>
            </>
          ) : (
            <>
              <Camera size={18} color={Colors.primary} />
              <Text style={styles.addPhotoText}>Прикрепить фото</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 80 }} />
      </ScrollView>

      <PhotoSourceSheet
        visible={showPhotoSheet}
        onClose={() => setShowPhotoSheet(false)}
        onPickCamera={() => handlePickFromSource('camera')}
        onPickGallery={() => handlePickFromSource('gallery')}
        title="Добавить фото к заявке"
      />

      <View style={[styles.submitButtonWrap, { paddingBottom: 16 + insets.bottom + (Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight : 0) }]}>
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          activeOpacity={0.85}
          disabled={isSubmitting}
          testID="submit-request"
        >
          {isSubmitting ? (
            <MLoader size="small" color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>
              {isAuthenticated ? 'Опубликовать заявку' : 'Войти и опубликовать'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={photoViewerVisible} transparent animationType="fade" onRequestClose={() => setPhotoViewerVisible(false)}>
        <View style={styles.photoViewerOverlay}>
          <TouchableOpacity
            style={styles.photoViewerClose}
            onPress={() => setPhotoViewerVisible(false)}
            activeOpacity={0.8}
            testID="close-photo-viewer"
          >
            <X size={24} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.photoViewerCounter}>
            {attachments.length > 0 ? `${photoViewerIndex + 1} / ${attachments.length}` : ''}
          </Text>
          <FlatList
            data={attachments}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={photoViewerIndex}
            getItemLayout={(_, index) => ({ length: SCREEN_WIDTH, offset: SCREEN_WIDTH * index, index })}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              setPhotoViewerIndex(idx);
            }}
            keyExtractor={(_, index) => `photo-${index}`}
            renderItem={({ item }) => (
              <View style={styles.photoViewerSlide}>
                <ZoomableImage uri={item} style={styles.photoViewerImage} contentFit="contain" />
              </View>
            )}
          />
        </View>
      </Modal>

      <Modal visible={showAddressPicker} transparent animationType="slide" onRequestClose={() => setShowAddressPicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Выберите адрес</Text>
            {userAddresses.map((addr) => (
              <TouchableOpacity
                key={addr.id}
                style={styles.addressOption}
                onPress={() => {
                  setAddress(addr.address);
                  setShowAddressPicker(false);
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                activeOpacity={0.8}
              >
                <MapPin size={16} color={Colors.primary} />
                <View style={styles.addressOptionContent}>
                  <Text style={styles.addressOptionLabel}>{addr.label}</Text>
                  <Text style={styles.addressOptionText}>{addr.address}</Text>
                </View>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setShowAddressPicker(false)}>
              <Text style={styles.modalCloseText}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showDateModal} transparent animationType="slide" onRequestClose={() => setShowDateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} testID="prev-month">
                <ChevronLeft size={20} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.modalTitle}>{getMonthLabel(visibleMonth)}</Text>
              <TouchableOpacity onPress={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} testID="next-month">
                <ChevronRight size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <View style={styles.weekRow}>
              {weekDays.map((day) => (
                <Text key={day} style={styles.weekDay}>{day}</Text>
              ))}
            </View>

            <View style={styles.daysGrid}>
              {calendarDays.map((day, index) => (
                <TouchableOpacity
                  key={`day-${index}`}
                  style={[styles.dayCell, day === null && styles.dayCellEmpty, day !== null && date === formatDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)) && styles.dayCellSelected]}
                  disabled={day === null}
                  onPress={() => {
                    if (day !== null) {
                      handleDayPress(day);
                    }
                  }}
                  testID={day !== null ? `day-${day}` : `empty-day-${index}`}
                >
                  <Text style={[styles.dayText, day !== null && date === formatDate(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), day)) && styles.dayTextSelected]}>{day ?? ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showTimeModal} transparent animationType="slide" onRequestClose={() => setShowTimeModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Выберите время</Text>
            <View style={styles.timePickerRow}>
              <ScrollView ref={hourScrollRef} style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {hours.map((hour) => (
                  <TouchableOpacity key={hour} style={[styles.timeValue, selectedHour === hour && styles.timeValueActive]} onPress={() => setSelectedHour(hour)} testID={`hour-${hour}`}>
                    <Text style={[styles.timeValueText, selectedHour === hour && styles.timeValueTextActive]}>{hour}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <Text style={styles.timeSeparator}>:</Text>
              <ScrollView ref={minuteScrollRef} style={styles.timeColumn} showsVerticalScrollIndicator={false}>
                {minutes.map((minute) => (
                  <TouchableOpacity key={minute} style={[styles.timeValue, selectedMinute === minute && styles.timeValueActive]} onPress={() => setSelectedMinute(minute)} testID={`minute-${minute}`}>
                    <Text style={[styles.timeValueText, selectedMinute === minute && styles.timeValueTextActive]}>{minute}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.confirmButton} onPress={handleConfirmTime} testID="confirm-time">
              <Text style={styles.confirmButtonText}>Подтвердить</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {isSubmitting ? (
        <Modal visible transparent animationType="fade">
          <View style={styles.publishingOverlay}>
            <MLoader size="large" />
            <Text style={styles.publishingOverlayText}>Публикуем заявку...</Text>
          </View>
        </Modal>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 16,
  },
  hero: {
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '800' as const,
    color: Colors.white,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  categorySelector: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  categorySelectorText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600' as const,
    flex: 1,
  },
  categorySelectorPlaceholder: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  categoriesWrap: {
    gap: 10,
    marginTop: 12,
  },
  categoryOption: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryOptionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.card,
  },
  categoryOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.text,
    flex: 1,
  },
  catIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  inputRow: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inputInline: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
  },
  paymentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  paymentOption: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    paddingVertical: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  paymentOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: '#31D06A',
  },
  paymentOptionText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  paymentOptionTextActive: {
    color: Colors.white,
  },
  addressPickerButton: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  addressPickerText: {
    flex: 1,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '600' as const,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  rowItem: {
    flex: 1,
  },
  selectorButton: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  selectorText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600' as const,
  },
  attachmentsScroll: {
    marginBottom: 8,
  },
  attachmentThumbWrap: {
    position: 'relative',
    marginRight: 8,
  },
  attachmentThumb: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: Colors.cardSecondary,
  },
  zoomIconOverlay: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeAttachmentButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.card,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.primary,
  },
  addPhotoButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonWrap: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
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
    marginBottom: 16,
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
  addressOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  addressOptionContent: {
    flex: 1,
  },
  addressOptionLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 2,
  },
  addressOptionText: {
    fontSize: 14,
    color: Colors.text,
  },
  modalCloseButton: {
    backgroundColor: Colors.cardSecondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  modalCloseText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.textSecondary,
  },
  photoViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 15,
    fontWeight: '600' as const,
    color: 'rgba(255,255,255,0.8)',
    zIndex: 10,
  },
  photoViewerSlide: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoViewerImage: {
    width: SCREEN_WIDTH - 20,
    height: SCREEN_HEIGHT * 0.7,
  },
  publishingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  publishingOverlayText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.white,
    marginTop: 8,
  },
  priceHint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
    marginLeft: 4,
    lineHeight: 17,
  },
  urgentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    padding: 14,
    marginTop: 12,
    gap: 12,
  },
  urgentToggleActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  urgentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentIconWrapActive: {
    backgroundColor: '#F59E0B',
  },
  urgentTextWrap: {
    flex: 1,
  },
  urgentTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.text,
  },
  urgentTitleActive: {
    color: '#F59E0B',
  },
  urgentSubtitle: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 2,
    lineHeight: 16,
  },
  urgentCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentCheckboxActive: {
    borderColor: '#F59E0B',
    backgroundColor: '#F59E0B',
  },
  urgentCheckboxInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.white,
  },
});
