import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { StyleSheet, Platform, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RequestsProvider } from '@/providers/RequestsProvider';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { NotificationsProvider } from '@/providers/NotificationsProvider';
import { ChatProvider } from '@/providers/ChatProvider';
import { BiometricProvider, useBiometric } from '@/providers/BiometricProvider';
import { trpc, trpcClient } from '@/lib/trpc';
import { hasApiBaseUrl } from '@/lib/get-api-base-url';
import Colors from '@/constants/colors';
import AnimatedSplash from '@/components/AnimatedSplash';
import { useHeartbeat } from '@/hooks/useOnlinePresence';



let queryClient: QueryClient;
try {
  queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, err: any) => {
          const msg = err?.message || '';
          if (msg.includes('Слишком много запросов')) return false;
          return failureCount < 1;
        },
        retryDelay: 1500,
        staleTime: 60_000,
        gcTime: 900_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        refetchOnMount: false,
      },
      mutations: {
        retry: 0,
        networkMode: 'always',
      },
    },
  });

} catch (e) {
  if (__DEV__) console.error('[APP_BOOT] QueryClient creation failed:', e);
  queryClient = new QueryClient();
}



const AUTH_REQUIRED_ROUTES = new Set<string>([
  'chat-room',
  'executor-summary',
  'settings',
]);
const AUTH_REQUIRED_TABS = new Set<string>([
  'chat',
  'notifications',
  'profile',
  'admin',
]);

function AuthRedirectGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (isLoading) return;

    const first = segments[0] ?? '';
    const inLoginPage = first === 'login';

    const isAuthRequiredStack = AUTH_REQUIRED_ROUTES.has(first);
    const inTabs = first === '(tabs)';
    const tabSegment = inTabs ? ((segments as string[])[1] ?? '') : '';
    const isAuthRequiredTab = inTabs && AUTH_REQUIRED_TABS.has(tabSegment);

    if (!isAuthenticated && !inLoginPage && (isAuthRequiredStack || isAuthRequiredTab)) {
      console.log('[AuthGuard] Account-only route, redirecting to login:', segments.join('/'));
      hasRedirected.current = true;
      router.replace('/login');
    } else if (isAuthenticated && inLoginPage) {
      console.log('[AuthGuard] Authenticated, redirecting to home');
      hasRedirected.current = true;
      router.replace('/');
    }
  }, [isAuthenticated, isLoading, segments, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  useHeartbeat();

  return (
    <AuthRedirectGuard>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
        <Stack.Screen
          name="create-request"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="request-details"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="chat-room"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="executor-summary"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="map-picker"
          options={{
            headerShown: false,
            presentation: 'modal',
          }}
        />
        <Stack.Screen
          name="public-profile"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="help"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="legal"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="privacy-policy"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="support"
          options={{
            headerShown: false,
          }}
        />
      </Stack>
    </AuthRedirectGuard>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  fallbackRoot: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  fallbackText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  fallbackDetail: {
    fontSize: 11,
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  fallbackButton: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  fallbackButtonText: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
  loadingPillWrap: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 30,
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 500,
  },
  loadingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(7,26,16,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.35)',
  },
  loadingPillText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
});

type RootBoundaryState = { error: Error | null };

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootBoundaryState> {
  state: RootBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): RootBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[RootErrorBoundary] Render error:', error?.message, error?.stack);
    console.error('[RootErrorBoundary] Component stack:', info?.componentStack);
  }

  private handleReload = async () => {
    try {
      const Updates = await import('expo-updates' as any).catch(() => null);
      if (Updates?.reloadAsync) {
        await Updates.reloadAsync();
        return;
      }
    } catch (error) {
      console.log('[RootErrorBoundary] Reload failed:', error);
    }
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <View style={styles.fallbackRoot}>
          <Text style={styles.fallbackTitle}>Произошла ошибка</Text>
          <Text style={styles.fallbackText}>
            Приложение столкнулось с проблемой и было остановлено для безопасности.
          </Text>
          {this.state.error ? (
            <Text style={styles.fallbackDetail} selectable>
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack.split('\n').slice(0, 6).join('\n')}` : ''}
            </Text>
          ) : null}
          <TouchableOpacity style={styles.fallbackButton} onPress={() => void this.handleReload()}>
            <Text style={styles.fallbackButtonText}>Перезагрузить</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function BiometricGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { biometricEnabled, biometricAvailable, isReady: biometricReady, authenticateWithBiometric, biometricLabel } = useBiometric();
  const { loginDirect } = useAuth();
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!biometricReady) return;
    if (!isAuthenticated || !biometricEnabled || !biometricAvailable) {
      setChecking(false);
      setVerified(true);
      return;
    }
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    void (async () => {
      try {
        if (__DEV__) console.log('[BiometricGate] Prompting biometric for returning user');
        const session = await authenticateWithBiometric();
        if (session) {
          await loginDirect(session);
          if (__DEV__) console.log('[BiometricGate] Biometric re-auth success');
        } else {

        }
      } catch (err) {
        if (__DEV__) console.log('[BiometricGate] Biometric error:', err);
      } finally {
        setVerified(true);
        setChecking(false);
      }
    })();
  }, [biometricReady, isAuthenticated, biometricEnabled, biometricAvailable, authenticateWithBiometric, loginDirect]);

  if (checking && isAuthenticated && biometricEnabled && biometricReady) {
    return <View style={styles.root} />;
  }

  return <>{children}</>;
}

function LoadingPill() {
  return (
    <View style={styles.loadingPillWrap} pointerEvents="none">
      <View style={styles.loadingPill}>
        <MiniSpinner />
        <Text style={styles.loadingPillText}>Загружаемся…</Text>
      </View>
    </View>
  );
}

function MiniSpinner() {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(rot, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    anim.start();
    return () => anim.stop();
  }, [rot]);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.25)',
        borderTopColor: Colors.primary,
        transform: [{ rotate: spin }],
      }}
    />
  );
}

function SplashGate({ children }: { children: React.ReactNode }) {
  const { isLoading: authLoading, isAuthenticated, tokenReady } = useAuth();
  const { isReady: biometricReady, biometricEnabled, biometricAvailable } = useBiometric();
  const [animationFinished, setAnimationFinished] = useState<boolean>(false);
  const [showSplash, setShowSplash] = useState<boolean>(true);

  const handleAnimationFinish = useCallback(() => {
    setAnimationFinished(true);
  }, []);

  const willPromptBiometric = isAuthenticated && biometricEnabled && biometricAvailable;
  const appReady = tokenReady && !authLoading && biometricReady && !willPromptBiometric;

  useEffect(() => {
    if (!showSplash) return;
    if (animationFinished && appReady) {
      setShowSplash(false);
      return;
    }
    if (animationFinished && !appReady) {
      const fallback = setTimeout(() => {
        console.log('[SplashGate] Fallback hide splash after timeout');
        setShowSplash(false);
      }, 3500);
      return () => clearTimeout(fallback);
    }
  }, [animationFinished, appReady, showSplash]);

  return (
    <>
      {children}
      {showSplash && <AnimatedSplash onFinish={handleAnimationFinish} />}
      {!showSplash && authLoading && <LoadingPill />}
    </>
  );
}

export default function RootLayout() {


  useEffect(() => {

    SplashScreen.preventAutoHideAsync().catch((error) => {
      if (__DEV__) console.log('[RootLayout] preventAutoHideAsync error:', error);
    });
    SplashScreen.hideAsync().catch((error) => {
      if (__DEV__) console.log('[RootLayout] hideAsync error:', error);
    });
  }, []);

  if (!hasApiBaseUrl()) {
    return (
      <View style={styles.fallbackRoot}>
        <Text style={styles.fallbackTitle}>Ошибка конфигурации</Text>
        <Text style={styles.fallbackText}>
          API_BASE_URL не настроен. Укажите `expo.extra.apiBaseUrl` в `app.json` или переменную окружения сборки.
        </Text>
      </View>
    );
  }

  return (
    <RootErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={styles.root}>
            <AuthProvider>
              <BiometricProvider>
                <SplashGate>
                  <BiometricGate>
                    {/* splash held until auth + biometric ready */}
                    <RequestsProvider>
                      <NotificationsProvider>
                        <ChatProvider>
                          <RootLayoutNav />
                        </ChatProvider>
                      </NotificationsProvider>
                    </RequestsProvider>
                    </BiometricGate>
                </SplashGate>
              </BiometricProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </trpc.Provider>
    </RootErrorBoundary>
  );
}
