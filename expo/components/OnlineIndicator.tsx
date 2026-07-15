import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Platform } from 'react-native';

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: number;
  borderColor?: string;
}

export default React.memo(function OnlineIndicator({ isOnline, size = 10, borderColor = '#0F2A1A' }: OnlineIndicatorProps) {
  const scale = useRef(new Animated.Value(isOnline ? 1 : 0)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.spring(scale, {
      toValue: isOnline ? 1 : 0,
      tension: 150,
      friction: 8,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [isOnline, scale]);

  useEffect(() => {
    if (!isOnline) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1.8, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseOpacity, { toValue: 0.6, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [isOnline, pulseScale, pulseOpacity]);

  if (!isOnline) return null;

  const half = size / 2;
  const border = Math.max(1.5, size * 0.2);

  return (
    <Animated.View style={[styles.container, { width: size + border * 2, height: size + border * 2, transform: [{ scale }] }]}>
      <Animated.View
        style={[
          styles.pulse,
          {
            width: size,
            height: size,
            borderRadius: half,
            backgroundColor: '#22C55E',
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      />
      <View
        style={[
          styles.dot,
          {
            width: size,
            height: size,
            borderRadius: half,
            borderWidth: border,
            borderColor,
          },
        ]}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
  },
  dot: {
    backgroundColor: '#22C55E',
  },
});
