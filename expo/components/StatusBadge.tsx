import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { RequestStatus } from '@/types';

const statusConfig: Record<RequestStatus, { label: string; color: string; bg: string; pulse: boolean }> = {
  new: { label: 'Новая', color: '#38BDF8', bg: 'rgba(56,189,248,0.12)', pulse: true },
  in_progress: { label: 'В работе', color: '#FBBF24', bg: 'rgba(251,191,36,0.12)', pulse: true },
  completed: { label: 'Выполнена', color: '#4ADE80', bg: 'rgba(74,222,128,0.12)', pulse: false },
  cancelled: { label: 'Отменена', color: '#F87171', bg: 'rgba(248,113,113,0.12)', pulse: false },
};

interface StatusBadgeProps {
  status: RequestStatus;
}

function PulsingDotInline({ color }: { color: string }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 2, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseOpacity, { toValue: 0, duration: 900, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(pulseOpacity, { toValue: 1, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseScale, pulseOpacity]);

  return (
    <View style={styles.dotContainer}>
      <Animated.View
        style={[
          styles.pulseRing,
          {
            backgroundColor: color,
            transform: [{ scale: pulseScale }],
            opacity: pulseOpacity,
          },
        ]}
      />
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

export default React.memo(function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      {config.pulse ? (
        <PulsingDotInline color={config.color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: config.color }]} />
      )}
      <Text style={[styles.text, { color: config.color }]}>{config.label}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  dotContainer: {
    width: 8,
    height: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
});
