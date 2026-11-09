import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { cn } from './cn';
import { Icon } from './icon';
import { Text } from './text';

type Toast = { id: number; kind: 'success' | 'error'; message: string };

const useToasts = create<{ current: Toast | null }>(() => ({ current: null }));
let seq = 0;

function show(kind: Toast['kind'], message: string) {
  void Haptics.notificationAsync(
    kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
  );
  useToasts.setState({ current: { id: ++seq, kind, message } });
}

/** Short confirmation under the status bar (the app's `appToast`). */
export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
};

export function Toaster() {
  const insets = useSafeAreaInsets();
  const current = useToasts((s) => s.current);
  useEffect(() => {
    if (!current) return;
    const id = setTimeout(
      () => useToasts.setState((s) => (s.current?.id === current.id ? { current: null } : s)),
      2600,
    );
    return () => clearTimeout(id);
  }, [current]);
  if (!current) return null;
  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp}
      exiting={FadeOutUp}
      pointerEvents="none"
      className="absolute inset-x-4"
      style={{ top: insets.top + 8 }}>
      <View
        accessibilityLiveRegion="polite"
        className={cn(
          'flex-row items-center gap-2 rounded-xl border bg-card px-4 py-3',
          current.kind === 'error' ? 'border-destructive' : 'border-border',
        )}
        style={{ borderCurve: 'continuous', boxShadow: '0 6px 20px rgba(2, 6, 24, 0.14)' }}>
        <Icon
          name={current.kind === 'error' ? 'error' : 'check'}
          tone={current.kind === 'error' ? 'destructive' : 'success'}
          size={18}
        />
        <Text variant="callout" className="flex-1 font-sans-medium">
          {current.message}
        </Text>
      </View>
    </Animated.View>
  );
}
