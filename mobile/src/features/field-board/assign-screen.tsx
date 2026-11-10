import { useQueries } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { Can, Permission } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { personName, typeKey, type FieldTask } from '@/features/field-tasks/lib';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { assignErrorText, useAssignTask, useBulkAssign, useFieldTaskAssignees } from './api';
import { assigneesForAll, parseUuids, type FieldTaskAssignee } from './lib';

const NOBODY = '__nobody__';

/**
 * Assign (or unassign) one task (`POST …/{uuid}/assign`) or several picked
 * on the board (bulk `assign`) to a member who works field tasks and covers
 * their branches. `?uuids=a,b`.
 */
export function AssignScreen() {
  const { uuids } = useLocalSearchParams<{ uuids?: string }>();
  const { t } = useTranslation(['transfers_app', 'field_tasks']);
  const ids = useMemo(() => parseUuids(uuids), [uuids]);
  return (
    <>
      <Stack.Screen
        options={{ title: ids.length > 1 ? t('assign.bulk_title', { count: ids.length }) : t('assign.title') }}
      />
      <Can
        perm={Permission.TenantFieldTasksAssign}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('field_tasks:forbidden')} />}>
        {ids.length === 0 ? <EmptyState icon="inbox" title={t('assign.none_picked')} /> : <Loader ids={ids} />}
      </Can>
    </>
  );
}

/** Loads the picked tasks (their branches decide who may take them) and the members. */
function Loader({ ids }: { ids: string[] }) {
  const org = useSession((s) => s.organization?.slug);
  const tasks = useQueries({
    queries: ids.map((uuid) => ({
      queryKey: ['field-task', org, uuid],
      enabled: !!org,
      queryFn: () =>
        unwrap(api.GET('/v1/tenant/field-tasks/{uuid}', { params: { header: orgHeader(), path: { uuid } } })),
    })),
  });
  const people = useFieldTaskAssignees();
  const loaded = tasks.map((q) => q.data).filter((x): x is FieldTask => !!x);
  if (loaded.length < ids.length && tasks.some((q) => q.isPending)) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </View>
    );
  }
  return (
    <View className="flex-1 bg-background">
      <QueryState query={people}>{(items) => <AssignForm tasks={loaded} people={items} />}</QueryState>
    </View>
  );
}

function AssignForm({ tasks, people }: { tasks: FieldTask[]; people: FieldTaskAssignee[] }) {
  const { t } = useTranslation(['transfers_app', 'field_tasks']);
  const single = tasks.length === 1 ? tasks[0] : null;
  const [pick, setPick] = useState<string>(single?.assignee?.uuid ?? NOBODY);
  const [q, setQ] = useState('');
  const one = useAssignTask();
  const bulk = useBulkAssign();
  const pending = one.isPending || bulk.isPending;
  const eligible = useMemo(() => assigneesForAll(people, tasks), [people, tasks]);
  const shown = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return needle
      ? eligible.filter((p) => `${personName(p)} ${p.email}`.toLocaleLowerCase().includes(needle))
      : eligible;
  }, [eligible, q]);
  const user = pick === NOBODY ? null : pick;

  const submit = () => {
    if (single) {
      one.mutate(
        { uuid: single.uuid, user },
        {
          onSuccess: () => {
            toast.success(user ? t('assign.done') : t('assign.cleared'));
            router.back();
          },
          onError: (e) => toast.error(assignErrorText(e)),
        },
      );
      return;
    }
    bulk.mutate(
      { uuids: tasks.map((x) => x.uuid), user },
      {
        onSuccess: (r) => {
          if (r.kind === 'queued') toast.success(t('assign.queued'));
          else if (r.failed > 0) toast.error(t('assign.partial', { succeeded: r.succeeded, failed: r.failed }));
          else toast.success(t('assign.bulk_done', { count: r.succeeded }));
          router.back();
        },
        onError: (e) => toast.error(assignErrorText(e)),
      },
    );
  };

  const option = (value: string, title: string, subtitle: string | null, last: boolean) => (
    <Pressable
      key={value}
      accessibilityRole="radio"
      accessibilityState={{ checked: pick === value }}
      onPress={() => setPick(value)}
      className={cn(
        'min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-muted',
        !last && 'border-b border-border',
      )}>
      <Icon name={value === NOBODY ? 'remove' : 'user'} tone="primary" size={20} />
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {pick === value ? <Icon name="check" tone="primary" size={18} /> : null}
    </Pressable>
  );

  return (
    <FormScreen footer={<Button size="lg" icon="user" title={t('board.assign')} loading={pending} onPress={submit} />}>
      <Text tone="muted">
        {single
          ? `${t(`field_tasks:${typeKey(single)}`)} · ${single.branch.code}${single.vehicle ? ` · ${single.vehicle.plate}` : ''}`
          : t('assign.bulk_description', { count: tasks.length })}
      </Text>
      <Text variant="footnote" tone="muted">
        {t('assign.hint')}
      </Text>
      {eligible.length > 8 ? <SearchField value={q} onChangeText={setQ} placeholder={t('common:search')} /> : null}
      <View className="overflow-hidden rounded-lg border border-border bg-card">
        {option(NOBODY, t('assign.nobody'), null, shown.length === 0)}
        {shown.map((p, i) => option(p.uuid, personName(p), p.email, i === shown.length - 1))}
      </View>
      {eligible.length === 0 ? (
        <Text variant="footnote" tone="muted">
          {t('assign.no_eligible')}
        </Text>
      ) : null}
    </FormScreen>
  );
}
