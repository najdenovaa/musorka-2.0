import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Image as ExpoImage, type ImageContentFit } from '@/components/MImage';

interface ZoomableImageProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ImageContentFit;
  maxScale?: number;
  minScale?: number;
  testID?: string;
  onSingleTap?: () => void;
}

function getDistance(touches: GestureResponderEvent['nativeEvent']['touches']): number {
  if (touches.length < 2) return 0;
  const [a, b] = touches;
  const dx = a.pageX - b.pageX;
  const dy = a.pageY - b.pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function getMidpoint(touches: GestureResponderEvent['nativeEvent']['touches']): { x: number; y: number } {
  if (touches.length < 2) return { x: 0, y: 0 };
  const [a, b] = touches;
  return { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
}

export default function ZoomableImage({
  uri,
  style,
  contentFit = 'contain',
  maxScale = 4,
  minScale = 1,
  testID,
  onSingleTap,
}: ZoomableImageProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const baseScale = useRef<number>(1);
  const baseDistance = useRef<number>(0);
  const baseTranslate = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTap = useRef<number>(0);
  const currentScale = useRef<number>(1);
  const currentTranslate = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isPinching = useRef<boolean>(false);

  const [layout, setLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const animateTo = (s: number, x: number, y: number) => {
    currentScale.current = s;
    currentTranslate.current = { x, y };
    Animated.parallel([
      Animated.spring(scale, { toValue: s, useNativeDriver: Platform.OS !== 'web', tension: 80, friction: 8 }),
      Animated.spring(translateX, { toValue: x, useNativeDriver: Platform.OS !== 'web', tension: 80, friction: 8 }),
      Animated.spring(translateY, { toValue: y, useNativeDriver: Platform.OS !== 'web', tension: 80, friction: 8 }),
    ]).start();
  };

  const clampTranslate = (s: number, x: number, y: number): { x: number; y: number } => {
    const w = layout.width;
    const h = layout.height;
    if (!w || !h) return { x, y };
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (e) => {
          return e.nativeEvent.touches.length >= 2 || currentScale.current > 1.01;
        },
        onMoveShouldSetPanResponder: (e: GestureResponderEvent, _gs: PanResponderGestureState) => {
          if (e.nativeEvent.touches.length >= 2) return true;
          if (currentScale.current > 1.01) return true;
          return false;
        },
        onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
        onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            isPinching.current = true;
            baseScale.current = currentScale.current;
            baseDistance.current = getDistance(touches);
            baseTranslate.current = { ...currentTranslate.current };
          } else {
            isPinching.current = false;
            baseTranslate.current = { ...currentTranslate.current };
          }
        },
        onPanResponderMove: (e, gs) => {
          const touches = e.nativeEvent.touches;
          if (touches.length >= 2) {
            const dist = getDistance(touches);
            if (!isPinching.current || baseDistance.current <= 0) {
              isPinching.current = true;
              baseScale.current = currentScale.current;
              baseDistance.current = dist;
              baseTranslate.current = { ...currentTranslate.current };
              return;
            }
            if (baseDistance.current > 0) {
              let next = baseScale.current * (dist / baseDistance.current);
              next = Math.max(minScale * 0.7, Math.min(maxScale * 1.2, next));
              scale.setValue(next);
              currentScale.current = next;
            }
            return;
          }
          if (isPinching.current) return;
          if (currentScale.current > 1.01) {
            const next = clampTranslate(
              currentScale.current,
              baseTranslate.current.x + gs.dx,
              baseTranslate.current.y + gs.dy
            );
            translateX.setValue(next.x);
            translateY.setValue(next.y);
            currentTranslate.current = next;
          }
        },
        onPanResponderRelease: (e, gs) => {
          if (isPinching.current) {
            isPinching.current = false;
            let s = currentScale.current;
            if (s < minScale) s = minScale;
            if (s > maxScale) s = maxScale;
            const clamped = clampTranslate(s, currentTranslate.current.x, currentTranslate.current.y);
            if (s <= 1.01) {
              animateTo(1, 0, 0);
            } else {
              animateTo(s, clamped.x, clamped.y);
            }
            return;
          }

          const isTap = Math.abs(gs.dx) < 6 && Math.abs(gs.dy) < 6;
          if (isTap) {
            const now = Date.now();
            if (now - lastTap.current < 280) {
              lastTap.current = 0;
              if (currentScale.current > 1.01) {
                animateTo(1, 0, 0);
              } else {
                animateTo(2, 0, 0);
              }
              return;
            }
            lastTap.current = now;
            if (onSingleTap) {
              setTimeout(() => {
                if (lastTap.current !== 0 && Date.now() - lastTap.current >= 280) {
                  onSingleTap();
                }
              }, 290);
            }
            return;
          }

          if (currentScale.current > 1.01) {
            const clamped = clampTranslate(
              currentScale.current,
              currentTranslate.current.x,
              currentTranslate.current.y
            );
            animateTo(currentScale.current, clamped.x, clamped.y);
          }
        },
        onPanResponderTerminate: () => {
          isPinching.current = false;
          if (currentScale.current <= 1.01) {
            animateTo(1, 0, 0);
          }
        },
      }),
    [layout.width, layout.height, maxScale, minScale, onSingleTap]
  );

  return (
    <View
      style={[styles.container, style]}
      onLayout={(e) => setLayout({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      {...panResponder.panHandlers}
      testID={testID}
    >
      <Animated.View
        style={{
          width: '100%',
          height: '100%',
          transform: [{ translateX }, { translateY }, { scale }],
        }}
      >
        <ExpoImage
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          cachePolicy="memory-disk"
          transition={Platform.OS === 'web' ? 0 : 100}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});
