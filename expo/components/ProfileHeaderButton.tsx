import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Image } from '@/components/MImage';
import { isSafeImageUri } from '@/lib/is-safe-image-uri';
import { useRouter } from 'expo-router';
import { User } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/providers/AuthProvider';

export default function ProfileHeaderButton() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <TouchableOpacity
      onPress={() => {
        console.log('[Navigation Error]', 'ProfileHeaderButton → profile', {
          userId: user?.id ?? null,
          hasUser: !!user,
        });
        router.push('/(tabs)/profile');
      }}
      style={styles.button}
      activeOpacity={0.7}
      testID="profile-header-button"
    >
      {user?.avatar && isSafeImageUri(user.avatar) ? (
        <Image
          source={{ uri: user.avatar }}
          style={styles.avatar}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      ) : (
        <View style={styles.fallback}>
          <User size={16} color={Colors.white} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 0,
    marginRight: 4,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  fallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(110,231,163,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(110,231,163,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
