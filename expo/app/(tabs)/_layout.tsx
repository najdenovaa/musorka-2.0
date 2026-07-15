import { Tabs } from "expo-router";
import { Home, ClipboardList, Bell, MessageCircle, Shield, Heart } from "lucide-react-native";
import React, { useEffect, useRef, useMemo } from "react";
import { View, Text, StyleSheet, Animated, TouchableOpacity, Platform, PanResponder, Dimensions } from "react-native";
import FloatingHeader from '@/components/FloatingHeader';
import { BlurView } from "expo-blur";

const USE_BLUR = Platform.OS === 'ios';
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from "@/constants/metallic";
import { useAuth } from "@/providers/AuthProvider";
import { useTabBadgesStore } from "@/lib/stores/tab-badges";
import { useTabSwipeStore } from "@/lib/stores/tab-swipe";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LIVE_ENABLED } from "@/lib/feature-flags";

const SWIPE_THRESHOLD = 50 as const;
const VELOCITY_THRESHOLD = 0.3;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function ChatBadge({ count }: { count: number }) {
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (count > 0) {
      Animated.spring(scale, { toValue: 1, tension: 150, friction: 8, useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      Animated.timing(scale, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
    }
  }, [count, scale]);

  if (count <= 0) return null;
  return (
    <Animated.View style={[badgeStyles.badge, { transform: [{ scale }] }]}>
      <Text style={badgeStyles.text}>{count > 9 ? '9+' : count}</Text>
    </Animated.View>
  );
}

const badgeStyles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    backgroundColor: '#EF4444',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'rgba(8,26,16,0.9)',
  },
  text: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.white,
  },
});

interface SwipeNavigationState {
  visibleRoutes: any[];
  currentVisibleIdx: number;
  navigation: any;
  currentRouteName: string;
}

const swipeStateRef: { current: SwipeNavigationState | null } = { current: null };
const swipeOverlayRef: { current: { show: (dir: number, progress: number) => void; hide: () => void } | null } = { current: null };

interface FloatingTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const chatTotalUnread = useTabBadgesStore((s) => s.chatTotalUnread);
  const supportUnread = useTabBadgesStore((s) => s.supportUnread);
  const notifUnread = useTabBadgesStore((s) => s.notifUnread);
  void supportUnread;
  const { role } = useAuth();

  const showLiveTab = LIVE_ENABLED && (role === 'client' || role === 'executor');

  const visibleRoutes = useMemo(() => {
    return state.routes.filter((route: any) => {
      const { options } = descriptors[route.key];
      if (route.name === 'profile') return false;
      if (options.href === null) return false;
      if (route.name === 'admin' && role !== 'admin') return false;
      if (route.name === 'live' && !showLiveTab) return false;
      if (route.name === 'support' || route.name === 'support-chats') return false;
      return true;
    });
  }, [state.routes, descriptors, role, showLiveTab]);

  const visibleIndices = useMemo(() => {
    return visibleRoutes.map((route: any) => state.routes.indexOf(route));
  }, [visibleRoutes, state.routes]);

  const currentVisibleIdx = useMemo(() => {
    return visibleIndices.indexOf(state.index);
  }, [visibleIndices, state.index]);

  const currentRouteName = useMemo(() => {
    const route = state.routes[state.index];
    return route?.name ?? '';
  }, [state.routes, state.index]);

  useEffect(() => {
    swipeStateRef.current = { visibleRoutes, currentVisibleIdx, navigation, currentRouteName };
  }, [visibleRoutes, currentVisibleIdx, navigation, currentRouteName]);

  return (
    <View style={[tabBarStyles.outerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={tabBarStyles.tabRow}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          if (options.href === null) return null;
          if (route.name === 'profile') return null;
          if (route.name === 'admin' && role !== 'admin') return null;
          if (route.name === 'live' && !showLiveTab) return null;
          if (route.name === 'support' || route.name === 'support-chats') return null;

          const isFocused = state.index === index;
          const label = options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabItem
              key={route.key}
              label={label}
              isFocused={isFocused}
              onPress={onPress}
              routeName={route.name}
              unreadCount={route.name === 'chat' ? chatTotalUnread : route.name === 'notifications' ? notifUnread : 0}
            />
          );
        })}
      </View>
    </View>
  );
}

interface TabItemProps {
  label: string;
  isFocused: boolean;
  onPress: () => void;
  routeName: string;
  unreadCount: number;
}

function TabItem({ label, isFocused, onPress, routeName, unreadCount }: TabItemProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: isFocused ? 1.05 : 1, tension: 200, friction: 12, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [isFocused, scale]);

  const iconColor = isFocused ? '#6EE7A3' : Colors.tabBarInactive;
  const iconSize = 20;

  const renderIcon = () => {
    switch (routeName) {
      case '(home)':
        return <Home size={iconSize} color={iconColor} />;
      case 'requests':
        return <ClipboardList size={iconSize} color={iconColor} />;
      case 'chat':
        return (
          <View>
            <MessageCircle size={iconSize} color={iconColor} />
            <ChatBadge count={unreadCount} />
          </View>
        );
      case 'notifications':
        return (
          <View>
            <Bell size={iconSize} color={iconColor} />
            <ChatBadge count={unreadCount} />
          </View>
        );
      case 'admin':
        return <Shield size={iconSize} color={iconColor} />;
      case 'live':
        return (
          <Heart
            size={26}
            color="#0A1A12"
            fill={isFocused ? '#0A1A12' : 'transparent'}
            strokeWidth={2.4}
          />
        );
      default:
        return null;
    }
  };

  if (routeName === 'live') {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={tabBarStyles.liveTabOuter}
      >
        <Animated.View style={[tabBarStyles.liveTabBubble, isFocused && tabBarStyles.liveTabBubbleActive, { transform: [{ scale }] }]}>
          <View style={tabBarStyles.liveTabBubbleInner}>
            {renderIcon()}
          </View>
        </Animated.View>
        <Text style={[tabBarStyles.tabLabel, isFocused && tabBarStyles.tabLabelActive, tabBarStyles.liveTabLabel]}>Live</Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={tabBarStyles.tabItemOuter}
    >
      <View style={[tabBarStyles.tabItemContainer, isFocused && tabBarStyles.tabItemContainerActive]}>
        {USE_BLUR ? (
          <BlurView intensity={45} tint="dark" style={tabBarStyles.tabItemBlur} />
        ) : (
          <View style={tabBarStyles.tabItemWebBg} />
        )}
        {isFocused && <View style={tabBarStyles.tabItemActiveBg} />}
        <Animated.View style={[tabBarStyles.tabContent, { transform: [{ scale }] }]}>
          {renderIcon()}
          <Text style={[tabBarStyles.tabLabel, isFocused && tabBarStyles.tabLabelActive]}>{label}</Text>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

function SwipeOverlay() {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    swipeOverlayRef.current = {
      show: (dir: number, progress: number) => {
        const clampedProgress = Math.min(Math.max(progress, 0), 1);
        translateX.setValue(dir * SCREEN_WIDTH * (1 - clampedProgress * 0.15));
        opacity.setValue(clampedProgress * 0.4);
      },
      hide: () => {
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
        ]).start();
      },
    };
  }, [translateX, opacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        tabBarStyles.swipeOverlay,
        { opacity },
      ]}
    />
  );
}

function useSwipePanResponder() {
  const didNavigate = useRef(false);
  const feedbackLeft = useRef(new Animated.Value(0)).current;
  const feedbackRight = useRef(new Animated.Value(0)).current;
  const disabledRef = useRef<boolean>(useTabSwipeStore.getState().disabled);

  useEffect(() => {
    const unsub = useTabSwipeStore.subscribe((s) => {
      disabledRef.current = s.disabled;
    });
    return () => { unsub(); };
  }, []);

  const HORIZONTAL_THRESHOLD = Platform.OS === 'android' ? 35 : 25;
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onStartShouldSetPanResponderCapture: () => false,
    onMoveShouldSetPanResponder: (_, gs) => {
      if (disabledRef.current) return false;
      const absDx = Math.abs(gs.dx);
      const absDy = Math.abs(gs.dy);
      const isHorizontal = absDx > HORIZONTAL_THRESHOLD && absDx > absDy * 3;
      if (!isHorizontal) return false;
      const state = swipeStateRef.current;
      if (!state) return false;
      if (gs.dx > 0 && state.currentVisibleIdx > 0) return true;
      if (gs.dx < 0 && state.currentVisibleIdx < state.visibleRoutes.length - 1) return true;
      return false;
    },
    onMoveShouldSetPanResponderCapture: () => false,
    onPanResponderGrant: () => {
      didNavigate.current = false;
    },
    onPanResponderMove: (_, gs) => {
      const progress = Math.min(Math.abs(gs.dx) / (SCREEN_WIDTH * 0.35), 1);
      if (gs.dx > 0) {
        feedbackLeft.setValue(progress);
        feedbackRight.setValue(0);
      } else {
        feedbackRight.setValue(progress);
        feedbackLeft.setValue(0);
      }
      const dir = gs.dx > 0 ? -1 : 1;
      swipeOverlayRef.current?.show(dir, progress);
    },
    onPanResponderRelease: (_, gs) => {
      const state = swipeStateRef.current;

      Animated.parallel([
        Animated.spring(feedbackLeft, { toValue: 0, tension: 120, friction: 14, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(feedbackRight, { toValue: 0, tension: 120, friction: 14, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      swipeOverlayRef.current?.hide();

      if (!state || didNavigate.current) return;

      const shouldNavigate = Math.abs(gs.dx) > SWIPE_THRESHOLD || Math.abs(gs.vx) > VELOCITY_THRESHOLD;
      if (!shouldNavigate) return;

      if (gs.dx > 0) {
        const prevIdx = state.currentVisibleIdx - 1;
        if (prevIdx >= 0) {
          didNavigate.current = true;
          const route = state.visibleRoutes[prevIdx];
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          state.navigation.navigate(route.name, route.params);
        }
      } else if (gs.dx < 0) {
        const nextIdx = state.currentVisibleIdx + 1;
        if (nextIdx < state.visibleRoutes.length) {
          didNavigate.current = true;
          const route = state.visibleRoutes[nextIdx];
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          state.navigation.navigate(route.name, route.params);
        }
      }
    },
    onPanResponderTerminate: () => {
      Animated.parallel([
        Animated.spring(feedbackLeft, { toValue: 0, tension: 120, friction: 14, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(feedbackRight, { toValue: 0, tension: 120, friction: 14, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
      swipeOverlayRef.current?.hide();
    },
    onPanResponderTerminationRequest: () => true,
  }), [feedbackLeft, feedbackRight]);

  return { panResponder, feedbackLeft, feedbackRight };
}

const tabBarStyles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  tabRow: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 500,
    gap: 6,
    marginBottom: 4,
  },
  tabItemOuter: {
    flex: 1,
  },
  tabItemContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(170,205,190,0.3)',
    ...Platform.select({
      ios: {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
      },
      android: {
        elevation: 3,
      },
      default: {},
    }),
  },
  tabItemContainerActive: {
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: {
        shadowColor: 'rgba(110,231,163,0.4)',
        shadowOpacity: 0.6,
        shadowRadius: 8,
      },
      android: {
        elevation: 5,
      },
      default: {},
    }),
  },
  tabItemBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  tabItemWebBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,26,16,0.85)',
  },
  tabItemActiveBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(110,231,163,0.08)',
  },
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 2,
  },
  tabLabel: {
    fontSize: 9,
    fontWeight: '600' as const,
    color: Colors.tabBarInactive,
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#6EE7A3',
    fontWeight: '700' as const,
  },
  swipeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    zIndex: 5,
  },
  liveTabOuter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: -10,
  },
  liveTabBubble: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6EE7A3',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#6EE7A3',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.55,
        shadowRadius: 12,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  liveTabBubbleActive: {
    borderColor: '#FFFFFF',
    backgroundColor: '#7BF0AC',
  },
  liveTabBubbleInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveTabLabel: {
    marginTop: 8,
    color: '#6EE7A3',
    fontWeight: '700' as const,
  },
  swipeIndicator: {
    position: 'absolute',
    top: '30%',
    width: 4,
    height: '20%',
    borderRadius: 2,
    backgroundColor: 'rgba(110,231,163,0.6)',
    zIndex: 50,
  },
  indicatorLeft: {
    left: 2,
  },
  indicatorRight: {
    right: 2,
  },
});

export default function TabLayout() {
  const { role } = useAuth();

  const isAdmin = role === 'admin';
  const showAdminTab = isAdmin;

  const { panResponder, feedbackLeft, feedbackRight } = useSwipePanResponder();

  const leftIndicatorOpacity = feedbackLeft.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.5, 1],
  });
  const leftIndicatorScale = feedbackLeft.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });
  const rightIndicatorOpacity = feedbackRight.interpolate({
    inputRange: [0, 0.2, 1],
    outputRange: [0, 0.5, 1],
  });
  const rightIndicatorScale = feedbackRight.interpolate({
    inputRange: [0, 1],
    outputRange: [0.5, 1],
  });

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <SwipeOverlay />
      <Animated.View
        style={[
          tabBarStyles.swipeIndicator,
          tabBarStyles.indicatorLeft,
          { opacity: leftIndicatorOpacity, transform: [{ scaleY: leftIndicatorScale }] },
        ]}
        pointerEvents="none"
      />
      <Animated.View
        style={[
          tabBarStyles.swipeIndicator,
          tabBarStyles.indicatorRight,
          { opacity: rightIndicatorOpacity, transform: [{ scaleY: rightIndicatorScale }] },
        ]}
        pointerEvents="none"
      />
      <FloatingHeader />
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}
      >
        <Tabs.Screen
          name="(home)"
          options={{
            title: "Главная",
          }}
        />
        <Tabs.Screen
          name="requests"
          options={{
            title: "Заявки",
          }}
        />
        <Tabs.Screen
          name="live"
          options={{
            title: "Live",
            href: (LIVE_ENABLED && role !== 'admin' && role !== 'support') ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            title: "Уведы",
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: "Чаты",
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: "Админка",
            href: showAdminTab ? undefined : null,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Профиль',
          }}
        />
      </Tabs>
    </View>
  );
}
