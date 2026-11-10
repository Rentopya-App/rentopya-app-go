import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, View } from 'react-native';

import type { components } from '@/core/api/schema';
import { Can, Permission } from '@/core/auth/permissions';
import { DEFAULT_TIME_ZONE, formatRelative, formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { QueryState } from '@/ui/query-state';
import { SectionHeader } from '@/ui/list';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { type InboxFilter, useInbox, useMarkAllRead, useMarkRead, useUnreadCount } from './api';
import { groupNotifications } from './grouping';
import { panelTarget } from './links';
import { openPanelLink } from './open-link';

type Notification = components['schemas']['Notification'];

function Row({ n, first, last, onPress }: { n: Notification; first: boolean; last: boolean; onPress: () => void }) {
  const { t } = useTranslation('notifications');
  const unread = !n.read_at;
  const [open, setOpen] = useState(false);
  const target = n.action_url ? panelTarget(n.action_url) : null;
  const linked = !!n.action_url;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: linked ? undefined : open }}
      onPress={() => {
        if (!linked) setOpen((v) => !v);
        onPress();
      }}
      className={cn(
        'flex-row gap-3 border-x border-border bg-card px-4 py-3 active:bg-muted',
        first && 'rounded-t-lg border-t',
        last ? 'rounded-b-lg border-b' : 'border-b',
      )}>
      <View className={cn('mt-1.5 size-2 rounded-full', unread ? 'bg-primary' : 'bg-transparent')} />
      <View className="flex-1 gap-0.5">
        <Text className={unread ? 'font-sans-semibold' : undefined} numberOfLines={open ? undefined : 2}>
          {n.title}
        </Text>
        {n.body ? (
          <Text variant="callout" tone="muted" numberOfLines={open ? undefined : 3}>
            {n.body}
          </Text>
        ) : null}
        <Text variant="footnote" tone="muted">
          {formatRelative(n.created_at)} · {formatShort(n.created_at)}
          {linked && !target?.route ? ` · ${t('open_in_panel')}` : ''}
        </Text>
      </View>
      {linked ? <Icon name={target?.route ? 'forward' : 'externalLink'} tone="muted-foreground" size={16} /> : null}
    </Pressable>
  );
}

/**
 * Notification center of the company panel: grouped by day, unread first
 * marked, pull to refresh, endless scroll. Tapping one marks it read and
 * opens its record (app screen, or the panel page); "mark all read" in the
 * header.
 */
export function NotificationCenterScreen() {
  const { t } = useTranslation('notifications');
  const [filter, setFilter] = useState<InboxFilter>('all');
  const list = useInbox(filter);
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  // "Today" is the day of the last fetch, so the sections follow the clock on each refresh.
  const fetchedAt = list.dataUpdatedAt;
  const sections = useMemo(() => groupNotifications(items, fetchedAt, DEFAULT_TIME_ZONE), [items, fetchedAt]);

  const tap = (n: Notification) => {
    if (!n.read_at) markRead.mutate(n.uuid);
    if (n.action_url) openPanelLink(n.action_url);
  };

  const readAll = () =>
    markAll.mutate(undefined, {
      onSuccess: () => toast.success(t('read_all_done')),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });

  const header = (
    <View className="gap-3 pb-1">
      <Chips<InboxFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: t('filter_all') },
          {
            value: 'unread',
            label: unread.data ? t('filter_unread_count', { count: unread.data }) : t('filter_unread'),
          },
        ]}
      />
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () =>
            unread.data ? <HeaderButton icon="check" label={t('read_all')} onPress={readAll} /> : null,
        }}
      />
      <Can perm={Permission.NotificationsRead} fallback={<EmptyState icon="bell" title={t('common:forbidden')} />}>
        <SectionList
          sections={sections}
          keyExtractor={(n) => n.uuid}
          stickySectionHeadersEnabled={false}
          contentInsetAdjustmentBehavior="automatic"
          className="flex-1 bg-background"
          contentContainerClassName="px-4 pb-10 pt-2"
          ListHeaderComponent={header}
          renderSectionHeader={({ section }) => <SectionHeader title={t(`group.${section.group}`)} />}
          renderItem={({ item, index, section }) => (
            <Row n={item} first={index === 0} last={index === section.data.length - 1} onPress={() => tap(item)} />
          )}
          ListEmptyComponent={
            list.data ? (
              <EmptyState
                icon="bell"
                title={filter === 'unread' ? t('empty_unread_title') : t('empty_title')}
                body={t('empty_body')}
              />
            ) : (
              <QueryState query={list}>{() => null}</QueryState>
            )
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
          }}
          ListFooterComponent={list.isFetchingNextPage ? <ActivityIndicator className="py-4" /> : undefined}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching && !list.isFetchingNextPage}
              onRefresh={() => {
                void list.refetch();
                void unread.refetch();
              }}
            />
          }
        />
      </Can>
    </>
  );
}
