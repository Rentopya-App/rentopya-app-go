import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { errorMessage } from '@/core/i18n';

import { EmptyState } from './empty-state';
import { Skeleton } from './skeleton';

/**
 * Cached data renders first; a skeleton shows only when there is nothing yet,
 * and an error replaces the content only when nothing was ever loaded.
 */
export function QueryState<T>({
  query,
  children,
  rows = 4,
}: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  rows?: number;
}) {
  const { t } = useTranslation();
  if (query.data !== undefined) return <>{children(query.data)}</>;
  if (query.isError) {
    const e = query.error;
    const offline = isApiError(e, 'NETWORK_ERROR');
    const forbidden = isApiError(e) && e.status === 403;
    return (
      <EmptyState
        icon={offline ? 'offline' : 'error'}
        title={offline ? t('offline_title') : t('load_failed')}
        body={
          offline ? t('offline_body') : forbidden ? t('forbidden') : errorMessage(isApiError(e) ? e.code : undefined)
        }
        action={forbidden ? undefined : { title: t('retry'), onPress: () => void query.refetch(), icon: 'refresh' }}
      />
    );
  }
  return (
    <View className="gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </View>
  );
}
