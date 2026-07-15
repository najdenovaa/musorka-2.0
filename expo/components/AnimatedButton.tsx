import React from 'react';
import { Animated, GestureResponderEvent, StyleProp, StyleSheet, Text, TouchableWithoutFeedback, ViewStyle, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface AnimatedButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  testID?: string;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
  leftIcon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default React.memo(function AnimatedButton({
  label,
  onPress,
  testID,
  disabled = false,
  variant = 'primary',
  leftIcon,
  style,
}: AnimatedButtonProps) {
  const scale = React.useRef(new Animated.Value(1)).current;

  const animateTo = React.useCallback((value: number) => {
    Animated.spring(scale, {
      toValue: value,
      useNativeDriver: Platform.OS !== 'web',
      speed: 30,
      bounciness: 6,
    }).start();
  }, [scale]);

  const handlePress = React.useCallback((event: GestureResponderEvent) => {
    if (disabled) {
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(event);
  }, [disabled, onPress]);

  return (
    <TouchableWithoutFeedback
      onPressIn={() => animateTo(0.96)}
      onPressOut={() => animateTo(1)}
      onPress={handlePress}
      disabled={disabled}
      testID={testID}
    >
      <Animated.View style={[styles.base, variant === 'secondary' ? styles.secondary : styles.primary, disabled && styles.disabled, style, { transform: [{ scale }] }]}>
        {leftIcon}
        <Text style={[styles.label, variant === 'secondary' ? styles.secondaryLabel : styles.primaryLabel]}>{label}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primary: {
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: 'rgba(200,225,210,0.55)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 4,
  },
  secondary: {
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: 'rgba(180,210,195,0.35)',
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    fontSize: 15,
    fontWeight: '800' as const,
  },
  primaryLabel: {
    color: Colors.white,
  },
  secondaryLabel: {
    color: Colors.text,
  },
});
