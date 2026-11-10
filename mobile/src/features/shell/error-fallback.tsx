import type { ErrorBoundaryProps } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { i18n } from '@/core/i18n';
import { EmptyState } from '@/ui/empty-state';
import { Text } from '@/ui/text';

/**
 * Shown instead of a screen that threw while rendering. Without a boundary a
 * release build reports the error as fatal and iOS kills the app; the message
 * stays visible so a screenshot names the bug.
 */
export function ErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="flex-grow justify-center">
      <EmptyState
        icon="error"
        title={i18n.t('common:load_failed')}
        body={i18n.t('common:error_generic')}
        action={{ title: i18n.t('common:retry'), onPress: () => void retry(), icon: 'refresh' }}
      />
      <View className="px-8 pb-12">
        <Text variant="footnote" tone="muted" className="text-center" selectable>
          {error?.message || String(error)}
        </Text>
      </View>
    </ScrollView>
  );
}
