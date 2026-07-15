import { Alert } from 'react-native';
import { router } from 'expo-router';

export function requireAuthOrPromptLogin(isAuthenticated: boolean, action?: string): boolean {
  if (isAuthenticated) return true;
  Alert.alert(
    'Требуется вход',
    action
      ? `Чтобы ${action}, необходимо войти в аккаунт или зарегистрироваться.`
      : 'Для этого действия необходимо войти в аккаунт или зарегистрироваться.',
    [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Войти',
        onPress: () => {
          try {
            router.push('/login');
          } catch (e) {
            console.log('[requireAuth] router.push error:', e);
          }
        },
      },
    ],
  );
  return false;
}
