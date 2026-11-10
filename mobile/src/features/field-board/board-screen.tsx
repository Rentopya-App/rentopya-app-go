import { router, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { displayTimeZone } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { canDo, personName, STATUS_FILTERS, type FieldTask, type StatusFilter } from '@/features/field-tasks/lib';
import { FieldTaskRow } from '@/features/field-tasks/my-tasks-screen';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { useBoardFacets, useBoardTasks, useUnassignedCount } from './api';
import { boardQuery, TASK_TYPES, toggle, unassignedQuery, type FieldTaskType } from './lib';

const ANY = '__any__';

/** Path of the assign screen for one or several tasks. */
export function assignPath(uuids: string[]) {
  return `/field/board/assign?uuids=${uuids.join(',')}` as Href;
}

/**
 * "Görev panosu": every field task in the member's branch scope
 * (`tenant.field_tasks.read`), the panel's `/field/board` for the phone.
 * Filters: search, open / closed, a day, type, assignee and the menu's
 * branch. Planners (`tenant.field_tasks.assign`) assign a task from its row
 * or pick several and assign them in one go (the bulk `assign` action).
 */
export function FieldBoardScreen() {
  const { t } = useTranslation(['transfers_app', 'field_tasks']);
  return (
    <Can
      perm={Permission.TenantFieldTasksRead}
      fallback={
        <>
          <Stack.Screen options={{ title: t('board.title') }} />
          <EmptyState icon="security" title={t('common:forbidden')} body={t('field_tasks:forbidden')} />
        </>
      }>
      <Board />
    </Can>
  );
}

function Board() {
  const { t } = useTranslation(['transfers_app', 'field_tasks']);
  const insets = useSafeAreaInsets();
  const can = useCan();
  const planner = can(Permission.TenantFieldTasksAssign);
  const branch = useSelectedBranch();
  const zone = displayTimeZone();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('live');
  const [day, setDay] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<FieldTaskType | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const search = useDebounced(q);

  const params = useMemo(
    () => boardQuery({ q: search, status, day, taskType, assignee, branch: branch.branchUuid }, zone),
    [search, status, day, taskType, assignee, branch.branchUuid, zone],
  );
  const query = useBoardTasks(params);
  const unassigned = useUnassignedCount(
    useMemo(() => unassignedQuery({ day, branch: branch.branchUuid }, zone), [day, branch.branchUuid, zone]),
  );
  const facets = useBoardFacets();
  const people = facets.data?.assignee ?? [];
  const filtered = !!search.trim() || status !== 'all' || !!day || !!taskType || !!assignee;

  const showUnassigned = () => {
    setStatus('live');
    setAssignee('none');
    setTaskType(null);
    setQ('');
  };
  const stopSelecting = () => {
    setSelecting(false);
    setSelected([]);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: t('board.title'),
          headerRight: () =>
            planner ? (
              <HeaderButton
                icon={selecting ? 'close' : 'check'}
                label={selecting ? t('board.select_done') : t('board.select')}
                onPress={selecting ? stopSelecting : () => setSelecting(true)}
              />
            ) : null,
        }}
      />
      <View className="flex-1 bg-background">
        <PagedList<FieldTask>
          query={query}
          keyOf={(task) => task.uuid}
          empty={filtered ? t('board.empty_filtered') : t('board.empty')}
          header={
            <>
              {(unassigned.data ?? 0) > 0 ? (
                <View className="gap-2 rounded-lg border border-warning/50 bg-warning/10 p-3">
                  <View className="flex-row items-center gap-2">
                    <Icon name="error" tone="warning" size={18} />
                    <Text variant="callout" className="flex-1 font-sans-semibold">
                      {t('board.unassigned_title', { count: unassigned.data ?? 0 })}
                    </Text>
                  </View>
                  <Text variant="footnote" tone="muted">
                    {t('board.unassigned_hint')}
                  </Text>
                  <Button variant="outline" title={t('board.show_unassigned')} onPress={showUnassigned} />
                </View>
              ) : null}
              <SearchField value={q} onChangeText={setQ} placeholder={t('board.search_placeholder')} />
              <Chips
                options={STATUS_FILTERS.map((s) => ({ value: s, label: t(`field_tasks:filter.${s}`) }))}
                value={status}
                onChange={setStatus}
              />
              <DateField
                label={t('board.day')}
                value={day}
                placeholder={t('board.any_day')}
                onChange={setDay}
                onClear={() => setDay(null)}
              />
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Select
                    label={t('board.type')}
                    value={taskType ?? ANY}
                    options={[
                      { value: ANY, label: t('board.any_type') },
                      ...TASK_TYPES.map((v) => ({ value: v, label: t(`field_tasks:types.${v}`) })),
                    ]}
                    onChange={(v) => setTaskType(v === ANY ? null : (v as FieldTaskType))}
                  />
                </View>
                <View className="flex-1">
                  <Select
                    label={t('field_tasks:fields.assignee')}
                    value={assignee ?? ANY}
                    searchable={people.length > 8}
                    options={[
                      { value: ANY, label: t('board.any_assignee') },
                      ...people.map((f) => ({
                        value: f.value,
                        label: f.value === 'none' ? t('field_tasks:fields.unassigned') : f.label || f.value,
                        description: String(f.count),
                      })),
                    ]}
                    onChange={(v) => setAssignee(v === ANY ? null : v)}
                  />
                </View>
              </View>
              {branch.branch ? (
                <Text variant="footnote" tone="muted" className="px-1">
                  {t('board.branch_filter', { name: branch.branch.name })}
                </Text>
              ) : null}
            </>
          }
          renderItem={(task) => (
            <BoardRow
              task={task}
              planner={planner}
              selecting={selecting}
              selected={selected.includes(task.uuid)}
              onToggle={() => setSelected((s) => toggle(s, task.uuid))}
            />
          )}
        />
        {selecting ? (
          <View
            className="flex-row items-center gap-3 border-t border-border bg-card px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            <Text variant="callout" className="flex-1 font-sans-semibold">
              {t('board.selected', { count: selected.length })}
            </Text>
            <Button
              icon="user"
              title={t('board.assign')}
              disabled={selected.length === 0}
              onPress={() => {
                router.push(assignPath(selected));
                stopSelecting();
              }}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

/** "My tasks" row with who has it; in select mode a tap picks the task instead of opening it. */
function BoardRow({
  task,
  planner,
  selecting,
  selected,
  onToggle,
}: {
  task: FieldTask;
  planner: boolean;
  selecting: boolean;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation(['transfers_app', 'field_tasks']);
  const assignable = planner && canDo(task, 'assign');
  return (
    <View className={cn(selected && 'bg-primary/10')}>
      {/* An empty day: a late task from any day shows its date. */}
      <FieldTaskRow task={task} day="" />
      <View className="flex-row items-center gap-2 border-b border-border px-4 py-2">
        <Icon name="user" tone="muted-foreground" size={14} />
        <Text
          variant="footnote"
          tone={task.assignee ? 'default' : 'danger'}
          className="flex-1 font-sans-medium"
          numberOfLines={1}>
          {task.assignee ? personName(task.assignee) : t('field_tasks:fields.unassigned')}
        </Text>
        {assignable && !selecting ? (
          <Button
            variant="ghost"
            icon="user"
            title={task.assignee ? t('board.reassign') : t('board.assign')}
            onPress={() => router.push(assignPath([task.uuid]))}
          />
        ) : null}
      </View>
      {selecting ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: !assignable }}
          accessibilityLabel={t(`field_tasks:types.${task.task_type}`)}
          disabled={!assignable}
          onPress={onToggle}
          className="absolute inset-0 flex-row items-start justify-end p-3">
          <View
            className={cn(
              'size-6 items-center justify-center rounded-full border-2',
              selected ? 'border-primary bg-primary' : 'border-border bg-card',
              !assignable && 'opacity-40',
            )}>
            {selected ? <Icon name="check" tone="primary-foreground" size={14} /> : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
