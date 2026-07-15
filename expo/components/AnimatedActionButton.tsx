import React from 'react';
import { Animated, StyleProp, StyleSheet, Text, TextStyle, TouchableWithoutFeedback, View, ViewStyle, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import MLoader from '@/components/MLoader';

interface AnimatedActionButtonProps {
  label: string;
  onPress: () => void;
  icon?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

export default React.memo(function AnimatedActionButton({
  label,
  onPress,
  icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
  textStyle,
  testID,
}: AnimatedActionButtonProps) {
  const isDisabled = disabled || loading;
  const scale = React.useRef(new Animated.Value(1)).current;

  const animateTo = React.useCallback((toValue: number) => {
    Animated.spring(scale, {
      toValue,
      useNativeDriver: Platform.OS !== 'web',
      speed: 20,
      bounciness: 8,
    }).start();
  }, [scale]);

  const handlePressIn = React.useCallback(() => {
    animateTo(0.96);
  }, [animateTo]);

  const handlePressOut = React.useCallback(() => {
    animateTo(1);
  }, [animateTo]);

  const handlePress = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch((error) => {
      console.log('[AnimatedActionButton] Haptics error:', error);
    });
    onPress();
  }, [onPress]);

  const containerStyles = React.useMemo(() => {
    if (variant === 'secondary') {
      return [styles.base, styles.secondary, isDisabled && styles.disabled, style];
    }
    if (variant === 'ghost') {
      return [styles.base, styles.ghost, isDisabled && styles.disabled, style];
    }
    if (variant === 'danger') {
      return [styles.base, styles.danger, isDisabled && styles.disabled, style];
    }
    return [styles.base, styles.primary, isDisabled && styles.disabled, style];
  }, [isDisabled, style, variant]);

  const labelStyles = React.useMemo(() => {
    if (variant === 'secondary' || variant === 'ghost') {
      return [styles.labelDark, textStyle];
    }
    return [styles.labelLight, textStyle];
  }, [textStyle, variant]);

  const loaderColor = (variant === 'secondary' || variant === 'ghost') ? Colors.text : Colors.white;

  return (
    <TouchableWithoutFeedback
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isDisabled}
      testID={testID}
    >
      <Animated.View style={[containerStyles, { transform: [{ scale }] }]}>
        {loading ? (
          <MLoader size="small" color={loaderColor} />
        ) : (
          <>
            {icon ? <View style={styles.iconWrap}>{icon}</View> : null}
            <Text style={labelStyles}>{label}</Text>
          </>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
});

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 6,
  },
  primary: {
    backgroundColor: Colors.primary,
    borderWidth: 1.5,
    borderColor: 'rgba(200,225,210,0.55)',
  },
  secondary: {
    backgroundColor: Colors.cardSecondary,
    borderWidth: 1.5,
    borderColor: 'rgba(180,210,195,0.35)',
  },
  ghost: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(180,210,195,0.35)',
    shadowOpacity: 0,
    elevation: 0,
  },
  danger: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1.5,
    borderColor: 'rgba(200,130,130,0.45)',
  },
  disabled: {
    opacity: 0.55,
  },
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelLight: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  labelDark: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '800' as const,
  },
});
