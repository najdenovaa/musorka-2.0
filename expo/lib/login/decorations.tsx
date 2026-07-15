import React from "react";
import { Animated, Platform } from "react-native";

export function GlowOrb({
  color,
  size,
  x,
  y,
  delay,
}: {
  color: string;
  size: number;
  x: number;
  y: number;
  delay: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.6)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.6, duration: 2400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(scale, { toValue: 1.1, duration: 2800, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.2, duration: 2400, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(scale, { toValue: 0.7, duration: 2800, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, scale, delay]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

export function FloatingIcon({
  icon: Icon,
  delay,
  x,
  y,
  color,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  delay: number;
  x: number;
  y: number;
  color: string;
}) {
  const translateY = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const rotate = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.35, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(translateY, { toValue: -15, duration: 2800, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(rotate, { toValue: 1, duration: 4000, useNativeDriver: Platform.OS !== 'web' }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(rotate, { toValue: 0, duration: 0, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity, translateY, rotate, delay]);

  const spin = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "15deg"],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x,
        top: y,
        opacity,
        transform: [{ translateY }, { rotate: spin }],
      }}
    >
      <Icon size={18} color={color} />
    </Animated.View>
  );
}

export function StaggeredItem({
  children,
  index,
  baseDelay,
}: {
  children: React.ReactNode;
  index: number;
  baseDelay: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.sequence([
      Animated.delay(baseDelay + index * 100),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }),
        Animated.spring(translateY, { toValue: 0, tension: 80, friction: 12, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    ]).start();
  }, [opacity, translateY, index, baseDelay]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}
