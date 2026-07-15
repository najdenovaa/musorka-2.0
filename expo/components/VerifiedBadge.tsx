import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface VerifiedBadgeProps {
  size?: 'small' | 'medium' | 'large';
}

export default React.memo(function VerifiedBadge({ size = 'small' }: VerifiedBadgeProps) {
  const sizeConfig = {
    small: { width: 16, height: 16, fontSize: 10, borderRadius: 4 },
    medium: { width: 20, height: 20, fontSize: 12, borderRadius: 5 },
    large: { width: 24, height: 24, fontSize: 14, borderRadius: 6 },
  };

  const config = sizeConfig[size];

  return (
    <View
      style={[
        styles.badge,
        {
          width: config.width,
          height: config.height,
          borderRadius: config.borderRadius,
        },
      ]}
      testID="verified-badge"
    >
      <Text
        style={[
          styles.letter,
          { fontSize: config.fontSize },
        ]}
      >
        М
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  badge: {
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 3,
  },
  letter: {
    color: '#FFFFFF',
    fontWeight: '900' as const,
    lineHeight: 16,
  },
});
