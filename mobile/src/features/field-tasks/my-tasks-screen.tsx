import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Can, Permission } from '@/core/auth/permissions';
import { displayTimeZone, formatShort, formatTime, localDate } from '@/core/format';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { DayNav } from '@/ui/day-nav';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useMyFieldTasks } from './api';
import {
  isLate,
  mineQuery,
  placeText,
  STATUS_FILTERS,
  STATUS_TONES,
  typeKey,
  type FieldTask,
  type StatusFilter,
} from './lib';

/** One task as a large touch row: time box, type, status, place, plate and contact. */
export function FieldTaskRow({ task, day }: { task: FieldTask; day: string }) {
  const { t } = useTranslation('field_tasks');
  const late = isLate(task);
  // A late task from an earlier day also shows its date.
  const otherDay = localDate(new Date(task.due_at)) !== day;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/field/my/${task.uuid}`)}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View
        className={cn(
          'w-16 items-center justify-center rounded-md border py-2',
          late ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-muted/50',
        )}>
        <Text variant="headline" tone={late ? 'danger' : 'default'} className="tabular-nums">
          {formatTime(task.due_at)}
        </Text>
        {otherDay ? (
          <Text variant="footnote" tone="muted" numberOfLines={2} className="text-center text-[11px]">
            {formatShort(task.due_at)}
          </Text>
        ) : null}
      </View>
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="callout" className="font-sans-semibold">
            {t(typeKey(task))}
          </Text>
          <StatusPill label={t(`statuses.${task.status}`)} tone={STATUS_TONES[task.status]} />
          {late ? <StatusPill label={t('late')} tone="problem" /> : null}
        </View>
        <Text variant="footnote" numberOfLines={2}>
          {placeText(task)}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[
            task.vehicle?.plate,
            task.reservation?.reference,
            task.flight_number,
            task.contact.name || task.contact.phone,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

/**
 * "Görevlerim": the member's own field tasks of a day (today by default, the
 * late ones included), open ones first; the panel's `/field` for the phone.
 */
export function MyFieldTasksScreen() {
  const { t } = useTranslation('field_tasks');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Can
        perm={Permission.TenantFieldTasksExecute}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <MyFieldTasksList />
      </Can>
    </>
  );
}

function MyFieldTasksList() {
  const { t } = useTranslation('field_tasks');
  const today = localDate(new Date());
  const [day, setDay] = useState(today);
  const [status, setStatus] = useState<StatusFilter>('live');
  const filters = useMemo(() => mineQuery(day, today, status, displayTimeZone()), [day, today, status]);
  const query = useMyFieldTasks(filters);
  return (
    <PagedList
      query={query}
      keyOf={(task) => task.uuid}
      empty={status === 'live' ? t('empty_live') : t('empty')}
      header={
        <>
          <DayNav day={day} onChange={setDay} />
          <Chips
            options={STATUS_FILTERS.map((s) => ({ value: s, label: t(`filter.${s}`) }))}
            value={status}
            onChange={setStatus}
          />
        </>
      }
      renderItem={(task) => <FieldTaskRow task={task} day={day} />}
    />
  );
}
