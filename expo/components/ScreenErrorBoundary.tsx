import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import Colors from '@/constants/colors';

interface Props {
  children: React.ReactNode;
  screenName: string;
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

export default class ScreenErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[ScreenErrorBoundary:${this.props.screenName}] Render error:`,
      error?.message,
      error?.stack,
    );
    console.error(
      `[ScreenErrorBoundary:${this.props.screenName}] Component stack:`,
      info?.componentStack,
    );
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const err = this.state.error;
    if (err) {
      return (
        <ScrollView contentContainerStyle={styles.wrap} testID="screen-error-boundary">
          <Text style={styles.title}>Экран временно недоступен</Text>
          <Text style={styles.subtitle}>
            Произошла ошибка при отображении экрана «{this.props.screenName}». Это не валит остальное приложение.
          </Text>
          <View style={styles.box}>
            <Text style={styles.boxTitle}>Сообщение:</Text>
            <Text style={styles.code} selectable>
              {err.message || 'unknown'}
            </Text>
            {err.stack ? (
              <>
                <Text style={[styles.boxTitle, { marginTop: 10 }]}>Stack:</Text>
                <Text style={styles.code} selectable>
                  {err.stack.split('\n').slice(0, 12).join('\n')}
                </Text>
              </>
            ) : null}
          </View>
          <TouchableOpacity style={styles.btn} onPress={this.handleReset}>
            <Text style={styles.btnText}>Попробовать снова</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: {
    padding: 20,
    paddingTop: 80,
    gap: 12,
    backgroundColor: Colors.background,
    flexGrow: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800' as const,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  box: {
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderColor: 'rgba(239,68,68,0.35)',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  boxTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: '#B91C1C',
  },
  code: {
    fontSize: 11,
    color: '#7F1D1D',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 15,
  },
  btn: {
    alignSelf: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  btnText: {
    color: Colors.white,
    fontWeight: '700' as const,
  },
});
