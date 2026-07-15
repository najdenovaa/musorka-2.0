import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { Image } from '@/components/MImage';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

const { width, height } = Dimensions.get('window');

const SCENE_IMAGE = 'https://r2-pub.rork.com/generated-images/25d0055c-77ea-45e3-bcaa-94efa02f3ab2.png';

interface AnimatedSplashProps {
  onFinish: () => void;
}

export default function AnimatedSplash({ onFinish }: AnimatedSplashProps) {
  const sceneScale = useRef(new Animated.Value(1)).current;
  const sceneTranslateY = useRef(new Animated.Value(0)).current;

  const darkenOpacity = useRef(new Animated.Value(0)).current;

  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.08)).current;
  const titleTranslateY = useRef(new Animated.Value(60)).current;

  const glowOpacity = useRef(new Animated.Value(0)).current;

  const subtitleOpacity = useRef(new Animated.Value(0)).current;

  const finishedRef = useRef(false);

  const triggerHaptic = async (style: 'heavy' | 'medium' | 'light' = 'heavy') => {
    if (Platform.OS === 'web') return;
    try {
      const s =
        style === 'heavy'
          ? Haptics.ImpactFeedbackStyle.Heavy
          : style === 'medium'
            ? Haptics.ImpactFeedbackStyle.Medium
            : Haptics.ImpactFeedbackStyle.Light;
      await Haptics.impactAsync(s);
    } catch (e) {
      console.log('[AnimatedSplash] Haptic not available:', e);
    }
  };

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        console.log('[AnimatedSplash] Safety timeout triggered');
        onFinish();
      }
    }, 6000);

    void triggerHaptic('light');
    const hapticMid = setTimeout(() => { void triggerHaptic('medium'); }, 700);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(sceneScale, {
          toValue: 1.08,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(sceneTranslateY, {
          toValue: -10,
          duration: 1600,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(darkenOpacity, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),

      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 450,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          tension: 55,
          friction: 8,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 500,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    ]).start(() => {
      void triggerHaptic('heavy');

      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 320,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();

      Animated.timing(subtitleOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: Platform.OS !== 'web',
      }).start(() => {
        clearTimeout(safetyTimeout);
        clearTimeout(hapticMid);
        if (!finishedRef.current) {
          finishedRef.current = true;
          onFinish();
        }
      });
    });

    return () => {
      clearTimeout(safetyTimeout);
      clearTimeout(hapticMid);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={styles.container}>
      <Animated.View
        style={[
          styles.sceneWrap,
          {
            transform: [
              { scale: sceneScale },
              { translateY: sceneTranslateY },
            ],
          },
        ]}
      >
        <Image
          source={{ uri: SCENE_IMAGE }}
          style={styles.sceneImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={styles.sceneVignette} />
      </Animated.View>

      <Animated.View style={[styles.darkOverlay, { opacity: darkenOpacity }]} />

      <View style={styles.brandCenter}>
        <Animated.View style={[styles.glowRing, { opacity: glowOpacity }]} />

        <Animated.View
          style={[
            styles.titleRow,
            {
              opacity: titleOpacity,
              transform: [
                { scale: titleScale },
                { translateY: titleTranslateY },
              ],
            },
          ]}
        >
          <Text style={styles.letterM}>M</Text>
          <Text style={styles.restLetters}>USORKA</Text>
        </Animated.View>

        <Animated.View style={[styles.titleUnderline, { opacity: titleOpacity }]} />

        <Animated.Text style={[styles.tagline, { opacity: subtitleOpacity }]}>
          Бытовой помощник
        </Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 999,
  },
  sceneWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneImage: {
    width: '100%',
    height: '100%',
  },
  sceneVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 15, 8, 0.92)',
  },
  brandCenter: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glowRing: {
    position: 'absolute',
    width: width * 0.85,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 0 80px 40px rgba(34, 197, 94, 0.15)',
        }
      : {
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.4,
          shadowRadius: 60,
          elevation: 20,
        }),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  letterM: {
    fontSize: 58,
    fontWeight: '900' as const,
    color: '#22C55E',
    letterSpacing: -1,
    textShadowColor: 'rgba(34,197,94,0.6)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 25,
  },
  restLetters: {
    fontSize: 58,
    fontWeight: '900' as const,
    color: Colors.white,
    letterSpacing: 4,
    textShadowColor: 'rgba(255,255,255,0.2)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  titleUnderline: {
    width: width * 0.5,
    height: 2,
    backgroundColor: '#22C55E',
    marginTop: 8,
    borderRadius: 1,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 0 12px 3px rgba(34, 197, 94, 0.4)',
        }
      : {
          shadowColor: '#22C55E',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 8,
          elevation: 5,
        }),
  },
  tagline: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    letterSpacing: 4,
    textTransform: 'uppercase' as const,
  },
});
