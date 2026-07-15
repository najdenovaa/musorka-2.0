import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Animated, PanResponder, Dimensions, Platform } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface SwipeToAcceptProps {
  onAccept: () => void;
  label?: string;
  testID?: string;
}

const THUMB_SIZE = 60;
const TRACK_PADDING = 4;
const ACTIVATION_THRESHOLD = 0.65;

export default React.memo(function SwipeToAccept({
  onAccept,
  label = 'Свайп — принять заявку',
  testID,
}: SwipeToAcceptProps) {
  const trackWidth = Dimensions.get('window').width - 64;
  const maxTranslate = trackWidth - THUMB_SIZE - TRACK_PADDING * 2;
  const pan = useRef(new Animated.Value(0)).current;
  const accepted = useRef(false);
  const lastHapticThreshold = useRef(0);

  const handleAccept = useCallback(() => {
    onAccept();
  }, [onAccept]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 5,
      onPanResponderGrant: () => {
        if (accepted.current) return;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        lastHapticThreshold.current = 0;
      },
      onPanResponderMove: (_, gestureState) => {
        if (accepted.current) return;
        const nextValue = Math.max(0, Math.min(gestureState.dx, maxTranslate));
        pan.setValue(nextValue);

        const progress = nextValue / maxTranslate;
        const thresholdStep = Math.floor(progress * 4);
        if (thresholdStep > lastHapticThreshold.current) {
          lastHapticThreshold.current = thresholdStep;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (accepted.current) return;

        const progress = Math.max(0, gestureState.dx) / maxTranslate;

        if (progress >= ACTIVATION_THRESHOLD) {
          accepted.current = true;
          Animated.spring(pan, {
            toValue: maxTranslate,
            useNativeDriver: Platform.OS !== 'web',
            tension: 60,
            friction: 10,
          }).start(() => {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            handleAccept();
            setTimeout(() => {
              accepted.current = false;
              lastHapticThreshold.current = 0;
              Animated.spring(pan, {
                toValue: 0,
                useNativeDriver: Platform.OS !== 'web',
                tension: 50,
                friction: 12,
              }).start();
            }, 800);
          });
        } else {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
            tension: 80,
            friction: 10,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!accepted.current) {
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: Platform.OS !== 'web',
            tension: 80,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  const progressWidth = pan.interpolate({
    inputRange: [0, maxTranslate],
    outputRange: [THUMB_SIZE + TRACK_PADDING * 2, trackWidth],
    extrapolate: 'clamp',
  });

  const progressOpacity = pan.interpolate({
    inputRange: [0, maxTranslate * 0.3, maxTranslate],
    outputRange: [0, 0.15, 0.4],
    extrapolate: 'clamp',
  });

  const labelOpacity = pan.interpolate({
    inputRange: [0, maxTranslate * 0.35],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const chevronPulse = pan.interpolate({
    inputRange: [0, maxTranslate * 0.5, maxTranslate],
    outputRange: [1, 1.1, 1.2],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.track, { width: trackWidth }]} testID={testID}>
      <Animated.View
        style={[
          styles.progressFill,
          {
            opacity: progressOpacity,
            width: progressWidth,
          },
        ]}
      />
      <Animated.Text style={[styles.label, { opacity: labelOpacity }]}>{label}</Animated.Text>
      <Animated.View
        style={[
          styles.thumb,
          {
            transform: [
              { translateX: pan },
              { scale: chevronPulse },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <View style={styles.thumbInner}>
          <ChevronRight size={26} color={Colors.white} />
        </View>
      </Animated.View>
      <View style={styles.arrowHints}>
        <Text style={styles.arrowHint}>›</Text>
        <Text style={[styles.arrowHint, styles.arrowHint2]}>›</Text>
        <Text style={[styles.arrowHint, styles.arrowHint3]}>›</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  track: {
    height: THUMB_SIZE + TRACK_PADDING * 2,
    borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2,
    backgroundColor: '#143723',
    borderWidth: 1.5,
    borderColor: '#1E5C38',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: Colors.success,
    borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2,
  },
  label: {
    position: 'absolute',
    left: THUMB_SIZE + TRACK_PADDING + 16,
    right: 16,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.textSecondary,
    letterSpacing: 0.3,
  },
  thumb: {
    position: 'absolute',
    left: TRACK_PADDING,
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  thumbInner: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  arrowHints: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  arrowHint: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.12)',
    fontWeight: '700' as const,
  },
  arrowHint2: {
    color: 'rgba(255,255,255,0.08)',
  },
  arrowHint3: {
    color: 'rgba(255,255,255,0.04)',
  },
});
