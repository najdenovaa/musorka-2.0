import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, RefreshControl, Platform } from 'react-native';

const M_COLOR = '#4ADE80';
const M_COLOR_GLOW = 'rgba(74, 222, 128, 0.25)';

function MRefreshIndicator({ visible }: { visible: boolean }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const letterY = useRef(new Animated.Value(0)).current;
  const containerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(containerOpacity, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
    } else {
      Animated.timing(containerOpacity, { toValue: 0, duration: 150, useNativeDriver: Platform.OS !== 'web' }).start();
    }
  }, [visible, containerOpacity]);

  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulse, { toValue: 0.45, duration: 600, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(glow, { toValue: 0, duration: 800, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    const bounceAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(letterY, { toValue: -2, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(letterY, { toValue: 2, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(letterY, { toValue: 0, duration: 300, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    pulseAnim.start();
    glowAnim.start();
    bounceAnim.start();
    return () => { pulseAnim.stop(); glowAnim.stop(); bounceAnim.stop(); };
  }, [pulse, glow, letterY]);

  const scale = pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.9, 1.1] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.55] });

  return (
    <Animated.View style={[styles.indicatorWrap, { opacity: containerOpacity }]} pointerEvents="none">
      <View style={styles.innerWrap}>
        <Animated.View
          style={[styles.glowCircle, { opacity: glowOpacity }]}
        />
        <Animated.View
          style={[styles.letterBox, { transform: [{ scale }, { translateY: letterY }] }]}
        >
          <Animated.Text style={[styles.letter, { opacity: pulse }]}>M</Animated.Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export function useMRefreshControl(refreshing: boolean, onRefresh: () => void) {
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="transparent"
      {...(Platform.OS === 'android' ? { colors: ['transparent'], progressBackgroundColor: 'transparent', backgroundColor: 'transparent' } : {})}
    />
  );

  const indicator = <MRefreshIndicator visible={refreshing} />;

  return { refreshControl, MRefreshIndicator: indicator };
}

const styles = StyleSheet.create({
  indicatorWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  innerWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative' as const,
  },
  glowCircle: {
    position: 'absolute' as const,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: M_COLOR_GLOW,
  },
  letterBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(74, 222, 128, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.18)',
  },
  letter: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: M_COLOR,
    letterSpacing: -1,
  },
});
