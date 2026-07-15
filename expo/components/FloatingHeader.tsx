import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { BlurView } from 'expo-blur';

const USE_BLUR = Platform.OS === 'ios';
import { Image } from '@/components/MImage';
import { Star, User, ChevronLeft } from 'lucide-react-native';
import { useRouter, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { METALLIC_BORDER_COLOR_STRONG, METALLIC_SHADOW_COLOR } from '@/constants/metallic';
import { useAuth } from '@/providers/AuthProvider';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import VerifiedBadge from '@/components/VerifiedBadge';
import * as Haptics from 'expo-haptics';

export const FLOATING_HEADER_CONTENT_HEIGHT = 48;

export function useFloatingHeaderHeight() {
  const insets = useSafeAreaInsets();
  return insets.top + FLOATING_HEADER_CONTENT_HEIGHT + 8;
}

interface FloatingHeaderProps {
  showBack?: boolean;
  title?: string;
}

export default function FloatingHeader({ showBack = false, title }: FloatingHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { role, user, isAuthenticated } = useAuth();
  const isExecutor = role === 'executor';
  const firstName = user?.firstName || user?.name?.split(' ')?.[0] || '';
  const ratingVal = user?.rating ? Number(user.rating).toFixed(1) : null;

  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideDown = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, { toValue: 1, duration: 350, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(slideDown, { toValue: 0, tension: 120, friction: 14, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeIn, slideDown]);

  const handleLogoPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(tabs)/(home)');
  };

  const handleProfilePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    router.push('/(tabs)/profile');
  };

  const handleBackPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <Animated.View
      style={[
        styles.outerWrap,
        { paddingTop: insets.top, opacity: fadeIn, transform: [{ translateY: slideDown }] },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.row} pointerEvents="box-none">
        {showBack ? (
          <View style={styles.leftGroup}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBackPress}
              testID="floating-header-back"
            >
              <View style={styles.backIsland}>
                {USE_BLUR ? (
                  <BlurView intensity={60} tint="dark" style={styles.islandBlur} />
                ) : (
                  <View style={styles.islandWebBg} />
                )}
                <ChevronLeft size={20} color="#6EE7A3" />
              </View>
            </TouchableOpacity>
            {title ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleLogoPress}
                testID="floating-header-logo"
              >
                <View style={styles.titleIsland}>
                  {USE_BLUR ? (
                    <BlurView intensity={60} tint="dark" style={styles.islandBlur} />
                  ) : (
                    <View style={styles.islandWebBg} />
                  )}
                  <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleLogoPress}
                testID="floating-header-logo"
              >
                <View style={styles.islandWrap}>
                  {USE_BLUR ? (
                    <BlurView intensity={60} tint="dark" style={styles.islandBlur} />
                  ) : (
                    <View style={styles.islandWebBg} />
                  )}
                  <View style={styles.logoContent}>
                    <Text style={styles.letterM}>M</Text>
                    <Text style={styles.restLetters}>USORKA</Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleLogoPress}
            testID="floating-header-logo"
          >
            <View style={styles.islandWrap}>
              {USE_BLUR ? (
                <BlurView intensity={60} tint="dark" style={styles.islandBlur} />
              ) : (
                <View style={styles.islandWebBg} />
              )}
              <View style={styles.logoContent}>
                <Text style={styles.letterM}>M</Text>
                <Text style={styles.restLetters}>USORKA</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleProfilePress}
          testID="floating-header-profile"
        >
          <View style={styles.islandWrap}>
            {USE_BLUR ? (
              <BlurView intensity={60} tint="dark" style={styles.islandBlur} />
            ) : (
              <View style={styles.islandWebBg} />
            )}
            <View style={styles.profileContent}>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {isAuthenticated ? (firstName || (isExecutor ? 'Исполнитель' : 'Клиент')) : 'Войти'}
                </Text>
                {ratingVal ? (
                  <View style={styles.ratingBadge}>
                    <Star size={10} color="#FBBF24" fill="#FBBF24" />
                    <Text style={styles.ratingText}>{ratingVal}</Text>
                  </View>
                ) : null}
              </View>
              <View>
                {user?.avatar && isSafeImageUri(user.avatar) ? (
                  <Image
                    source={{ uri: user.avatar }}
                    style={styles.avatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={120}
                  />
                ) : (
                  <View style={styles.avatarFallback}>
                    <User size={15} color={Colors.white} />
                  </View>
                )}
                {user?.isFullyVerified ? (
                  <View style={styles.verifiedBadge}>
                    <VerifiedBadge size="small" />
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: FLOATING_HEADER_CONTENT_HEIGHT,
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  islandWrap: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    ...Platform.select({
      ios: {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  backIsland: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  titleIsland: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: METALLIC_BORDER_COLOR_STRONG,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: 180,
    ...Platform.select({
      ios: {
        shadowColor: METALLIC_SHADOW_COLOR,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
      default: {},
    }),
  },
  titleText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.white,
  },
  islandBlur: {
    ...StyleSheet.absoluteFillObject,
  },
  islandWebBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,26,16,0.92)',
  },
  logoContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  letterM: {
    fontSize: 19,
    fontWeight: '900' as const,
    color: '#22C55E',
  },
  restLetters: {
    fontSize: 19,
    fontWeight: '900' as const,
    color: Colors.white,
  },
  profileContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 5,
  },
  profileInfo: {
    alignItems: 'flex-end',
    maxWidth: 110,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.white,
    lineHeight: 17,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FBBF24',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: 'rgba(180,210,195,0.4)',
  },
  avatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(110,231,163,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(180,210,195,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: 'rgba(10,31,19,0.88)',
  },
});
