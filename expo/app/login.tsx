import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Alert,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Wrench, MapPin, ChevronLeft, Check, LogIn, Eye, EyeOff,
  Lock, Mail, KeyRound, Phone, AtSign, Shield, Zap,
  ArrowRight, Star, Fingerprint, ScanFace, Sparkles, Headphones,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

import Colors from '@/constants/colors';
import { useRouter } from 'expo-router';
import { useAuth } from '@/providers/AuthProvider';
import { useBiometric } from '@/providers/BiometricProvider';
import { UserRole } from '@/types';
import { useServiceCategories } from '@/lib/use-service-categories';
import AnimatedActionButton from '@/components/AnimatedActionButton';
import ServiceIcon from '@/components/ServiceIcon';
import RegionCityPicker from '@/components/RegionCityPicker';
import { trpc } from '@/lib/trpc';

function openExternalLink(url: string): void {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined') {
        const opened = window.open(url, '_blank', 'noopener,noreferrer');
        if (!opened) {
          window.location.assign(url);
        }
        return;
      }
    } catch (error) {
      console.log('[LoginScreen] openExternalLink web error:', error);
    }
  }
  Linking.openURL(url).catch((error) => {
    console.log('[LoginScreen] Linking.openURL error:', error);
  });
}
import {
  addressCityInputProps,
  emailInputProps,
  familyNameInputProps,
  givenNameInputProps,
  newPasswordInputProps,
  numericNoSuggestProps,
  oneTimeCodeInputProps,
  passwordInputProps,
  phoneInputProps,
  plainFieldProps,
  streetAddressInputProps,
} from '@/lib/text-input-autofill';
import type { ScreenMode, LoginMethod } from '@/lib/login/types';
import { SCREEN_WIDTH } from '@/lib/login/constants';
import { LOGIN_ROLE_CARDS } from '@/lib/login/role-cards';
import { GlowOrb, FloatingIcon, StaggeredItem } from '@/lib/login/decorations';
import { styles } from '@/lib/login/styles';

export default function LoginScreen() {
  const { register, loginWithCode, loginDirect } = useAuth();
  const { biometricEnabled, biometricAvailable, biometricLabel, biometricType, authenticateWithBiometric, enableBiometric, isReady: biometricReady } = useBiometric();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState<boolean>(false);
  const [screenMode, setScreenMode] = React.useState<ScreenMode>('choose');
  const [selectedRole, setSelectedRole] = React.useState<UserRole | null>(null);
  const [loginMethod, setLoginMethod] = React.useState<LoginMethod>('phone');

  const [loginPhone, setLoginPhone] = React.useState<string>('8');
  const [loginEmail, setLoginEmail] = React.useState<string>('');
  const [loginPassword, setLoginPassword] = React.useState<string>('');
  const [showLoginPassword, setShowLoginPassword] = React.useState<boolean>(false);

  const [firstName, setFirstName] = React.useState<string>('');
  const [lastName, setLastName] = React.useState<string>('');
  const [phone, setPhone] = React.useState<string>('8');
  const [email, setEmail] = React.useState<string>('');
  const [password, setPassword] = React.useState<string>('');
  const [showPassword, setShowPassword] = React.useState<boolean>(false);

  const [addrRegion, setAddrRegion] = React.useState<string>('');
  const [addrCity, setAddrCity] = React.useState<string>('');
  const [addrStreet, setAddrStreet] = React.useState<string>('');
  const [addrHouse, setAddrHouse] = React.useState<string>('');
  const [addrBuilding, setAddrBuilding] = React.useState<string>('');
  const [addrApartment, setAddrApartment] = React.useState<string>('');
  const [addrEntrance, setAddrEntrance] = React.useState<string>('');
  const [addrFloor, setAddrFloor] = React.useState<string>('');
  const [addrIntercom, setAddrIntercom] = React.useState<string>('');

  const [selectedServiceIds, setSelectedServiceIds] = React.useState<string[]>([]);
  const serviceCategories = useServiceCategories();
  const [termsAccepted, setTermsAccepted] = React.useState<boolean>(false);

  const [verifyEmail, setVerifyEmail] = React.useState<string>('');
  const [verifyCode, setVerifyCode] = React.useState<string>('');
  const [regVerifyCode, setRegVerifyCode] = React.useState<string>('');
  const [regCodeVerified, setRegCodeVerified] = React.useState<boolean>(false);
  const [pendingRegPayload, setPendingRegPayload] = React.useState<any>(null);

  const [resendCountdown, setResendCountdown] = React.useState<number>(0);

  const [loginVerifyCode, setLoginVerifyCode] = React.useState<string>('');
  const [loginMaskedEmail, setLoginMaskedEmail] = React.useState<string>('');
  const [pendingLoginMethod, setPendingLoginMethod] = React.useState<LoginMethod>('phone');
  const [pendingLoginPhone, setPendingLoginPhone] = React.useState<string>('');
  const [pendingLoginEmail, setPendingLoginEmail] = React.useState<string>('');
  const [pendingLoginPassword, setPendingLoginPassword] = React.useState<string>('');

  const [forgotEmail, setForgotEmail] = React.useState<string>('');
  const [forgotCode, setForgotCode] = React.useState<string>('');

  const [newPassword, setNewPassword] = React.useState<string>('');
  const [confirmPassword, setConfirmPassword] = React.useState<string>('');
  const [showNewPassword, setShowNewPassword] = React.useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState<boolean>(false);
  const [resetCodeVerified, setResetCodeVerified] = React.useState<string>('');



  const heroOpacity = React.useRef(new Animated.Value(0)).current;
  const heroScale = React.useRef(new Animated.Value(0.9)).current;
  const contentOpacity = React.useRef(new Animated.Value(0)).current;
  const contentSlide = React.useRef(new Animated.Value(40)).current;
  const logoGlow = React.useRef(new Animated.Value(0)).current;
  const scrollRef = React.useRef<ScrollView>(null);
  const countdownRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const sendCodeMutation = trpc.auth.sendVerificationCode.useMutation();
  const verifyCodeMutation = trpc.auth.verifyCode.useMutation();
  const resetPasswordMutation = trpc.auth.resetPassword.useMutation();
  const loginSendCodeMutation = trpc.auth.loginSendCode.useMutation();


  React.useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(heroOpacity, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(heroScale, { toValue: 1, tension: 50, friction: 10, useNativeDriver: Platform.OS !== 'web' }),
      ]),
      Animated.parallel([
        Animated.timing(contentOpacity, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(contentSlide, { toValue: 0, tension: 60, friction: 12, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();

    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(logoGlow, { toValue: 1, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(logoGlow, { toValue: 0.4, duration: 2000, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    glowLoop.start();

    return () => {
      glowLoop.stop();
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [heroOpacity, heroScale, contentOpacity, contentSlide, logoGlow]);


  const startResendCountdown = React.useCallback(() => {
    setResendCountdown(60 as const);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setResendCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const handleSelectRole = React.useCallback((role: UserRole) => {
    console.log('[LoginScreen] Role selected:', role);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedRole(role);
    setSelectedServiceIds([]);
    setScreenMode('register');
  }, []);

  const goToLogin = React.useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScreenMode('login');
    setSelectedRole(null);
  }, []);

  const goToRegister = React.useCallback(() => {
    setScreenMode('choose');
    setSelectedRole(null);
  }, []);

  const goBack = React.useCallback(() => {
    if (screenMode === 'register') {
      setScreenMode('choose');
      setSelectedRole(null);
    } else if (screenMode === 'login') {
      setScreenMode('choose');
    } else if (screenMode === 'login_verify') {
      setScreenMode('login');
    } else if (screenMode === 'register_verify') {
      setScreenMode('register');
    } else if (screenMode === 'verify_email') {
      router.replace('/');
    } else if (screenMode === 'forgot_password') {
      setScreenMode('login');
    } else if (screenMode === 'forgot_code') {
      setScreenMode('forgot_password');
    } else if (screenMode === 'reset_password') {
      setScreenMode('login');
    }
  }, [screenMode, router]);

  const toggleService = React.useCallback((serviceId: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedServiceIds((current) => (
      current.includes(serviceId)
        ? current.filter((item) => item !== serviceId)
        : [...current, serviceId]
    ));
  }, []);

  const handleLogin = React.useCallback(async () => {
    if (isSubmitting) return;

    const rawPhone = loginPhone.trim();
    const rawEmail = loginEmail.trim();
    const looksLikeEmail = (value: string) => /@/.test(value) && /\./.test(value.split('@')[1] || '');
    const digitsOnly = (value: string) => value.replace(/\D/g, '');

    let effectiveMethod: LoginMethod = loginMethod;
    let phoneForRequest = rawPhone;
    let emailForRequest = rawEmail.toLowerCase();

    if (loginMethod === 'phone') {
      if (!rawPhone) {
        Alert.alert('Введите телефон', 'Укажите телефон, указанный при регистрации.');
        return;
      }
      if (looksLikeEmail(rawPhone)) {
        effectiveMethod = 'email';
        emailForRequest = rawPhone.toLowerCase();
        console.log('[LoginScreen] Detected email in phone field, switching method to email');
      } else {
        const digits = digitsOnly(rawPhone);
        if (digits.length < 10 || digits.length > 12) {
          Alert.alert('Неверный номер', 'Введите корректный номер телефона (10–12 цифр).');
          return;
        }
        let normalized = digits;
        if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
          normalized = '8' + digits.slice(1);
        } else if (digits.length === 10) {
          normalized = '8' + digits;
        }
        phoneForRequest = normalized;
      }
      if (!loginPassword.trim()) {
        Alert.alert('Введите пароль', 'Укажите пароль.');
        return;
      }
    } else {
      if (!rawEmail) {
        Alert.alert('Введите email', 'Укажите email, указанный при регистрации.');
        return;
      }
      if (!looksLikeEmail(rawEmail)) {
        const digits = digitsOnly(rawEmail);
        if (digits.length >= 10 && digits.length <= 12) {
          effectiveMethod = 'phone';
          phoneForRequest = digits.length === 10 ? '8' + digits : (digits.startsWith('7') ? '8' + digits.slice(1) : digits);
          console.log('[LoginScreen] Detected phone in email field, switching method to phone');
        } else {
          Alert.alert('Неверный email', 'Введите корректный email.');
          return;
        }
      }
      if (!loginPassword.trim()) {
        Alert.alert('Введите пароль', 'Укажите пароль.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      console.log('[LoginScreen] Sending login verification code, method:', effectiveMethod, 'phone:', effectiveMethod === 'phone' ? phoneForRequest : undefined, 'email:', effectiveMethod === 'email' ? emailForRequest : undefined);
      const result = await loginSendCodeMutation.mutateAsync({
        method: effectiveMethod,
        phone: effectiveMethod === 'phone' ? phoneForRequest : undefined,
        email: effectiveMethod === 'email' ? emailForRequest : undefined,
        password: loginPassword,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if ((result as any).directLogin && (result as any).token) {
        console.log('[LoginScreen] Test account direct login, bypassing 2FA');
        await loginDirect({ user: (result as any).user, token: (result as any).token });
        router.replace('/');
        return;
      }

      setPendingLoginMethod(effectiveMethod);
      setPendingLoginPhone(phoneForRequest);
      setPendingLoginEmail(emailForRequest);
      setPendingLoginPassword(loginPassword);
      setLoginMaskedEmail(result.email || '');
      setLoginVerifyCode('');
      setScreenMode('login_verify');
      startResendCountdown();
      console.log('[LoginScreen] Account unverified, code sent, masked email:', result.email);
    } catch (error: any) {
      console.log('[LoginScreen] Login send code error:', error?.message);
      const msg = error?.message || '';
      const code = error?.data?.code || '';
      if (code === 'NOT_FOUND' || msg.includes('не найден')) {
        Alert.alert('Пользователь не найден', effectiveMethod === 'email' ? 'Аккаунт с таким email не зарегистрирован.' : 'Аккаунт с таким номером не зарегистрирован.');
      } else if (code === 'UNAUTHORIZED' || msg.toLowerCase().includes('неверный пароль')) {
        Alert.alert('Неверный пароль', 'Проверьте пароль и попробуйте снова.');
      } else if (code === 'FORBIDDEN' || msg.includes('заблокирован')) {
        Alert.alert('Аккаунт заблокирован', 'Обратитесь в поддержку.');
      } else if (msg.includes('соцсети')) {
        Alert.alert('Социальный вход', 'Этот аккаунт использует вход через Google или Яндекс.');
      } else if (msg.includes('не указан email')) {
        Alert.alert('Нет email у аккаунта', 'У вашего аккаунта не указан email, поэтому код не может быть отправлен. Обратитесь в поддержку или войдите другим способом.');
      } else if (msg.includes('Подождите')) {
        Alert.alert('Подождите', msg);
      } else if (msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания') || msg.includes('недоступен') || msg.includes('Failed to fetch') || msg.includes('503')) {
        Alert.alert('Проблема с сетью', 'Сервер временно недоступен. Проверьте интернет и попробуйте через несколько секунд.');
      } else {
        Alert.alert('Ошибка входа', msg || 'Не удалось выполнить вход. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, loginMethod, loginPhone, loginEmail, loginPassword, loginSendCodeMutation, startResendCountdown, loginDirect, router]);

  const handleVerifyLoginCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (loginVerifyCode.length !== 6) {
      Alert.alert('Введите код', 'Код должен содержать 6 цифр.');
      return;
    }
    try {
      setIsSubmitting(true);
      console.log('[LoginScreen] Verifying login code, method:', pendingLoginMethod);
      const success = await loginWithCode({
        method: pendingLoginMethod,
        phone: pendingLoginMethod === 'phone' ? pendingLoginPhone : undefined,
        email: pendingLoginMethod === 'email' ? pendingLoginEmail : undefined,
        password: pendingLoginPassword,
        code: loginVerifyCode,
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      console.log('[LoginScreen] Login verification complete, success:', success);
      if (success) {
        if (biometricAvailable && !biometricEnabled && Platform.OS !== 'web') {
          const phoneVal = pendingLoginMethod === 'phone' ? pendingLoginPhone : '';
          const emailVal = pendingLoginMethod === 'email' ? pendingLoginEmail : '';
          const passVal = pendingLoginPassword;
          const methodVal = pendingLoginMethod;
          Alert.alert(
            biometricLabel,
            `Хотите включить ${biometricLabel} для быстрого входа?`,
            [
              { text: 'Нет', style: 'cancel', onPress: () => router.replace('/') },
              {
                text: 'Включить',
                onPress: async () => {
                  await enableBiometric(passVal.trim());
                  router.replace('/');
                },
              },
            ],
          );
        } else {
          router.replace('/');
        }
      }
    } catch (error: any) {
      console.log('[LoginScreen] Login verify error:', error?.message);
      const msg = error?.message || '';
      if (msg.includes('Неверный код')) {
        Alert.alert('Неверный код', 'Проверьте код и попробуйте снова.');
      } else if (msg.includes('истёк') || msg.includes('истек')) {
        Alert.alert('Код истёк', 'Запросите новый код.');
      } else if (msg.includes('Превышено') || msg.includes('попыток')) {
        Alert.alert('Превышено количество попыток', 'Запросите новый код.');
      } else if (msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания')) {
        Alert.alert('Проблема с сетью', 'Проверьте интернет-соединение и попробуйте снова.');
      } else {
        Alert.alert('Ошибка', msg || 'Не удалось завершить вход. Попробуйте снова.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, loginVerifyCode, pendingLoginMethod, pendingLoginPhone, pendingLoginEmail, pendingLoginPassword, loginWithCode, router, biometricAvailable, biometricEnabled, biometricLabel, enableBiometric]);

  const handleSendRegCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!selectedRole) {
      Alert.alert('Выберите тип аккаунта', 'Сначала выберите: пользователь или исполнитель.');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Заполните фамилию', 'Укажите вашу фамилию.');
      return;
    }
    if (!firstName.trim()) {
      Alert.alert('Заполните имя', 'Укажите ваше имя.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Заполните телефон', 'Укажите телефон для регистрации.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Заполните email', 'Email обязателен для регистрации.');
      return;
    }
    if (!password.trim()) {
      Alert.alert('Установите пароль', 'Пароль обязателен для регистрации.');
      return;
    }
    if (password.trim().length < 4) {
      Alert.alert('Слишком короткий пароль', 'Пароль должен содержать минимум 4 символа.');
      return;
    }
    if (!addrRegion.trim()) {
      Alert.alert('Выберите регион', 'Укажите регион из списка.');
      return;
    }
    if (!addrCity.trim()) {
      Alert.alert('Выберите город', 'Укажите город из списка.');
      return;
    }
    if (selectedRole === 'client' && !addrStreet.trim()) {
      Alert.alert('Укажите адрес', 'Заполните хотя бы улицу/микрорайон.');
      return;
    }
    if (selectedRole === 'executor' && selectedServiceIds.length === 0) {
      Alert.alert('Выберите услуги', 'Исполнителю нужно выбрать хотя бы одну услугу.');
      return;
    }
    if (!termsAccepted) {
      Alert.alert('Пользовательское соглашение', 'Необходимо принять пользовательское соглашение и политику конфиденциальности.');
      return;
    }
    try {
      setIsSubmitting(true);
      const userEmail = email.trim().toLowerCase();
      console.log('[LoginScreen] Sending registration verification code to:', userEmail);
      await sendCodeMutation.mutateAsync({
        email: userEmail,
        type: 'registration',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPendingRegPayload({
        role: selectedRole,
        name: `${lastName.trim()} ${firstName.trim()}`,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        email: userEmail,
        password: password.trim(),
        city: addrCity.trim(),
        region: addrRegion.trim(),
        addressDetails: selectedRole === 'client' ? {
          city: addrCity.trim(),
          street: addrStreet.trim(),
          house: addrHouse.trim(),
          building: addrBuilding.trim(),
          apartment: addrApartment.trim(),
          entrance: addrEntrance.trim(),
          floor: addrFloor.trim(),
          intercom: addrIntercom.trim(),
        } : undefined,
        subscribedServiceIds: selectedRole === 'executor' ? selectedServiceIds : [],
      });
      setVerifyEmail(userEmail);
      setRegVerifyCode('');
      setRegCodeVerified(false);
      setScreenMode('register_verify');
      startResendCountdown();
    } catch (error: any) {
      console.log('[LoginScreen] Send reg code error:', error?.message);
      const msg = error?.message || '';
      if (msg.includes('уже зарегистрирован')) {
        Alert.alert('Email занят', 'Пользователь с таким email уже зарегистрирован. Попробуйте войти.');
      } else if (msg.includes('Подождите') || msg.includes('Слишком много запросов')) {
        Alert.alert('Подождите', msg);
      } else if (msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания')) {
        Alert.alert('Проблема с сетью', 'Проверьте интернет-соединение и попробуйте снова.');
      } else {
        Alert.alert('Ошибка', msg || 'Не удалось отправить код. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [addrApartment, addrBuilding, addrCity, addrEntrance, addrFloor, addrHouse, addrIntercom, addrStreet, email, firstName, isSubmitting, lastName, password, phone, selectedRole, selectedServiceIds, sendCodeMutation, startResendCountdown, termsAccepted]);

  const handleVerifyRegCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (regVerifyCode.length !== 6) {
      Alert.alert('Введите код', 'Код должен содержать 6 цифр.');
      return;
    }
    try {
      setIsSubmitting(true);
      console.log('[LoginScreen] Verifying registration code for:', verifyEmail);
      await verifyCodeMutation.mutateAsync({
        email: verifyEmail,
        code: regVerifyCode,
        type: 'registration',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRegCodeVerified(true);
      console.log('[LoginScreen] Registration code verified, proceeding to register');

      if (!pendingRegPayload) {
        Alert.alert('Ошибка', 'Данные регистрации потеряны. Начните заново.');
        setScreenMode('register');
        return;
      }

      console.log('[LoginScreen] Registering user with role:', pendingRegPayload.role);
      await register({
        ...pendingRegPayload,
        verificationCode: regVerifyCode,
      });
      console.log('[LoginScreen] Registration successful');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Аккаунт создан!', 'Регистрация успешно завершена.', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (error: any) {
      console.log('[LoginScreen] Verify reg code / register error:', error?.message);
      const msg = error?.message || '';
      if (msg === 'PHONE_EXISTS' || msg.includes('PHONE_EXISTS')) {
        Alert.alert('Телефон уже зарегистрирован', 'Пользователь с таким номером телефона уже существует. Попробуйте войти в аккаунт.');
      } else if (msg.includes('EMAIL_EXISTS') || msg.includes('email уже')) {
        Alert.alert('Email занят', 'Пользователь с таким email уже зарегистрирован.');
      } else if (msg.includes('Неверный код')) {
        Alert.alert('Неверный код', 'Проверьте код и попробуйте снова.');
      } else if (msg.includes('Слишком много запросов') || msg.includes('Подождите')) {
        Alert.alert('Подождите', msg);
      } else if (msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания')) {
        Alert.alert('Проблема с сетью', 'Проверьте интернет-соединение и попробуйте снова.');
      } else {
        Alert.alert('Ошибка', msg || 'Не удалось завершить регистрацию. Попробуйте снова.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, regVerifyCode, verifyEmail, verifyCodeMutation, pendingRegPayload, register, router]);

  const handleSendForgotCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!forgotEmail.trim()) {
      Alert.alert('Введите email', 'Укажите email, указанный при регистрации.');
      return;
    }
    try {
      setIsSubmitting(true);
      await sendCodeMutation.mutateAsync({
        email: forgotEmail.trim().toLowerCase(),
        type: 'password_reset',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreenMode('forgot_code');
      setForgotCode('');
      startResendCountdown();
    } catch (error: any) {
      console.log('[LoginScreen] Send forgot code error handled:', error?.message);
      const msg = error?.message || '';
      if (msg.includes('Подождите')) {
        Alert.alert('Подождите', msg);
      } else if (msg.includes('не найден')) {
        Alert.alert('Не найден', 'Аккаунт с таким email не зарегистрирован.');
      } else {
        Alert.alert('Ошибка', msg || 'Не удалось отправить код. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, forgotEmail, sendCodeMutation, startResendCountdown]);

  const handleVerifyForgotCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (forgotCode.length !== 6) {
      Alert.alert('Введите код', 'Код должен содержать 6 цифр.');
      return;
    }
    try {
      setIsSubmitting(true);
      await verifyCodeMutation.mutateAsync({
        email: forgotEmail.trim().toLowerCase(),
        code: forgotCode,
        type: 'password_reset',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setResetCodeVerified(forgotCode);
      setScreenMode('reset_password');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.log('[LoginScreen] Verify forgot code error handled:', error?.message);
      Alert.alert('Ошибка', error?.message || 'Неверный код. Попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, forgotCode, forgotEmail, verifyCodeMutation]);

  const handleResetPassword = React.useCallback(async () => {
    if (isSubmitting) return;
    if (!newPassword.trim()) {
      Alert.alert('Введите пароль', 'Укажите новый пароль.');
      return;
    }
    if (newPassword.trim().length < 4) {
      Alert.alert('Слишком короткий', 'Пароль должен содержать минимум 4 символа.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Пароли не совпадают', 'Новый пароль и подтверждение должны совпадать.');
      return;
    }
    try {
      setIsSubmitting(true);
      await resetPasswordMutation.mutateAsync({
        email: forgotEmail.trim().toLowerCase(),
        code: resetCodeVerified,
        newPassword: newPassword.trim(),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Пароль изменён', 'Теперь вы можете войти с новым паролем.', [
        { text: 'Войти', onPress: () => setScreenMode('login') },
      ]);
    } catch (error: any) {
      console.log('[LoginScreen] Reset password error handled:', error?.message);
      Alert.alert('Ошибка', error?.message || 'Не удалось сменить пароль. Попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, newPassword, confirmPassword, forgotEmail, resetCodeVerified, resetPasswordMutation]);

  const handleVerifyEmailCode = React.useCallback(async () => {
    if (isSubmitting) return;
    if (verifyCode.length !== 6) {
      Alert.alert('Введите код', 'Код должен содержать 6 цифр.');
      return;
    }
    try {
      setIsSubmitting(true);
      await verifyCodeMutation.mutateAsync({
        email: verifyEmail,
        code: verifyCode,
        type: 'email_verify',
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Email подтверждён', 'Ваш email успешно подтверждён!', [
        { text: 'OK', onPress: () => router.replace('/') },
      ]);
    } catch (error: any) {
      console.log('[LoginScreen] Verify email code error handled:', error?.message);
      Alert.alert('Ошибка', error?.message || 'Неверный код. Попробуйте снова.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, verifyCode, verifyEmail, verifyCodeMutation, router]);

  const handleDemoLogin = React.useCallback(async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      console.log('[LoginScreen] Demo login starting');
      const result = await loginSendCodeMutation.mutateAsync({
        method: 'phone',
        phone: '89000000000',
        password: '12345',
      });
      if ((result as any).directLogin && (result as any).token) {
        await loginDirect({ user: (result as any).user, token: (result as any).token });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log('[LoginScreen] Demo login success, navigating to profile');
        router.replace('/profile');
        return;
      }
      Alert.alert('Демо недоступно', 'Не удалось войти в демо-аккаунт. Попробуйте позже.');
    } catch (error: any) {
      console.log('[LoginScreen] Demo login error:', error?.message);
      Alert.alert('Ошибка демо-режима', error?.message || 'Не удалось войти в демо-аккаунт.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, loginSendCodeMutation, loginDirect, router]);

  const handleBiometricLogin = React.useCallback(async () => {
    if (isSubmitting) return;
    try {
      setIsSubmitting(true);
      const session = await authenticateWithBiometric();
      if (!session) {
        return;
      }
      await loginDirect(session);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/');
    } catch (error: any) {
      const msg = error?.message || '';
      const code = error?.data?.code || '';
      if (code === 'UNAUTHORIZED' || msg.includes('Быстрый вход')) {
        Alert.alert('Ошибка', 'Быстрый вход недоступен. Войдите с паролем и заново включите биометрию.');
      } else if (msg.includes('сети') || msg.includes('timeout') || msg.includes('Failed to fetch')) {
        Alert.alert('Проблема с сетью', 'Проверьте интернет-соединение.');
      } else {
        Alert.alert('Ошибка входа', msg || 'Не удалось выполнить быстрый вход.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, authenticateWithBiometric, loginDirect, router]);



  const handleResendCode = React.useCallback(async () => {
    if (resendCountdown > 0 || isSubmitting) return;
    try {
      setIsSubmitting(true);
      if (screenMode === 'login_verify') {
        await loginSendCodeMutation.mutateAsync({
          method: pendingLoginMethod,
          phone: pendingLoginMethod === 'phone' ? pendingLoginPhone : undefined,
          email: pendingLoginMethod === 'email' ? pendingLoginEmail : undefined,
          password: pendingLoginPassword,
        });
      } else {
        const emailToUse = screenMode === 'register_verify' ? verifyEmail : screenMode === 'verify_email' ? verifyEmail : forgotEmail.trim().toLowerCase();
        const typeToUse = screenMode === 'register_verify' ? 'registration' as const : screenMode === 'verify_email' ? 'email_verify' as const : 'password_reset' as const;
        await sendCodeMutation.mutateAsync({ email: emailToUse, type: typeToUse });
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      startResendCountdown();
      Alert.alert('Код отправлен', 'Новый код отправлен на ваш email.');
    } catch (error: any) {
      console.log('[LoginScreen] Resend code error handled:', error?.message);
      Alert.alert('Ошибка', error?.message || 'Не удалось отправить код.');
    } finally {
      setIsSubmitting(false);
    }
  }, [resendCountdown, isSubmitting, screenMode, verifyEmail, forgotEmail, sendCodeMutation, startResendCountdown, loginSendCodeMutation, pendingLoginMethod, pendingLoginPhone, pendingLoginEmail, pendingLoginPassword]);



  const renderChooseScreen = () => (
    <>
      <StaggeredItem index={0} baseDelay={600}>
        <View style={styles.welcomeHeader}>
          <Text style={styles.welcomeEmoji}>👋</Text>
          <View>
            <Text style={styles.selectTitle}>Добро пожаловать!</Text>
            <Text style={styles.selectSubtitle}>Войдите или создайте аккаунт</Text>
          </View>
        </View>
      </StaggeredItem>

      <StaggeredItem index={1} baseDelay={600}>
        <TouchableOpacity
          style={styles.loginBigButton}
          onPress={goToLogin}
          activeOpacity={0.85}
          testID="go-to-login"
        >
          <LinearGradient
            colors={['#12A85C', '#0E8B4A', '#0A7A3E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.loginBigGradient}
          >
            <View style={styles.loginIconWrap}>
              <LogIn size={20} color={Colors.white} />
            </View>
            <View style={styles.loginBigTextWrap}>
              <Text style={styles.loginBigTitle}>Войти в аккаунт</Text>
              <Text style={styles.loginBigSubtitle}>По телефону или email</Text>
            </View>
            <ArrowRight size={18} color="rgba(255,255,255,0.5)" />
          </LinearGradient>
        </TouchableOpacity>
      </StaggeredItem>

      <StaggeredItem index={2} baseDelay={600}>
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>регистрация</Text>
          <View style={styles.dividerLine} />
        </View>
      </StaggeredItem>

      {LOGIN_ROLE_CARDS.map((item, idx) => {
        const IconComp = item.icon;
        return (
          <StaggeredItem key={item.role} index={3 + idx} baseDelay={600}>
            <TouchableOpacity
              style={styles.roleCard}
              onPress={() => handleSelectRole(item.role)}
              activeOpacity={0.82}
              disabled={isSubmitting}
              testID={`role-${item.role}`}
            >
              <LinearGradient
                colors={[...item.gradient]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.roleIconWrap}
              >
                <IconComp size={22} color={Colors.white} />
              </LinearGradient>
              <View style={styles.roleContent}>
                <View style={styles.roleTitleRow}>
                  <Text style={styles.roleEmoji}>{item.emoji}</Text>
                  <Text style={styles.roleTitle}>{item.title}</Text>
                </View>
                <Text style={styles.roleSubtitle}>{item.subtitle}</Text>
              </View>
              <View style={[styles.roleArrow, { backgroundColor: item.accentColor + '18' }]}>
                <ArrowRight size={14} color={item.accentColor} />
              </View>
            </TouchableOpacity>
          </StaggeredItem>
        );
      })}

      {biometricEnabled && Platform.OS !== 'web' ? (
        <StaggeredItem index={5} baseDelay={600}>
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={() => {
              handleBiometricLogin().catch((e) => console.log('[LoginScreen] biometric login err:', e));
            }}
            activeOpacity={0.82}
            disabled={isSubmitting}
            testID="biometric-login"
          >
            <View style={styles.biometricIconWrap}>
              {biometricType === 'facial' ? (
                <ScanFace size={22} color="#4ADE80" />
              ) : (
                <Fingerprint size={22} color="#4ADE80" />
              )}
            </View>
            <View style={styles.biometricTextWrap}>
              <Text style={styles.biometricTitle}>Быстрый вход</Text>
              <Text style={styles.biometricSubtitle}>{biometricLabel}</Text>
            </View>
            <ArrowRight size={16} color="rgba(74,222,128,0.5)" />
          </TouchableOpacity>
        </StaggeredItem>
      ) : null}

      <StaggeredItem index={biometricEnabled && Platform.OS !== 'web' ? 6 : 5} baseDelay={600}>
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/');
          }}
          activeOpacity={0.7}
          style={{ alignItems: 'center', paddingVertical: 14, marginTop: 4 }}
          testID="continue-as-guest"
        >
          <Text style={{ color: Colors.textSecondary, fontSize: 14, fontWeight: '600' as const, textDecorationLine: 'underline' }}>
            Посмотреть активные заявки
          </Text>
        </TouchableOpacity>
      </StaggeredItem>

      <StaggeredItem index={biometricEnabled && Platform.OS !== 'web' ? 7 : 6} baseDelay={600}>
        <View style={styles.trustBadges}>
          <View style={styles.trustBadge}>
            <Shield size={13} color="#6EE7A3" />
            <Text style={styles.trustText}>Безопасно</Text>
          </View>
          <View style={styles.trustDot} />
          <View style={styles.trustBadge}>
            <Zap size={13} color="#FBBF24" />
            <Text style={styles.trustText}>Моментально</Text>
          </View>
          <View style={styles.trustDot} />
          <View style={styles.trustBadge}>
            <Star size={13} color="#FB923C" />
            <Text style={styles.trustText}>Бесплатно</Text>
          </View>
        </View>
      </StaggeredItem>
    </>
  );

  const renderLoginScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-login"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Авторизация</Text>
          <Text style={styles.screenHeaderTitle}>Вход в аккаунт</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.loginMethodTabs}>
          <TouchableOpacity
            style={[styles.loginMethodTab, loginMethod === 'phone' && styles.loginMethodTabActive]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLoginMethod('phone');
            }}
            activeOpacity={0.8}
            testID="login-method-phone"
          >
            <Phone size={14} color={loginMethod === 'phone' ? Colors.white : Colors.textMuted} />
            <Text style={[styles.loginMethodTabText, loginMethod === 'phone' && styles.loginMethodTabTextActive]}>
              Телефон
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.loginMethodTab, loginMethod === 'email' && styles.loginMethodTabActive]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setLoginMethod('email');
            }}
            activeOpacity={0.8}
            testID="login-method-email"
          >
            <AtSign size={14} color={loginMethod === 'email' ? Colors.white : Colors.textMuted} />
            <Text style={[styles.loginMethodTabText, loginMethod === 'email' && styles.loginMethodTabTextActive]}>
              Email
            </Text>
          </TouchableOpacity>
        </View>

        {loginMethod === 'phone' ? (
          <View style={styles.inputWrap}>
            <Phone size={16} color={Colors.textMuted} />
            <TextInput
              {...phoneInputProps}
              style={styles.inputInner}
              placeholder="89XXXXXXXXX"
              placeholderTextColor={Colors.textMuted}
              value={loginPhone}
              onChangeText={setLoginPhone}
              editable={!isSubmitting}
              testID="login-phone"
            />
          </View>
        ) : (
          <View style={styles.inputWrap}>
            <AtSign size={16} color={Colors.textMuted} />
            <TextInput
              {...emailInputProps}
              style={styles.inputInner}
              placeholder="Email"
              placeholderTextColor={Colors.textMuted}
              value={loginEmail}
              onChangeText={setLoginEmail}
              editable={!isSubmitting}
              testID="login-email"
            />
          </View>
        )}

        <View style={styles.inputWrap}>
          <Lock size={16} color={Colors.textMuted} />
          <TextInput
            {...passwordInputProps}
            style={styles.inputInner}
            placeholder="Пароль"
            placeholderTextColor={Colors.textMuted}
            value={loginPassword}
            onChangeText={setLoginPassword}
            editable={!isSubmitting}
            secureTextEntry={!showLoginPassword}
            testID="login-password"
          />
          <TouchableOpacity onPress={() => setShowLoginPassword((v) => !v)} style={styles.eyeButton}>
            {showLoginPassword ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <AnimatedActionButton
          label="Войти"
          onPress={() => {
            handleLogin().catch((error) => {
              console.log('[LoginScreen] Login promise rejection:', error);
            });
          }}
          disabled={isSubmitting}
          loading={isSubmitting}
          testID="login-submit"
        />

        <TouchableOpacity
          onPress={() => {
            setForgotEmail('');
            setForgotCode('');
            setScreenMode('forgot_password');
          }}
          style={styles.forgotButton}
          testID="forgot-password"
        >
          <Text style={styles.forgotText}>Забыли пароль?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={goToRegister} style={styles.switchModeButton} testID="switch-to-register">
          <Text style={styles.switchModeText}>Нет аккаунта? <Text style={styles.switchModeLink}>Зарегистрироваться</Text></Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderLoginVerifyScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-login-verify"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Подтверждение</Text>
          <Text style={styles.screenHeaderTitle}>Введите код</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <Shield size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>
          Для безопасности мы отправили код{"\n"}подтверждения на{"\n"}
          <Text style={styles.verifyEmailHighlight}>{loginMaskedEmail}</Text>
        </Text>

        <View style={[styles.inputWrap, styles.codeInputWrap]}>
          <TextInput
            {...oneTimeCodeInputProps}
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={Colors.textMuted}
            value={loginVerifyCode}
            onChangeText={(t) => setLoginVerifyCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            editable={!isSubmitting}
            maxLength={6}
            textAlign="center"
            testID="login-verify-code-input"
          />
        </View>

        <AnimatedActionButton
          label="Подтвердить и войти"
          onPress={() => {
            handleVerifyLoginCode().catch((e) => console.log('[LoginScreen] verify login code err:', e));
          }}
          disabled={isSubmitting || loginVerifyCode.length !== 6}
          loading={isSubmitting}
          testID="login-verify-submit"
        />

        <TouchableOpacity
          onPress={() => {
            handleResendCode().catch((e) => console.log('[LoginScreen] resend login code err:', e));
          }}
          disabled={resendCountdown > 0 || isSubmitting}
          style={styles.resendButton}
          testID="resend-login-code"
        >
          <Text style={[styles.resendText, resendCountdown > 0 && styles.resendTextDisabled]}>
            {resendCountdown > 0 ? `Отправить повторно (${resendCountdown}с)` : 'Отправить код повторно'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreenMode('login')} style={styles.switchModeButton} testID="back-to-login-from-verify">
          <Text style={styles.switchModeText}>Изменить данные входа</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderRegisterScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          disabled={isSubmitting}
          testID="change-role"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Регистрация</Text>
          <Text style={styles.screenHeaderTitle}>
            {selectedRole === 'client' ? '🏠 Аккаунт пользователя' : '🔧 Аккаунт исполнителя'}
          </Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.nameRow}>
          <View style={[styles.inputWrap, styles.nameInput]}>
            <TextInput
              {...familyNameInputProps}
              style={styles.inputInnerFull}
              placeholder="Фамилия"
              placeholderTextColor={Colors.textMuted}
              value={lastName}
              onChangeText={setLastName}
              editable={!isSubmitting}
              testID="register-lastname"
            />
          </View>
          <View style={[styles.inputWrap, styles.nameInput]}>
            <TextInput
              {...givenNameInputProps}
              style={styles.inputInnerFull}
              placeholder="Имя"
              placeholderTextColor={Colors.textMuted}
              value={firstName}
              onChangeText={setFirstName}
              editable={!isSubmitting}
              testID="register-firstname"
            />
          </View>
        </View>

        <View style={styles.inputWrap}>
          <Phone size={16} color={Colors.textMuted} />
          <TextInput
            {...phoneInputProps}
            style={styles.inputInner}
            placeholder="89XXXXXXXXX"
            placeholderTextColor={Colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            editable={!isSubmitting}
            testID="register-phone"
          />
        </View>

        <View style={styles.inputWrap}>
          <Mail size={16} color={Colors.textMuted} />
          <TextInput
            {...emailInputProps}
            style={styles.inputInner}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={email}
            onChangeText={setEmail}
            editable={!isSubmitting}
            testID="register-email"
          />
        </View>

        <View style={styles.inputWrap}>
          <Lock size={16} color={Colors.textMuted} />
          <TextInput
            {...newPasswordInputProps}
            style={styles.inputInner}
            placeholder="Пароль"
            placeholderTextColor={Colors.textMuted}
            value={password}
            onChangeText={setPassword}
            editable={!isSubmitting}
            secureTextEntry={!showPassword}
            testID="register-password"
          />
          <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeButton}>
            {showPassword ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <View style={styles.addressSection}>
          <View style={styles.sectionLabelRow}>
            <MapPin size={14} color={Colors.primary} />
            <Text style={styles.addressLabel}>Регион и город</Text>
          </View>
          <RegionCityPicker
            region={addrRegion}
            city={addrCity}
            onRegionChange={setAddrRegion}
            onCityChange={setAddrCity}
            disabled={isSubmitting}
          />
        </View>

        {selectedRole === 'client' ? (
          <View style={styles.addressSection}>
            <View style={styles.sectionLabelRow}>
              <MapPin size={14} color={Colors.primary} />
              <Text style={styles.addressLabel}>Адрес (подставится в заявки)</Text>
            </View>
            <View style={styles.inputWrap}>
              <TextInput
                {...streetAddressInputProps}
                style={styles.inputInnerFull}
                placeholder="Улица / Микрорайон"
                placeholderTextColor={Colors.textMuted}
                value={addrStreet}
                onChangeText={setAddrStreet}
                editable={!isSubmitting}
                testID="register-addr-street"
              />
            </View>
            <View style={styles.addrRow}>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...plainFieldProps}
                  style={styles.inputInnerFull}
                  placeholder="Дом"
                  placeholderTextColor={Colors.textMuted}
                  value={addrHouse}
                  onChangeText={setAddrHouse}
                  editable={!isSubmitting}
                  testID="register-addr-house"
                />
              </View>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...plainFieldProps}
                  style={styles.inputInnerFull}
                  placeholder="Корпус"
                  placeholderTextColor={Colors.textMuted}
                  value={addrBuilding}
                  onChangeText={setAddrBuilding}
                  editable={!isSubmitting}
                  testID="register-addr-building"
                />
              </View>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...numericNoSuggestProps}
                  style={styles.inputInnerFull}
                  placeholder="Кв."
                  placeholderTextColor={Colors.textMuted}
                  value={addrApartment}
                  onChangeText={setAddrApartment}
                  editable={!isSubmitting}
                  testID="register-addr-apartment"
                />
              </View>
            </View>
            <View style={styles.addrRow}>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...numericNoSuggestProps}
                  style={styles.inputInnerFull}
                  placeholder="Подъезд"
                  placeholderTextColor={Colors.textMuted}
                  value={addrEntrance}
                  onChangeText={setAddrEntrance}
                  editable={!isSubmitting}
                  testID="register-addr-entrance"
                />
              </View>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...numericNoSuggestProps}
                  style={styles.inputInnerFull}
                  placeholder="Этаж"
                  placeholderTextColor={Colors.textMuted}
                  value={addrFloor}
                  onChangeText={setAddrFloor}
                  editable={!isSubmitting}
                  testID="register-addr-floor"
                />
              </View>
              <View style={[styles.inputWrap, styles.addrSmall]}>
                <TextInput
                  {...plainFieldProps}
                  style={styles.inputInnerFull}
                  placeholder="Домофон"
                  placeholderTextColor={Colors.textMuted}
                  value={addrIntercom}
                  onChangeText={setAddrIntercom}
                  editable={!isSubmitting}
                  testID="register-addr-intercom"
                />
              </View>
            </View>
          </View>
        ) : null}

        {selectedRole === 'executor' ? (
          <View style={styles.servicesSection}>
            <View style={styles.sectionLabelRow}>
              <Wrench size={14} color={Colors.primary} />
              <Text style={styles.servicesTitle}>Какие услуги будете выполнять?</Text>
            </View>
            <Text style={styles.servicesSubtitle}>Уведомления приходят только по выбранным услугам</Text>
            <View style={styles.servicesGrid}>
              {serviceCategories.map((service) => {
                const selected = selectedServiceIds.includes(service.id);
                return (
                  <TouchableOpacity
                    key={service.id}
                    style={[styles.serviceChip, selected && styles.serviceChipSelected]}
                    onPress={() => toggleService(service.id)}
                    activeOpacity={0.82}
                    testID={`executor-service-${service.id}`}
                  >
                    <View style={[styles.serviceIconWrap, { backgroundColor: service.bgColor }]}>
                      <ServiceIcon name={service.icon} size={16} color={service.color} />
                    </View>
                    <Text style={[styles.serviceChipText, selected && styles.serviceChipTextSelected]}>{service.name}</Text>
                    {selected ? (
                      <View style={styles.serviceCheck}>
                        <Check size={12} color={Colors.white} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.termsRow}
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTermsAccepted((v) => !v);
          }}
          activeOpacity={0.7}
          testID="terms-checkbox"
        >
          <View style={[styles.termsCheckbox, termsAccepted && styles.termsCheckboxActive]}>
            {termsAccepted ? <Check size={14} color={Colors.white} /> : null}
          </View>
          <Text style={styles.termsText}>
            Я ознакомлен(а) с{' '}
            <Text
              style={styles.termsLink}
              onPress={() => router.push('/legal')}
            >
              пользовательским соглашением
            </Text>
            {' '}и{' '}
            <Text
              style={styles.termsLink}
              onPress={() => router.push('/legal')}
            >
              политикой конфиденциальности
            </Text>
          </Text>
        </TouchableOpacity>

        <AnimatedActionButton
          label="Продолжить"
          onPress={() => {
            handleSendRegCode().catch((error) => {
              console.log('[LoginScreen] Send reg code promise rejection:', error);
            });
          }}
          disabled={isSubmitting || !termsAccepted}
          loading={isSubmitting}
          testID="register-submit"
        />

        <TouchableOpacity onPress={goToLogin} style={styles.switchModeButton} testID="switch-to-login">
          <Text style={styles.switchModeText}>Уже есть аккаунт? <Text style={styles.switchModeLink}>Войти</Text></Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderRegisterVerifyScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-reg-verify"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Подтверждение</Text>
          <Text style={styles.screenHeaderTitle}>Проверьте email</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <Mail size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>
          Код подтверждения отправлен на{'\n'}
          <Text style={styles.verifyEmailHighlight}>{verifyEmail}</Text>
        </Text>

        <View style={[styles.inputWrap, styles.codeInputWrap]}>
          <TextInput
            {...oneTimeCodeInputProps}
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={Colors.textMuted}
            value={regVerifyCode}
            onChangeText={(t) => setRegVerifyCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            editable={!isSubmitting}
            maxLength={6}
            textAlign="center"
            testID="reg-verify-code-input"
          />
        </View>

        <AnimatedActionButton
          label={regCodeVerified ? 'Создание аккаунта...' : 'Подтвердить и создать аккаунт'}
          onPress={() => {
            handleVerifyRegCode().catch((e) => console.log('[LoginScreen] verify reg code err:', e));
          }}
          disabled={isSubmitting || regVerifyCode.length !== 6}
          loading={isSubmitting}
          testID="reg-verify-submit"
        />

        <TouchableOpacity
          onPress={() => {
            handleResendCode().catch((e) => console.log('[LoginScreen] resend reg code err:', e));
          }}
          disabled={resendCountdown > 0 || isSubmitting}
          style={styles.resendButton}
          testID="resend-reg-code"
        >
          <Text style={[styles.resendText, resendCountdown > 0 && styles.resendTextDisabled]}>
            {resendCountdown > 0 ? `Отправить повторно (${resendCountdown}с)` : 'Отправить код повторно'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setScreenMode('register')} style={styles.switchModeButton} testID="back-to-register">
          <Text style={styles.switchModeText}>Изменить данные</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderVerifyEmailScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-verify"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Подтверждение</Text>
          <Text style={styles.screenHeaderTitle}>Проверьте email</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <Mail size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>
          Код подтверждения отправлен на{'\n'}
          <Text style={styles.verifyEmailHighlight}>{verifyEmail}</Text>
        </Text>

        <View style={[styles.inputWrap, styles.codeInputWrap]}>
          <TextInput
            {...oneTimeCodeInputProps}
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={Colors.textMuted}
            value={verifyCode}
            onChangeText={(t) => setVerifyCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            editable={!isSubmitting}
            maxLength={6}
            textAlign="center"
            testID="verify-code-input"
          />
        </View>

        <AnimatedActionButton
          label="Подтвердить"
          onPress={() => {
            handleVerifyEmailCode().catch((e) => console.log('[LoginScreen] verify email code err:', e));
          }}
          disabled={isSubmitting || verifyCode.length !== 6}
          loading={isSubmitting}
          testID="verify-submit"
        />

        <TouchableOpacity
          onPress={() => {
            handleResendCode().catch((e) => console.log('[LoginScreen] resend code err:', e));
          }}
          disabled={resendCountdown > 0 || isSubmitting}
          style={styles.resendButton}
          testID="resend-code"
        >
          <Text style={[styles.resendText, resendCountdown > 0 && styles.resendTextDisabled]}>
            {resendCountdown > 0 ? `Отправить повторно (${resendCountdown}с)` : 'Отправить код повторно'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/')} style={styles.switchModeButton} testID="skip-verify">
          <Text style={styles.switchModeText}>Пропустить</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderForgotPasswordScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-forgot"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Восстановление</Text>
          <Text style={styles.screenHeaderTitle}>Забыли пароль?</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <KeyRound size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>
          Введите email, указанный при регистрации.{'\n'}Мы отправим код для сброса пароля.
        </Text>

        <View style={styles.inputWrap}>
          <Mail size={16} color={Colors.textMuted} />
          <TextInput
            {...emailInputProps}
            style={styles.inputInner}
            placeholder="Email"
            placeholderTextColor={Colors.textMuted}
            value={forgotEmail}
            onChangeText={setForgotEmail}
            editable={!isSubmitting}
            testID="forgot-email-input"
          />
        </View>

        <AnimatedActionButton
          label="Отправить код"
          onPress={() => {
            handleSendForgotCode().catch((e) => console.log('[LoginScreen] forgot code err:', e));
          }}
          disabled={isSubmitting || !forgotEmail.trim()}
          loading={isSubmitting}
          testID="forgot-send"
        />

        <TouchableOpacity onPress={() => setScreenMode('login')} style={styles.switchModeButton} testID="back-to-login-from-forgot">
          <Text style={styles.switchModeText}>Вернуться ко <Text style={styles.switchModeLink}>входу</Text></Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderForgotCodeScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-forgot-code"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Восстановление</Text>
          <Text style={styles.screenHeaderTitle}>Введите код</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <Mail size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>
          Код отправлен на{'\n'}
          <Text style={styles.verifyEmailHighlight}>{forgotEmail.trim().toLowerCase()}</Text>
        </Text>

        <View style={[styles.inputWrap, styles.codeInputWrap]}>
          <TextInput
            {...oneTimeCodeInputProps}
            style={styles.codeInput}
            placeholder="000000"
            placeholderTextColor={Colors.textMuted}
            value={forgotCode}
            onChangeText={(t) => setForgotCode(t.replace(/[^0-9]/g, '').slice(0, 6))}
            editable={!isSubmitting}
            maxLength={6}
            textAlign="center"
            testID="forgot-code-input"
          />
        </View>

        <AnimatedActionButton
          label="Подтвердить"
          onPress={() => {
            handleVerifyForgotCode().catch((e) => console.log('[LoginScreen] verify forgot code err:', e));
          }}
          disabled={isSubmitting || forgotCode.length !== 6}
          loading={isSubmitting}
          testID="forgot-code-submit"
        />

        <TouchableOpacity
          onPress={() => {
            handleResendCode().catch((e) => console.log('[LoginScreen] resend code err:', e));
          }}
          disabled={resendCountdown > 0 || isSubmitting}
          style={styles.resendButton}
          testID="resend-forgot-code"
        >
          <Text style={[styles.resendText, resendCountdown > 0 && styles.resendTextDisabled]}>
            {resendCountdown > 0 ? `Отправить повторно (${resendCountdown}с)` : 'Отправить код повторно'}
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );

  const renderResetPasswordScreen = () => (
    <>
      <View style={styles.screenHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          activeOpacity={0.7}
          testID="back-from-reset"
        >
          <ChevronLeft size={20} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.screenHeaderTextWrap}>
          <Text style={styles.screenHeaderLabel}>Восстановление</Text>
          <Text style={styles.screenHeaderTitle}>Новый пароль</Text>
        </View>
      </View>

      <View style={styles.formCard}>
        <View style={styles.verifyIconRow}>
          <View style={styles.verifyIconCircle}>
            <Lock size={28} color="#0E8B56" />
          </View>
        </View>

        <Text style={styles.verifyDesc}>Придумайте новый пароль для аккаунта</Text>

        <View style={styles.inputWrap}>
          <Lock size={16} color={Colors.textMuted} />
          <TextInput
            {...newPasswordInputProps}
            style={styles.inputInner}
            placeholder="Новый пароль"
            placeholderTextColor={Colors.textMuted}
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!isSubmitting}
            secureTextEntry={!showNewPassword}
            testID="reset-new-password"
          />
          <TouchableOpacity onPress={() => setShowNewPassword((v) => !v)} style={styles.eyeButton}>
            {showNewPassword ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        <View style={styles.inputWrap}>
          <Lock size={16} color={Colors.textMuted} />
          <TextInput
            {...newPasswordInputProps}
            style={styles.inputInner}
            placeholder="Повторите пароль"
            placeholderTextColor={Colors.textMuted}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!isSubmitting}
            secureTextEntry={!showConfirmPassword}
            testID="reset-confirm-password"
          />
          <TouchableOpacity onPress={() => setShowConfirmPassword((v) => !v)} style={styles.eyeButton}>
            {showConfirmPassword ? <EyeOff size={16} color={Colors.textMuted} /> : <Eye size={16} color={Colors.textMuted} />}
          </TouchableOpacity>
        </View>

        {newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword ? (
          <Text style={styles.passwordMismatch}>Пароли не совпадают</Text>
        ) : null}

        <AnimatedActionButton
          label="Сменить пароль"
          onPress={() => {
            handleResetPassword().catch((e) => console.log('[LoginScreen] reset pw err:', e));
          }}
          disabled={isSubmitting || !newPassword.trim() || newPassword !== confirmPassword}
          loading={isSubmitting}
          testID="reset-submit"
        />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#021A0E', '#042F1C', '#064D33', '#0A7A50']}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.heroSection}
      >
        <GlowOrb color="rgba(74,222,128,0.15)" size={200} x={-60} y={-40} delay={0} />
        <GlowOrb color="rgba(56,189,248,0.08)" size={160} x={SCREEN_WIDTH - 80} y={20} delay={1000} />
        <GlowOrb color="rgba(251,191,36,0.06)" size={120} x={SCREEN_WIDTH * 0.3} y={100} delay={2000} />

        <FloatingIcon icon={Wrench} delay={0} x={SCREEN_WIDTH * 0.12} y={55} color="rgba(110,231,163,0.4)" />
        <FloatingIcon icon={Zap} delay={700} x={SCREEN_WIDTH * 0.5} y={35} color="rgba(251,191,36,0.35)" />
        <FloatingIcon icon={Shield} delay={1400} x={SCREEN_WIDTH * 0.78} y={65} color="rgba(56,189,248,0.35)" />
        <FloatingIcon icon={Star} delay={2100} x={SCREEN_WIDTH * 0.65} y={105} color="rgba(251,146,60,0.3)" />

        <Animated.View style={[styles.heroContent, { opacity: heroOpacity, transform: [{ scale: heroScale }] }]}>
          <View style={styles.logoRow}>
            <Animated.View style={[styles.logoBadge, { opacity: logoGlow }]}>
              <View style={styles.logoBadgeInner}>
                <Text style={styles.logoLetter}>M</Text>
              </View>
            </Animated.View>
            <View>
              <View style={styles.logoTextRow}>
                <Text style={styles.logoLetterText}>M</Text>
                <Text style={styles.logoRestText}>USORKA</Text>
              </View>
              <View style={styles.locationChip}>
                <MapPin size={10} color="rgba(255,255,255,0.7)" />
                <Text style={styles.locationChipText}>Россия</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroTitle}>Бытовой помощник{'\n'}нового поколения</Text>

          <View style={styles.heroPills}>
            <View style={styles.heroPill}>
              <View style={[styles.heroPillDot, { backgroundColor: '#4ADE80' }]} />
              <Text style={styles.heroPillText}>Живые заявки</Text>
            </View>
            <View style={styles.heroPill}>
              <View style={[styles.heroPillDot, { backgroundColor: '#38BDF8' }]} />
              <Text style={styles.heroPillText}>Чат в реальном времени</Text>
            </View>
          </View>
        </Animated.View>
        <TouchableOpacity
          onPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/help');
          }}
          activeOpacity={0.8}
          style={styles.supportCorner}
          testID="hero-support-link"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Headphones size={14} color="#6EE7A3" />
          <Text style={styles.supportCornerText}>Поддержка</Text>
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[styles.bottomSheet, { opacity: contentOpacity, transform: [{ translateY: contentSlide }] }]}>
          <View style={styles.sheetHandle} />
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            {screenMode === 'choose' ? renderChooseScreen() : null}
            {screenMode === 'login' ? renderLoginScreen() : null}
            {screenMode === 'login_verify' ? renderLoginVerifyScreen() : null}
            {screenMode === 'register' ? renderRegisterScreen() : null}
            {screenMode === 'register_verify' ? renderRegisterVerifyScreen() : null}
            {screenMode === 'verify_email' ? renderVerifyEmailScreen() : null}
            {screenMode === 'forgot_password' ? renderForgotPasswordScreen() : null}
            {screenMode === 'forgot_code' ? renderForgotCodeScreen() : null}
            {screenMode === 'reset_password' ? renderResetPasswordScreen() : null}

            <Text style={styles.footer}>musorka.su</Text>
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}
