import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen, Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { OptionSheet, Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { rentalErrorText, useMemberOptions, useOperationTask, useOperationTaskAction, useOperationTasks } from './api';
import {
  isTaskLate,
  personName,
  TASK_FILTERS,
  TASK_TONES,
  TASK_TYPES,
  taskActions,
  taskListQuery,
  type OperationTask,
  type OperationTaskType,
  type TaskFilter,
} from './lib';
import { Field, TaskRow } from './parts';

const ALL = '__all__';
const UNASSIGN = '__none__';

function Forbidden() {
  const { t } = useTranslation('rentals');
  return <EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />;
}

/**
 * "Operasyon görevleri" (the panel's `/t/{slug}/operation-tasks`):
 * preparation, handover, return and cleaning work of the branches, open
 * ones by due time first; the branch filter of the menu applies.
 */
export function OperationTasksScreen() {
  const { t } = useTranslation('rentals');
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.title') }} />
      <Can perm={Permission.TenantRentalsRead} fallback={<Forbidden />}>
        <TasksList />
      </Can>
    </>
  );
}

function TasksList() {
  const { t } = useTranslation('rentals');
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const [filter, setFilter] = useState<TaskFilter>('live');
  const [type, setType] = useState<OperationTaskType | null>(null);
  const query = useOperationTasks(
    useMemo(
      () => taskListQuery({ q: search, filter, type, branch: branch.branchUuid }),
      [search, filter, type, branch.branchUuid],
    ),
  );
  return (
    <PagedList
      query={query}
      keyOf={(task) => task.uuid}
      empty={t('tasks.empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('rentals_app:tasks.search')} />
          <Chips
            options={TASK_FILTERS.map((f) => ({ value: f, label: t(`rentals_app:tasks.filters.${f}`) }))}
            value={filter}
            onChange={setFilter}
          />
          <Select
            label={t('tasks.columns.task_type')}
            value={type ?? ALL}
            options={[
              { value: ALL, label: t('common:all') },
              ...TASK_TYPES.map((v) => ({ value: v, label: t(`tasks.types.${v}`) })),
            ]}
            onChange={(v) => setType(v === ALL ? null : (v as OperationTaskType))}
          />
        </>
      }
      renderItem={(task) => <TaskRow task={task} />}
    />
  );
}

/** One operation task with the panel's row actions: start, assign, complete, cancel (`tenant.rentals.write`). */
export function OperationTaskScreen() {
  const { t } = useTranslation('rentals');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('rentals_app:tasks.detail_title') }} />
      <Can perm={Permission.TenantRentalsRead} fallback={<Forbidden />}>
        <TaskDetail uuid={uuid} />
      </Can>
    </>
  );
}

function TaskDetail({ uuid }: { uuid: string }) {
  const query = useOperationTask(uuid);
  return (
    <Screen refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <QueryState query={query} rows={4}>
        {(task) => (
          <>
            <TaskSummary task={task} />
            <TaskActions task={task} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function TaskSummary({ task }: { task: OperationTask }) {
  const { t } = useTranslation('rentals');
  const late = isTaskLate(task);
  return (
    <Card>
      <Stack.Screen options={{ title: t(`tasks.types.${task.task_type}`) }} />
      <View className="flex-row flex-wrap items-center gap-1.5">
        <StatusPill label={t(`tasks.statuses.${task.status}`)} tone={TASK_TONES[task.status]} />
        {late ? <StatusPill label={t('rentals_app:late')} tone="problem" /> : null}
      </View>
      <View>
        <Field label={t('tasks.columns.due_at')}>
          <Text variant="callout" tone={late ? 'danger' : 'default'} className="tabular-nums">
            {formatShort(task.due_at)}
          </Text>
        </Field>
        <Field label={t('tasks.columns.branch')}>
          {[task.branch.code, task.branch.name].filter(Boolean).join(' · ')}
        </Field>
        <Field label={t('fields.vehicle')}>
          {task.vehicle ? [task.vehicle.plate, task.vehicle.label].filter(Boolean).join(' · ') : '—'}
        </Field>
        {task.rental ? (
          <Field label={t('tasks.columns.rental')} onPress={() => router.push(`/rentals/${task.rental!.uuid}` as Href)}>
            {task.rental.reference}
          </Field>
        ) : null}
        <Field label={t('tasks.columns.assignee')}>
          {task.assignee ? personName(task.assignee) : t('rentals_app:tasks.unassigned')}
        </Field>
        {task.note ? <Field label={t('tasks.note')}>{task.note}</Field> : null}
        {task.started_at ? (
          <Field label={t('rentals_app:tasks.started_at')}>{formatShort(task.started_at)}</Field>
        ) : null}
        {task.completed_at ? (
          <Field label={t('tasks.columns.completed_at')}>
            {[formatShort(task.completed_at), personName(task.completed_by)].filter(Boolean).join(' · ')}
          </Field>
        ) : null}
        {task.completion_note ? (
          <Field label={t('rentals_app:tasks.completion_note')}>{task.completion_note}</Field>
        ) : null}
        <Field label={t('tasks.columns.created_at')} last>
          {formatShort(task.created_at)}
        </Field>
      </View>
    </Card>
  );
}

function TaskActions({ task }: { task: OperationTask }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const a = taskActions(task, can(Permission.TenantRentalsWrite));
  const action = useOperationTaskAction(task.uuid);
  const [assignOpen, setAssignOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const members = useMemberOptions(search, assignOpen);
  const base = `/operation-tasks/${task.uuid}`;
  if (!Object.values(a).some(Boolean)) {
    return (
      <Text variant="callout" tone="muted" className="px-1">
        {t('rentals_app:tasks.no_actions')}
      </Text>
    );
  }
  const run = (v: Parameters<typeof action.mutate>[0], ok: string) =>
    action.mutate(v, {
      onSuccess: () => toast.success(t(ok)),
      onError: (e) => toast.error(rentalErrorText(e)),
    });
  return (
    <View className="gap-2">
      {a.start ? (
        <Button
          size="lg"
          icon="forward"
          title={t('tasks.actions.start')}
          loading={action.isPending && action.variables?.action === 'start'}
          onPress={() => run({ action: 'start' }, 'tasks.toast.start')}
        />
      ) : null}
      {a.complete ? (
        <Button
          size={a.start ? 'md' : 'lg'}
          variant={a.start ? 'outline' : 'primary'}
          icon="check"
          title={t('tasks.actions.complete')}
          disabled={action.isPending}
          onPress={() => router.push(`${base}/complete` as Href)}
        />
      ) : null}
      {a.assign ? (
        <Button
          variant="outline"
          icon="user"
          title={t('tasks.actions.assign')}
          disabled={action.isPending}
          onPress={() => setAssignOpen(true)}
        />
      ) : null}
      {a.cancel ? (
        <Button
          variant="ghost"
          icon="cancel"
          title={t('tasks.actions.cancel')}
          disabled={action.isPending}
          onPress={() => router.push(`${base}/cancel` as Href)}
        />
      ) : null}
      <OptionSheet
        visible={assignOpen}
        title={t('tasks.assign_title')}
        options={[
          ...(task.assignee ? [{ value: UNASSIGN, label: t('rentals_app:tasks.unassign') }] : []),
          ...(members.data ?? []),
        ]}
        value={task.assignee?.uuid}
        onSearch={setQ}
        loading={members.isFetching}
        onClose={() => setAssignOpen(false)}
        onPick={(v) => {
          setAssignOpen(false);
          run({ action: 'assign', userUuid: v === UNASSIGN ? null : v }, 'tasks.toast.assigned');
        }}
      />
    </View>
  );
}

/** Completes a preparation / cleaning task with an optional note; cleaning makes the vehicle available. */
export function CompleteOperationTaskScreen() {
  const { t } = useTranslation('rentals');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const query = useOperationTask(uuid);
  const action = useOperationTaskAction(uuid);
  const [note, setNote] = useState('');
  const submit = () =>
    action.mutate(
      { action: 'complete', note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('tasks.toast.complete'));
          router.back();
        },
        onError: (e) => toast.error(rentalErrorText(e)),
      },
    );
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.complete_title') }} />
      <Can perm={Permission.TenantRentalsWrite} fallback={<Forbidden />}>
        <FormScreen
          footer={
            <Button
              size="lg"
              icon="check"
              title={t('tasks.actions.complete')}
              loading={action.isPending}
              onPress={submit}
            />
          }>
          {query.data?.task_type === 'cleaning' ? <Text tone="muted">{t('tasks.complete_cleaning_hint')}</Text> : null}
          <TextArea
            label={t('tasks.note')}
            hint={t('common:optional')}
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
        </FormScreen>
      </Can>
    </>
  );
}

/** Cancels a live task with a reason (3-500 characters). */
export function CancelOperationTaskScreen() {
  const { t } = useTranslation('rentals');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const action = useOperationTaskAction(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.cancel_title') }} />
      <Can perm={Permission.TenantRentalsWrite} fallback={<Forbidden />}>
        <ReasonForm
          description={t('rentals_app:tasks.cancel_description')}
          label={t('tasks.note')}
          submitTitle={t('tasks.actions.cancel')}
          destructive
          pending={action.isPending}
          error={null}
          onSubmit={(note) =>
            action.mutate(
              { action: 'cancel', note },
              {
                onSuccess: () => {
                  toast.success(t('tasks.toast.cancel'));
                  router.back();
                },
                onError: (e) => toast.error(rentalErrorText(e)),
              },
            )
          }
        />
      </Can>
    </>
  );
}
