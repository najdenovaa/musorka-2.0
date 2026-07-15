import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Platform } from 'react-native';

interface ShimmerEffectProps {
  width: number;
  height: number;
  borderRadius?: number;
}

export default React.memo(function ShimmerEffect({ width, height, borderRadius = 0 }: ShimmerEffectProps) {
  const translateX = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translateX, {
          toValue: width,
          duration: 2000,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.delay(1000),
        Animated.timing(translateX, {
          toValue: -width,
          duration: 0,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [translateX, width]);

  return (
    <View style={[styles.container, { width, height, borderRadius, overflow: 'hidden' }]} pointerEvents="none">
      <Animated.View
        style={[
          styles.shimmer,
          {
            width: width * 0.6,
            height,
            transform: [{ translateX }],
          },
        ]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  shimmer: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
});
