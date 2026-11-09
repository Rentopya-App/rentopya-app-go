import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn } from './cn';
import { EmptyState } from './empty-state';
import { riseIn } from './motion';
import { QueryState } from './query-state';

type Page<T> = { items: T[]; total: number; offset: number; limit: number };

/** Offset-paged API list (`items/total/limit/offset`) with pull-to-refresh and endless scroll. */
export function PagedList<T>({
  query,
  header,
  renderItem,
  keyOf,
  empty,
}: {
  query: UseInfiniteQueryResult<{ pages: Page<T>[] }>;
  header: ReactElement;
  renderItem: (item: T, index: number, last: boolean) => ReactElement;
  keyOf: (item: T) => string;
  empty: string;
}) {
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <FlatList
      data={query.data ? items : []}
      keyExtractor={keyOf}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pb-10 pt-2"
      ListHeaderComponent={<View className="gap-3 pb-3">{header}</View>}
      renderItem={({ item, index }) => {
        const last = index === items.length - 1;
        // Rows read as one grouped card: rounded top on the first, bottom on the last.
        // The first screenful rises in row by row; later pages just appear.
        return (
          <Animated.View
            entering={index < 12 ? riseIn(index, 8) : undefined}
            className={cn(
              'overflow-hidden border-x border-border bg-card',
              index === 0 && 'rounded-t-lg border-t',
              last && 'rounded-b-lg border-b',
            )}>
            {renderItem(item, index, last)}
          </Animated.View>
        );
      }}
      ListEmptyComponent={
        query.data ? <EmptyState icon="inbox" title={empty} /> : <QueryState query={query}>{() => null}</QueryState>
      }
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : undefined}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => void query.refetch()}
        />
      }
    />
  );
}

export const PAGE_SIZE = 30;

/** `getNextPageParam` for offset pages. */
export function nextOffset<T>(last: Page<T>) {
  const next = last.offset + last.items.length;
  return next < last.total ? next : undefined;
}
