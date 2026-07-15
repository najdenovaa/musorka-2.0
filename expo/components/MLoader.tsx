import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Platform } from 'react-native';

interface MLoaderProps {
  size?: 'small' | 'large';
  color?: string;
  style?: object;
}

const M_COLOR = '#4ADE80';
const M_COLOR_GLOW = 'rgba(74, 222, 128, 0.25)';

export default React.memo(function MLoader({ size = 'large', color, style }: MLoaderProps) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const letterY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );

    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );

    const bounceAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(letterY, { toValue: -3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(letterY, { toValue: 3, duration: 500, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(letterY, { toValue: 0, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );

    pulseAnim.start();
    glowAnim.start();
    bounceAnim.start();

    return () => {
      pulseAnim.stop();
      glowAnim.stop();
      bounceAnim.stop();
    };
  }, [pulse, glow, letterY]);

  const isSmall = size === 'small';
  const boxSize = isSmall ? 22 : 48;
  const fontSize = isSmall ? 15 : 32;
  const glowSize = isSmall ? 34 : 68;
  const resolvedColor = color ?? M_COLOR;

  const scale = pulse.interpolate({
    inputRange: [0.45, 1],
    outputRange: [0.92, 1.08],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.55],
  });

  return (
    <View style={[styles.wrapper, style]} testID="m-loader">
      <Animated.View
        style={[
          styles.glowCircle,
          {
            width: glowSize,
            height: glowSize,
            borderRadius: glowSize / 2,
            backgroundColor: M_COLOR_GLOW,
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.letterBox,
          {
            width: boxSize,
            height: boxSize,
            borderRadius: isSmall ? 6 : 14,
            transform: [{ scale }, { translateY: letterY }],
          },
        ]}
      >
        <Animated.Text
          style={[
            styles.letter,
            {
              fontSize,
              color: resolvedColor,
              opacity: pulse,
            },
          ]}
        >
          M
        </Animated.Text>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  glowCircle: {
    position: 'absolute' as const,
  },
  letterBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.18)',
  },
  letter: {
    fontWeight: '900' as const,
    letterSpacing: -1,
  },
});
