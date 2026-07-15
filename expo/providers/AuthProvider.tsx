import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';
import { UserProfile, UserRole, UserAddress } from '@/types';
import { trpc, getAuthToken, setAuthToken, type AuthSessionPayload, type RouterOutputs } from '@/lib/trpc';
import { registerSessionInvalidHandler } from '@/lib/auth-session-events';
import { getTrpcErrorCode, getTrpcErrorMessage } from '@/lib/trpc-error-utils';


interface RegisterPayload {
  role: UserRole;
  name: string;
  firstName?: string;
  lastName?: string;
  phone: string;
  email: string;
  password?: string;
  verificationCode?: string;
  city?: string;
  region?: string;
  address?: string;
  addressDetails?: {
    city?: string;
    street?: string;
    house?: string;
    building?: string;
    apartment?: string;
    entrance?: string;
    floor?: string;
    intercom?: string;
  };
  subscribedServiceIds?: string[];
}

const AUTH_KEY = 'musorka_auth';
const CACHED_PROFILE_KEY = 'musorka_cached_profile';
const USE_BACKEND = true;

/** Persisted cache: only non-sensitive fields (full profile comes from auth.me). */
type CachedProfileSnapshotV1 = {
  v: 1;
  id: string;
  role: UserRole;
  name: string;
  avatar?: string | null;
};

let _cachedProfileLoaded = false;
let _cachedProfileData: UserProfile | null = null;
let _cachedProfilePromise: Promise<UserProfile | null> | null = null;
let _restoredMinimalProfile = false;

function emptyProfileSkeleton(overrides: Partial<UserProfile> & Pick<UserProfile, 'id' | 'role' | 'name'>): UserProfile {
  return {
    id: overrides.id,
    role: overrides.role,
    name: overrides.name,
    firstName: overrides.firstName,
    lastName: overrides.lastName,
    phone: overrides.phone ?? '',
    email: overrides.email ?? '',
    city: overrides.city ?? '',
    requestsCount: overrides.requestsCount ?? 0,
    completedCount: overrides.completedCount ?? 0,
    rating: overrides.rating ?? 5,
    subscribedServiceIds: overrides.subscribedServiceIds ?? [],
    addresses: overrides.addresses ?? [],
    avatar: overrides.avatar,
    about: overrides.about,
    portfolioCount: overrides.portfolioCount,
    isFullyVerified: overrides.isFullyVerified,
    statusText: overrides.statusText,
    emailVerified: overrides.emailVerified,
    hasPassword: overrides.hasPassword,
  };
}

function profileToSnapshot(profile: UserProfile): CachedProfileSnapshotV1 {
  return {
    v: 1,
    id: profile.id,
    role: profile.role,
    name: profile.name || 'Пользователь',
    avatar: profile.avatar ?? null,
  };
}

function parseCachedProfileDisk(raw: string): { profile: UserProfile | null; minimal: boolean } {
  try {
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p && p.v === 1 && typeof p.id === 'string' && typeof p.role === 'string' && typeof p.name === 'string') {
      const snap = p as unknown as CachedProfileSnapshotV1;
      return {
        profile: emptyProfileSkeleton({
          id: snap.id,
          role: snap.role as UserRole,
          name: snap.name,
          avatar: snap.avatar ?? undefined,
        }),
        minimal: true,
      };
    }
    if (p && typeof p.id === 'string' && typeof p.role === 'string') {
      const legacy = p as unknown as UserProfile;
      const snap = profileToSnapshot(legacy);
      void AsyncStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(snap));
      return {
        profile: emptyProfileSkeleton({
          id: snap.id,
          role: snap.role,
          name: snap.name,
          avatar: snap.avatar ?? undefined,
        }),
        minimal: true,
      };
    }
  } catch {
    /* ignore */
  }
  return { profile: null, minimal: false };
}

function preloadCachedProfile(): Promise<UserProfile | null> {
  if (_cachedProfileLoaded) return Promise.resolve(_cachedProfileData);
  if (_cachedProfilePromise) return _cachedProfilePromise;
  _cachedProfilePromise = AsyncStorage.getItem(CACHED_PROFILE_KEY).then((raw) => {
    _cachedProfileLoaded = true;
    _cachedProfilePromise = null;
    if (!raw) {
      _cachedProfileData = null;
      _restoredMinimalProfile = false;
      return null;
    }
    const { profile, minimal } = parseCachedProfileDisk(raw);
    _cachedProfileData = profile;
    _restoredMinimalProfile = minimal;
    return profile;
  }).catch(() => {
    _cachedProfileLoaded = true;
    _cachedProfileData = null;
    _cachedProfilePromise = null;
    _restoredMinimalProfile = false;
    return null;
  });
  return _cachedProfilePromise;
}

function saveCachedProfile(profile: UserProfile | null) {
  _cachedProfileData = profile;
  _cachedProfileLoaded = true;
  if (profile) {
    void AsyncStorage.setItem(CACHED_PROFILE_KEY, JSON.stringify(profileToSnapshot(profile)));
  } else {
    void AsyncStorage.removeItem(CACHED_PROFILE_KEY);
    _restoredMinimalProfile = false;
  }
}

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [user, setUser] = useState<UserProfile | null>(_cachedProfileData);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!_cachedProfileData);
  const [tokenReady, setTokenReady] = useState<boolean>(false);
  const [hasToken, setHasToken] = useState<boolean>(false);
  const skipMeQueryRef = useRef<boolean>(!!_cachedProfileData);
  const [skipMeQuery, setSkipMeQueryState] = useState<boolean>(!!_cachedProfileData);
  const setSkipMeQuery = useCallback((v: boolean) => {
    skipMeQueryRef.current = v;
    setSkipMeQueryState(v);
  }, []);
  const sessionInvalidHandledRef = useRef<boolean>(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    registerSessionInvalidHandler(async () => {
      if (sessionInvalidHandledRef.current) return;
      sessionInvalidHandledRef.current = true;
      setSkipMeQuery(false);
      try {
        await setAuthToken(null);
        setHasToken(false);
        setUser(null);
        setIsAuthenticated(false);
        saveCachedProfile(null);
        queryClient.clear();
        console.log('[AuthProvider] Global session invalid — cleared local auth state');
      } catch (e) {
        console.warn('[AuthProvider] Session invalid handler error:', e);
      }
    });
    return () => registerSessionInvalidHandler(null);
  }, [queryClient]);

  useEffect(() => {
    void Promise.all([getAuthToken(), preloadCachedProfile()]).then(([token, cachedProfile]) => {
      setHasToken(!!token);
      setTokenReady(true);
      if (cachedProfile && token) {
        setUser(cachedProfile);
        setIsAuthenticated(true);
        setSkipMeQuery(true);
        console.log('[AuthProvider] Instant restore from cache (skip immediate /me):', cachedProfile.role, cachedProfile.id);
      } else if (!token) {
        saveCachedProfile(null);
      }
      console.log('[AuthProvider] Token loaded:', token ? 'yes' : 'no');
    });
  }, []);

  const hasCachedUser = !!user && skipMeQuery;
  const shouldFetchMe = USE_BACKEND && tokenReady && hasToken && !hasCachedUser;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: shouldFetchMe,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(800 * (attemptIndex + 1), 3000),
    staleTime: 30_000,
    gcTime: 600_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    placeholderData: (prev: any) => prev,
  });

  useEffect(() => {
    if (hasCachedUser && tokenReady && hasToken) {
      setSkipMeQuery(false);
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
      console.log('[AuthProvider] Background refresh of /me triggered');
    }
  }, [hasCachedUser, tokenReady, hasToken, queryClient, setSkipMeQuery]);

  const localAuthQuery = useQuery({
    queryKey: ['auth-local'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(AUTH_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<UserProfile>;
        return {
          ...parsed,
          subscribedServiceIds: parsed.subscribedServiceIds ?? [],
        } as UserProfile;
      }
      return null;
    },
    enabled: !USE_BACKEND,
  });

  useEffect(() => {
    if (USE_BACKEND) {
      if (skipMeQueryRef.current && !meQuery.data) return;
      if (meQuery.data) {
        const profile = meQuery.data as unknown as UserProfile;
        setUser(profile);
        setIsAuthenticated(true);
        saveCachedProfile(profile);
        console.log('[AuthProvider] Backend user loaded:', profile.role, profile.id);
      } else if (tokenReady && !meQuery.isLoading && !meQuery.isFetching) {
        if (meQuery.error) {
          const errorCode = getTrpcErrorCode(meQuery.error);
          const errorMsg = getTrpcErrorMessage(meQuery.error);
          const isAuthError = errorCode === 'UNAUTHORIZED' || errorMsg.includes('авторизация');
          const isNetworkError = errorMsg.includes('сети') || errorMsg.includes('timeout') || errorMsg.includes('ожидания') || errorMsg.includes('недоступен') || errorMsg.includes('Failed to fetch') || errorMsg.includes('503');
          if (isAuthError) {
            console.log('[AuthProvider] Session invalid (UNAUTHORIZED), clearing token');
            setUser(null);
            setIsAuthenticated(false);
            saveCachedProfile(null);
            void setAuthToken(null);
            setHasToken(false);
          } else if (isNetworkError) {
            console.log('[AuthProvider] /me query failed with network error — keeping cached session:', errorMsg);
          } else {
            console.log('[AuthProvider] /me query failed with non-auth error:', errorCode, errorMsg, '— keeping session');
          }
        } else if (!hasToken) {
          setUser(null);
          setIsAuthenticated(false);
        }
      }
    } else if (localAuthQuery.data !== undefined) {
      setUser(localAuthQuery.data);
      setIsAuthenticated(localAuthQuery.data !== null);
    }
  }, [meQuery.data, meQuery.error, meQuery.isLoading, meQuery.isFetching, tokenReady, hasToken, localAuthQuery.data]);

  const handleAuthSuccess = useCallback(async (data: AuthSessionPayload) => {
    try {
      sessionInvalidHandledRef.current = false;
      console.log('[AuthProvider] handleAuthSuccess called, data keys:', data ? Object.keys(data) : 'null');
      setSkipMeQuery(true);
      const token = data.token;
      if (token && typeof token === 'string') {
        await setAuthToken(token);
        setHasToken(true);
      } else {
        console.warn('[AuthProvider] Invalid token in auth response:', typeof token);
      }
      const profile = data.user as UserProfile;
      setUser(profile);
      setIsAuthenticated(true);
      saveCachedProfile(profile);
      console.log('[AuthProvider] Auth success:', profile?.role, profile?.id);
    } catch (err: unknown) {
      console.warn('[AuthProvider] handleAuthSuccess error:', getTrpcErrorMessage(err));
    }
  }, []);

  const backendRegister = trpc.auth.register.useMutation({
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      console.log('[AuthProvider] Register mutation error:', err.message);
    },
    retry: false,
  });

  const backendLogin = trpc.auth.login.useMutation({
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      console.log('[AuthProvider] Login mutation error:', err.message);
    },
    retry: false,
  });

  const backendUpdateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: (data: RouterOutputs['auth']['updateProfile']) => {
      const profile = data as UserProfile;
      setUser(profile);
      saveCachedProfile(profile);
      console.log('[AuthProvider] Backend profile updated');
    },
  });

  const backendSwitchDemoRole = trpc.auth.switchDemoRole.useMutation({
    onSuccess: (data) => {
      setUser((prev) => {
        if (!prev) return prev;
        const updated: UserProfile = { ...prev, role: data.role };
        saveCachedProfile(updated);
        return updated;
      });
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
    },
  });

  const switchDemoRole = useCallback(async (nextRole: 'client' | 'executor'): Promise<void> => {
    await backendSwitchDemoRole.mutateAsync({ role: nextRole });
  }, [backendSwitchDemoRole]);

  const backendLogout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      setSkipMeQuery(false);
      await setAuthToken(null);
      setHasToken(false);
      setUser(null);
      setIsAuthenticated(false);
      saveCachedProfile(null);
      queryClient.clear();
      console.log('[AuthProvider] Backend logout');
    },
  });

  const localRegisterMutation = useMutation({
    mutationFn: async ({ role, name, firstName, lastName, phone, email, password, address, addressDetails, subscribedServiceIds = [] }: RegisterPayload) => {
      const normalizedPhone = phone.trim();
      const normalizedEmail = email.trim();

      const allUsersRaw = await AsyncStorage.getItem('musorka_all_users');
      const existingUsers: UserProfile[] = allUsersRaw ? JSON.parse(allUsersRaw) : [];
      const phoneExists = existingUsers.some((u) => u.phone === normalizedPhone);
      if (phoneExists) {
        throw new Error('PHONE_EXISTS');
      }

      let fullAddress = address?.trim() ?? '';
      if (addressDetails) {
        const parts = [
          addressDetails.city,
          addressDetails.street,
          addressDetails.house ? `д. ${addressDetails.house}` : '',
          addressDetails.building ? `корп. ${addressDetails.building}` : '',
          addressDetails.apartment ? `кв. ${addressDetails.apartment}` : '',
          addressDetails.entrance ? `подъезд ${addressDetails.entrance}` : '',
          addressDetails.floor ? `этаж ${addressDetails.floor}` : '',
          addressDetails.intercom ? `домофон ${addressDetails.intercom}` : '',
        ].filter(Boolean);
        fullAddress = parts.join(', ');
      }

      const initialAddresses: UserAddress[] = fullAddress
        ? [{
            id: `addr_${Date.now()}`,
            label: 'Дом',
            address: fullAddress,
            ...(addressDetails ?? {}),
          }]
        : [];

      const profile: UserProfile = {
        id: `${role}_${Date.now()}`,
        name: name.trim(),
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        phone: normalizedPhone,
        email: normalizedEmail,
        password,
        role,
        city: addressDetails?.city?.trim() || '',
        requestsCount: 0,
        completedCount: 0,
        rating: 5,
        subscribedServiceIds: role === 'executor' ? subscribedServiceIds : [],
        addresses: initialAddresses,
      };

      existingUsers.push(profile);
      await AsyncStorage.setItem('musorka_all_users', JSON.stringify(existingUsers));
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(profile));
      return profile;
    },
    onSuccess: (profile) => {
      setUser(profile);
      setIsAuthenticated(true);
      void queryClient.invalidateQueries({ queryKey: ['auth-local'] });
    },
  });

  const localUpdateProfileMutation = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      if (!user) throw new Error('No user');
      const updated = { ...user, ...updates };
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(updated));
      return updated;
    },
    onSuccess: (profile) => {
      setUser(profile);
      void queryClient.invalidateQueries({ queryKey: ['auth-local'] });
    },
  });

  const localLogoutMutation = useMutation({
    mutationFn: async () => {
      await AsyncStorage.removeItem(AUTH_KEY);
    },
    onSuccess: () => {
      setUser(null);
      setIsAuthenticated(false);
      void queryClient.invalidateQueries({ queryKey: ['auth-local'] });
    },
  });

  const backendLoginByEmail = trpc.auth.loginByEmail.useMutation({
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      console.log('[AuthProvider] LoginByEmail mutation error:', err.message);
    },
    retry: false,
  });

  const backendOauthLogin = trpc.auth.oauthLogin.useMutation({
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      console.log('[AuthProvider] OAuth login mutation error:', err.message);
    },
    retry: false,
  });

  const backendLoginVerifyComplete = trpc.auth.loginVerifyComplete.useMutation({
    onSuccess: handleAuthSuccess,
    onError: (err) => {
      console.log('[AuthProvider] LoginVerifyComplete mutation error:', err.message);
    },
    retry: false,
  });

  const loginByCredentials = useCallback(async (phone: string, password: string): Promise<boolean> => {
    if (USE_BACKEND) {
      try {
        console.log('[AuthProvider] Starting backend login for:', phone.trim());
        const result = await backendLogin.mutateAsync({ phone: phone.trim(), password });
        console.log('[AuthProvider] Backend login mutateAsync resolved, result:', result ? 'ok' : 'empty');
        if (result && !isAuthenticated) {
          try {
            setSkipMeQuery(true);
            const token = result.token;
            if (token && typeof token === 'string') {
              await setAuthToken(token);
              setHasToken(true);
            }
            const profile = result.user as UserProfile;
            setUser(profile);
            setIsAuthenticated(true);
            console.log('[AuthProvider] Login recovery applied for:', profile?.role, profile?.id);
          } catch (recoveryErr: unknown) {
            console.warn('[AuthProvider] Login recovery error:', getTrpcErrorMessage(recoveryErr));
          }
        }
        return true;
      } catch (error: unknown) {
        console.log('[AuthProvider] Backend login error:', getTrpcErrorMessage(error), getTrpcErrorCode(error));
        const code = getTrpcErrorCode(error) || '';
        const msg = getTrpcErrorMessage(error);
        if (code === 'NOT_FOUND' || msg.includes('не найден')) {
          throw new Error('USER_NOT_FOUND');
        }
        if (code === 'UNAUTHORIZED' || msg.includes('пароль')) {
          throw new Error('WRONG_PASSWORD');
        }
        if (code === 'FORBIDDEN' || msg.includes('заблокирован')) {
          throw new Error('BLOCKED');
        }
        const isNetwork = msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания') || msg.includes('недоступен') || msg.includes('Failed to fetch') || msg.includes('503');
        if (isNetwork) {
          throw new Error('NETWORK_ERROR');
        }
        throw error;
      }
    }

    const allUsersRaw = await AsyncStorage.getItem('musorka_all_users');
    const allUsers: UserProfile[] = allUsersRaw ? JSON.parse(allUsersRaw) : [];
    const found = allUsers.find((u) => u.phone === phone.trim() && u.password === password);
    if (found) {
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify(found));
      setUser(found);
      setIsAuthenticated(true);
      void queryClient.invalidateQueries({ queryKey: ['auth-local'] });
      return true;
    }
    return false;
  }, [queryClient, backendLogin, isAuthenticated]);

  const loginByEmail = useCallback(async (email: string, password: string): Promise<boolean> => {
    if (USE_BACKEND) {
      try {
        console.log('[AuthProvider] Starting backend loginByEmail for:', email.trim());
        const result = await backendLoginByEmail.mutateAsync({ email: email.trim().toLowerCase(), password });
        console.log('[AuthProvider] LoginByEmail resolved:', result ? 'ok' : 'empty');
        if (result && !isAuthenticated) {
          try {
            setSkipMeQuery(true);
            const token = result.token;
            if (token && typeof token === 'string') {
              await setAuthToken(token);
              setHasToken(true);
            }
            const profile = result.user as UserProfile;
            setUser(profile);
            setIsAuthenticated(true);
          } catch (recoveryErr: unknown) {
            console.warn('[AuthProvider] LoginByEmail recovery error:', getTrpcErrorMessage(recoveryErr));
          }
        }
        return true;
      } catch (error: unknown) {
        console.log('[AuthProvider] LoginByEmail error:', getTrpcErrorMessage(error), getTrpcErrorCode(error));
        const code = getTrpcErrorCode(error) || '';
        const msg = getTrpcErrorMessage(error);
        if (code === 'NOT_FOUND' || msg.includes('не найден')) {
          throw new Error('USER_NOT_FOUND');
        }
        if (code === 'UNAUTHORIZED' || msg.includes('пароль')) {
          throw new Error('WRONG_PASSWORD');
        }
        if (code === 'FORBIDDEN' || msg.includes('заблокирован')) {
          throw new Error('BLOCKED');
        }
        if (code === 'BAD_REQUEST' || msg.includes('соцсети')) {
          throw new Error('OAUTH_ACCOUNT');
        }
        const isNetwork = msg.includes('сети') || msg.includes('timeout') || msg.includes('ожидания') || msg.includes('недоступен') || msg.includes('Failed to fetch') || msg.includes('503');
        if (isNetwork) {
          throw new Error('NETWORK_ERROR');
        }
        throw error;
      }
    }
    return false;
  }, [backendLoginByEmail, isAuthenticated]);

  const loginWithCode = useCallback(async (params: { method: 'phone' | 'email'; phone?: string; email?: string; password: string; code: string }): Promise<boolean> => {
    try {
      const result = await backendLoginVerifyComplete.mutateAsync(params);
      if (result && !isAuthenticated) {
        try {
          setSkipMeQuery(true);
          const token = result.token;
          if (token && typeof token === 'string') {
            await setAuthToken(token);
            setHasToken(true);
          }
          const profile = result.user as UserProfile;
          setUser(profile);
          setIsAuthenticated(true);
          saveCachedProfile(profile);
        } catch (recoveryErr: unknown) {

        }
      }
      return true;
    } catch (error: unknown) {
      if (__DEV__) console.log('[AuthProvider] loginWithCode error:', getTrpcErrorCode(error));
      throw error;
    }
  }, [backendLoginVerifyComplete, isAuthenticated]);

  const loginDirect = useCallback(async (result: AuthSessionPayload): Promise<boolean> => {
    try {

      setSkipMeQuery(true);
      await setAuthToken(result.token);
      setHasToken(true);
      const profile = result.user as UserProfile;
      setUser(profile);
      setIsAuthenticated(true);
      saveCachedProfile(profile);
      return true;
    } catch (error: unknown) {

      throw error;
    }
  }, []);

  const oauthLogin = useCallback(async (provider: 'google' | 'yandex', providerToken: string, extras?: { email?: string; name?: string; oauthId?: string }): Promise<boolean> => {
    if (USE_BACKEND) {
      try {

        const result = await backendOauthLogin.mutateAsync({
          provider,
          providerToken,
          email: extras?.email,
          name: extras?.name,
          oauthId: extras?.oauthId,
        });

        if (result && !isAuthenticated) {
          try {
            setSkipMeQuery(true);
            const token = result.token;
            if (token && typeof token === 'string') {
              await setAuthToken(token);
              setHasToken(true);
            }
            const profile = result.user as UserProfile;
            setUser(profile);
            setIsAuthenticated(true);
          } catch (recoveryErr: unknown) {

          }
        }
        return true;
      } catch (error: unknown) {
        if (__DEV__) console.log('[AuthProvider] OAuth error:', getTrpcErrorCode(error));
        if (getTrpcErrorCode(error) === 'FORBIDDEN') {
          throw new Error('BLOCKED');
        }
        throw error;
      }
    }
    return false;
  }, [backendOauthLogin, isAuthenticated]);

  const register = useCallback(async (payload: RegisterPayload): Promise<void> => {
    if (USE_BACKEND) {

      try {
        await backendRegister.mutateAsync({
          role: payload.role as 'client' | 'executor',
          firstName: payload.firstName,
          lastName: payload.lastName,
          phone: payload.phone,
          email: payload.email || '',
          password: payload.password || '',
          verificationCode: payload.verificationCode || '',
          city: payload.city || payload.addressDetails?.city,
          region: payload.region,
          addressDetails: payload.addressDetails,
          subscribedServiceIds: payload.subscribedServiceIds,
        });

      } catch (err: unknown) {
        if (__DEV__) console.log('[AuthProvider] Register failed:', getTrpcErrorCode(err));
        if (getTrpcErrorCode(err) === 'CONFLICT' || getTrpcErrorMessage(err).includes('PHONE_EXISTS')) {
          throw new Error('PHONE_EXISTS');
        }
        throw err;
      }
      return;
    }
    await localRegisterMutation.mutateAsync(payload);
  }, [backendRegister, localRegisterMutation]);

  const login = useCallback(async (role: UserRole): Promise<void> => {

  }, []);

  const logout = useCallback(async (): Promise<void> => {
    if (USE_BACKEND) {
      setSkipMeQuery(false);
      setUser(null);
      setIsAuthenticated(false);
      saveCachedProfile(null);
      const tokenCopy = await getAuthToken();
      await setAuthToken(null);
      setHasToken(false);
      queryClient.clear();

      if (tokenCopy) {
        backendLogout.mutate(undefined, {
          onError: (err) => {

          },
        });
      }
      return;
    }
    await localLogoutMutation.mutateAsync();
  }, [backendLogout, localLogoutMutation, queryClient]);

  const backendAddAddress = trpc.auth.addAddress.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
    },
  });

  const backendRemoveAddress = trpc.auth.removeAddress.useMutation({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [['auth', 'me']] });
    },
  });

  const updateProfile = useCallback(async (updates: Partial<UserProfile>): Promise<void> => {
    if (USE_BACKEND) {
      await backendUpdateProfile.mutateAsync({
        firstName: updates.firstName,
        lastName: updates.lastName,
        phone: updates.phone,
        email: updates.email,
        city: updates.city,
        avatar: updates.avatar,
        about: updates.about,
        statusText: updates.statusText,
        subscribedServiceIds: updates.subscribedServiceIds,
      });
      return;
    }
    await localUpdateProfileMutation.mutateAsync(updates);
  }, [backendUpdateProfile, localUpdateProfileMutation]);

  const addAddress = useCallback(async (address: {
    label?: string;
    fullAddress?: string;
    city?: string;
    street?: string;
    house?: string;
    building?: string;
    apartment?: string;
    entrance?: string;
    floor?: string;
    intercom?: string;
  }): Promise<void> => {
    if (USE_BACKEND) {
      const newAddr = await backendAddAddress.mutateAsync(address);
      setUser((prev) => {
        if (!prev) return prev;
        const currentAddresses = Array.isArray(prev.addresses) ? prev.addresses : [];
        return { ...prev, addresses: [...currentAddresses, newAddr as unknown as UserAddress] };
      });
      return;
    }
    const newAddr: UserAddress = {
      id: `addr_${Date.now()}`,
      label: address.label ?? 'Дом',
      address: address.fullAddress ?? '',
      ...address,
    };
    const updated = [...(user?.addresses ?? []), newAddr];
    await localUpdateProfileMutation.mutateAsync({ addresses: updated });
  }, [backendAddAddress, localUpdateProfileMutation, user?.addresses]);

  const removeAddress = useCallback(async (addressId: string): Promise<void> => {
    if (USE_BACKEND) {
      await backendRemoveAddress.mutateAsync({ addressId });
      setUser((prev) => {
        if (!prev) return prev;
        const currentAddresses = Array.isArray(prev.addresses) ? prev.addresses : [];
        return { ...prev, addresses: currentAddresses.filter((a) => a.id !== addressId) };
      });
      return;
    }
    const updated = (user?.addresses ?? []).filter((a) => a.id !== addressId);
    await localUpdateProfileMutation.mutateAsync({ addresses: updated });
  }, [backendRemoveAddress, localUpdateProfileMutation, user?.addresses]);

  const isLoading = USE_BACKEND
    ? (!tokenReady || (hasToken && !skipMeQuery && !user && meQuery.isLoading))
    : localAuthQuery.isLoading;

  return useMemo(() => ({
    user,
    isAuthenticated,
    isLoading,
    tokenReady,
    login,
    loginByCredentials,
    loginByEmail,
    loginWithCode,
    loginDirect,
    oauthLogin,
    register,
    logout,
    updateProfile,
    addAddress,
    removeAddress,
    switchDemoRole,
    role: user?.role ?? null,
  }), [isLoading, isAuthenticated, tokenReady, login, loginByCredentials, loginByEmail, loginWithCode, loginDirect, oauthLogin, logout, register, updateProfile, addAddress, removeAddress, switchDemoRole, user]);
});
