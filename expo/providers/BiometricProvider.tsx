import { useCallback, useEffect, useState, useMemo } from 'react';
import { Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import createContextHook from '@nkzw/create-context-hook';
import { useAuth } from '@/providers/AuthProvider';
import { trpc, type AuthSessionPayload } from '@/lib/trpc';

const BIOMETRIC_ENABLED_KEY = 'musorka_biometric_enabled';
const BIOMETRIC_UNLOCK_TOKEN_KEY = 'musorka_bio_unlock_token';

/** Legacy keys — cleared on startup (password must not persist on device). */
const LEGACY_BIOMETRIC_KEYS = [
  'musorka_bio_phone',
  'musorka_bio_email',
  'musorka_bio_password',
  'musorka_bio_method',
] as const;

type BiometricType = 'fingerprint' | 'facial' | 'iris' | 'none';

async function getLocalAuth() {
  if (Platform.OS === 'web') {
    return null;
  }
  try {
    return await import('expo-local-authentication');
  } catch {
    return null;
  }
}

async function clearLegacyBiometricSecureStore() {
  if (Platform.OS === 'web') return;
  for (const key of LEGACY_BIOMETRIC_KEYS) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  }
}

async function saveUnlockToken(token: string) {
  if (Platform.OS === 'web') return;
  await SecureStore.setItemAsync(BIOMETRIC_UNLOCK_TOKEN_KEY, token);
}

async function readUnlockToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_UNLOCK_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function deleteUnlockToken() {
  if (Platform.OS === 'web') return;
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_UNLOCK_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const [BiometricProvider, useBiometric] = createContextHook(() => {
  const { isAuthenticated } = useAuth();
  const [biometricEnabled, setBiometricEnabled] = useState<boolean>(false);
  const [biometricAvailable, setBiometricAvailable] = useState<boolean>(false);
  const [biometricType, setBiometricType] = useState<BiometricType>('none');
  const [isReady, setIsReady] = useState<boolean>(false);

  const registerUnlock = trpc.auth.registerBiometricUnlock.useMutation();
  const loginWithUnlock = trpc.auth.loginWithBiometricUnlock.useMutation();

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        if (Platform.OS !== 'web') {
          const hadLegacyPassword = await SecureStore.getItemAsync('musorka_bio_password').catch(() => null);
          if (hadLegacyPassword) {
            await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
          }
        }
        await clearLegacyBiometricSecureStore();

        const LocalAuth = await getLocalAuth();
        if (!LocalAuth || !mounted) {
          if (mounted) setIsReady(true);
          return;
        }

        const hasHardware = await LocalAuth.hasHardwareAsync();
        const isEnrolled = await LocalAuth.isEnrolledAsync();
        const available = hasHardware && isEnrolled;

        if (!mounted) return;
        setBiometricAvailable(available);

        if (available) {
          const types = await LocalAuth.supportedAuthenticationTypesAsync();
          if (!mounted) return;
          if (types.includes(LocalAuth.AuthenticationType.FACIAL_RECOGNITION)) {
            setBiometricType('facial');
          } else if (types.includes(LocalAuth.AuthenticationType.FINGERPRINT)) {
            setBiometricType('fingerprint');
          } else if (types.includes(LocalAuth.AuthenticationType.IRIS)) {
            setBiometricType('iris');
          }
        }

        const enabled = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
        if (mounted) {
          setBiometricEnabled(enabled === 'true');
        }
      } catch {
        /* ignore */
      } finally {
        if (mounted) setIsReady(true);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  const biometricLabel = useMemo(() => {
    switch (biometricType) {
      case 'facial':
        return Platform.OS === 'ios' ? 'Face ID' : 'Распознавание лица';
      case 'fingerprint':
        return Platform.OS === 'ios' ? 'Touch ID' : 'Отпечаток пальца';
      case 'iris':
        return 'Сканер радужки';
      default:
        return 'Биометрия';
    }
  }, [biometricType]);

  const clearCredentials = useCallback(async () => {
    try {
      if (Platform.OS === 'web') return;
      await deleteUnlockToken();
      await clearLegacyBiometricSecureStore();
    } catch {
      /* ignore */
    }
  }, []);

  const enableBiometric = useCallback(
    async (currentPassword?: string) => {
      try {
        const LocalAuth = await getLocalAuth();
        if (!LocalAuth) {
          Alert.alert('Недоступно', 'Биометрическая аутентификация недоступна на этом устройстве.');
          return false;
        }

        const result = await LocalAuth.authenticateAsync({
          promptMessage: `Подтвердите ${biometricLabel}`,
          cancelLabel: 'Отмена',
          disableDeviceFallback: false,
        });

        if (!result.success) {
          return false;
        }

        const payload =
          currentPassword !== undefined && currentPassword.trim().length > 0
            ? { currentPassword: currentPassword.trim() }
            : {};

        const data = await registerUnlock.mutateAsync(payload);
        await saveUnlockToken(data.unlockToken);
        await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
        setBiometricEnabled(true);
        return true;
      } catch {
        Alert.alert('Ошибка', 'Не удалось включить биометрическую аутентификацию.');
        return false;
      }
    },
    [biometricLabel, registerUnlock]
  );

  const disableBiometric = useCallback(async () => {
    try {
      await clearCredentials();
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, 'false');
      setBiometricEnabled(false);
    } catch {
      /* ignore */
    }
  }, [clearCredentials]);

  const authenticateWithBiometric = useCallback(async (): Promise<AuthSessionPayload | null> => {
    const LocalAuth = await getLocalAuth();
    if (!LocalAuth) return null;

    const result = await LocalAuth.authenticateAsync({
      promptMessage: `Войти с помощью ${biometricLabel}`,
      cancelLabel: 'Отмена',
      disableDeviceFallback: false,
    });

    if (!result.success) {
      return null;
    }

    const unlockToken = await readUnlockToken();
    if (!unlockToken) {
      await disableBiometric();
      return null;
    }

    const data = await loginWithUnlock.mutateAsync({ unlockToken });
    await saveUnlockToken(data.nextUnlockToken);
    return { user: data.user, token: data.token };
  }, [biometricLabel, disableBiometric, loginWithUnlock]);

  useEffect(() => {
    if (!isAuthenticated && biometricEnabled) {
      // keep biometric enabled across logouts so user can re-login
    }
  }, [isAuthenticated, biometricEnabled]);

  return useMemo(
    () => ({
      biometricEnabled,
      biometricAvailable,
      biometricType,
      biometricLabel,
      isReady,
      enableBiometric,
      disableBiometric,
      authenticateWithBiometric,
      clearCredentials,
    }),
    [
      biometricEnabled,
      biometricAvailable,
      biometricType,
      biometricLabel,
      isReady,
      enableBiometric,
      disableBiometric,
      authenticateWithBiometric,
      clearCredentials,
    ]
  );
});
