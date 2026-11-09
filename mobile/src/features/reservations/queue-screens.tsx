import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Permission, usePermissions } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen, Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useAssignTask,
  useCustomerRequest,
  useCustomerRequests,
  useQuotes,
  useReplanTask,
  useReservations,
  useResolveRequest,
  useResolveTask,
  useTask,
  useTasks,
} from './api';
import {
  personName,
  QUEUE_STATUSES,
  QUOTE_TONES,
  REQUEST_TONES,
  requestActions,
  resolveNoteValid,
  slaState,
  TASK_TONES,
  taskActions,
  type CustomerRequest,
  type ListFilters,
  type QuoteListItem,
  type ResolutionTask,
} from './lib';
import { Gate, Lines, MemberSheet, rangeText, ReservationRow } from './parts';

function back() {
  if (router.canGoBack()) router.back();
}

function useHas() {
  const granted = usePermissions();
  return (slug: string) => granted.includes(slug);
}

/** Minute clock for the SLA countdowns. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function SlaPill({ deadline, now }: { deadline: string | null; now: number }) {
  const { t } = useTranslation('payments');
  const sla = slaState(deadline, now);
  if (sla.kind === 'none') return null;
  if (sla.kind === 'overdue')
    return <StatusPill label={t('approvals.sla_overdue', { minutes: sla.minutes })} tone="problem" />;
  return (
    <StatusPill
      label={
        sla.hours > 0
          ? t('approvals.sla_left_hours', { hours: sla.hours, minutes: sla.minutes })
          : t('approvals.sla_left_minutes', { minutes: sla.minutes })
      }
      tone={sla.soon ? 'progress' : 'neutral'}
    />
  );
}

// ---------------------------------------------------------------- approval queue

/**
 * "Onay kuyruğu" (the panel's `/reservations/approvals`): requests and
 * reviews by SLA deadline; accept / reject with `tenant.reservations.approve`.
 */
export function ApprovalsScreen() {
  const { t } = useTranslation('payments');
  return (
    <>
      <Stack.Screen options={{ title: t('approvals.title') }} />
      <Gate perm={Permission.TenantReservationsRead} body={t('approvals.forbidden')}>
        <ApprovalsList />
      </Gate>
    </>
  );
}

function ApprovalsList() {
  const { t } = useTranslation('payments');
  const has = useHas();
  const now = useNow();
  const branch = useSelectedBranch();
  const [status, setStatus] = useState<'all' | (typeof QUEUE_STATUSES)[number]>('all');
  const filters = useMemo<ListFilters>(
    () => ({ q: '', status: 'all', payment: 'all', sort: '-created_at', branch: branch.branchUuid }),
    [branch.branchUuid],
  );
  const query = useReservations(filters, {
    status: status === 'all' ? QUEUE_STATUSES.join(',') : status,
    sort: 'review_deadline',
  });
  const approve = has(Permission.TenantReservationsApprove);
  return (
    <PagedList
      query={query}
      keyOf={(r) => r.uuid}
      empty={t('approvals.empty_title')}
      header={
        <>
          <Text variant="footnote" tone="muted" className="px-1">
            {t('approvals.description')}
          </Text>
          <Chips
            options={[
              { value: 'all' as const, label: t('common:all') },
              ...QUEUE_STATUSES.map((s) => ({ value: s, label: t(`reservations:statuses.${s}`) })),
            ]}
            value={status}
            onChange={setStatus}
          />
        </>
      }
      renderItem={(r) => (
        <ReservationRow
          item={r}
          trailing={
            <View className="gap-2 pt-1">
              <View className="flex-row flex-wrap gap-1.5">
                <SlaPill deadline={r.review_deadline} now={now} />
                <StatusPill
                  label={`${t('approvals.columns.prepayment')}: ${formatMoney(r.prepayment_amount, r.currency)}`}
                />
              </View>
              {approve ? (
                <View className="flex-row gap-2">
                  <Button
                    className="flex-1"
                    icon="check"
                    title={t('approvals.accept')}
                    onPress={() => router.push(`/reservations/${r.uuid}/accept`)}
                  />
                  <Button
                    className="flex-1"
                    variant="outline"
                    icon="close"
                    title={t('approvals.reject')}
                    onPress={() => router.push(`/reservations/${r.uuid}/reject`)}
                  />
                </View>
              ) : null}
            </View>
          }
        />
      )}
    />
  );
}

// ---------------------------------------------------------------- quotes

/** "Teklifler" (the panel's `/reservations/quotes`, read only): priced searches and their validity. */
export function QuotesScreen() {
  const { t } = useTranslation('reservations');
  return (
    <>
      <Stack.Screen options={{ title: t('quotes.title') }} />
      <Gate perm={Permission.TenantQuotesRead} body={t('quotes.forbidden')}>
        <QuotesList />
      </Gate>
    </>
  );
}

const QUOTE_FILTERS = ['all', 'open', 'used', 'superseded'] as const;

function QuoteRow({ q }: { q: QuoteListItem }) {
  const { t } = useTranslation('reservations');
  const body = (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="callout" className="font-sans-semibold">
            {formatMoney(q.total, q.currency)}
          </Text>
          <StatusPill label={t(`quotes.purposes.${q.purpose}`)} />
          <StatusPill label={t(`quotes.statuses.${q.status}`)} tone={QUOTE_TONES[q.status]} />
          {q.expired && q.status === 'open' ? <StatusPill label={t('quotes.expired')} tone="problem" /> : null}
        </View>
        <Text variant="callout" numberOfLines={1}>
          {[q.customer?.display_name, `${q.product.code} · ${q.product.title}`].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {rangeText(q.starts_at, q.ends_at)}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[
            `${q.pickup_branch.code}${q.return_branch.uuid !== q.pickup_branch.uuid ? ` → ${q.return_branch.code}` : ''}`,
            q.channel,
            q.reservation?.reference,
            q.difference ? `${t('price.difference')} ${formatMoney(q.difference, q.currency)}` : null,
            t('reservations_app:valid_until', { at: formatShort(q.valid_until) }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      </View>
      {q.reservation ? <Icon name="forward" tone="muted-foreground" size={18} /> : null}
    </View>
  );
  if (!q.reservation) return body;
  const uuid = q.reservation.uuid;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('quotes.actions.reservation')}
      onPress={() => router.push({ pathname: '/reservations/[uuid]', params: { uuid } })}
      className="active:bg-muted">
      {body}
    </Pressable>
  );
}

function QuotesList() {
  const { t } = useTranslation('reservations');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof QUOTE_FILTERS)[number]>('all');
  const search = useDebounced(q);
  const query = useQuotes({ q: search, status });
  return (
    <PagedList
      query={query}
      keyOf={(x) => x.uuid}
      empty={t('quotes.empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('common:search')} />
          <Chips
            options={QUOTE_FILTERS.map((s) => ({
              value: s,
              label: s === 'all' ? t('common:all') : t(`quotes.statuses.${s}`),
            }))}
            value={status}
            onChange={setStatus}
          />
        </>
      }
      renderItem={(x) => <QuoteRow q={x} />}
    />
  );
}

// ---------------------------------------------------------------- resolution tasks

const TASK_FILTERS = ['open', 'resolved', 'all'] as const;

/** "Çözüm görevleri" (the panel's `/reservations/tasks`): broken vehicle plans, open first. */
export function TasksScreen() {
  const { t } = useTranslation('reservations');
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.title') }} />
      <Gate perm={Permission.TenantResolutionTasksRead} body={t('tasks.forbidden')}>
        <TasksList />
      </Gate>
    </>
  );
}

function TaskRow({ task }: { task: ResolutionTask }) {
  const { t } = useTranslation('reservations');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/reservations/tasks/${task.uuid}`)}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="callout" className="font-sans-semibold">
            {t(`tasks.types.${task.task_type}`)}
          </Text>
          <StatusPill label={t(`tasks.statuses.${task.status}`)} tone={TASK_TONES[task.status]} />
        </View>
        <Text variant="callout" numberOfLines={1}>
          {[task.reservation.reference, task.reservation.pickup_branch?.code].filter(Boolean).join(' · ')}
        </Text>
        {task.reason ? (
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {task.reason}
          </Text>
        ) : null}
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[formatShort(task.created_at), personName(task.assignee)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

function TasksList() {
  const { t } = useTranslation('reservations');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof TASK_FILTERS)[number]>('open');
  const search = useDebounced(q);
  const query = useTasks({ q: search, status });
  return (
    <PagedList
      query={query}
      keyOf={(x) => x.uuid}
      empty={t('tasks.empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('common:search')} />
          <Chips
            options={TASK_FILTERS.map((s) => ({
              value: s,
              label: s === 'all' ? t('common:all') : t(`tasks.statuses.${s}`),
            }))}
            value={status}
            onChange={setStatus}
          />
        </>
      }
      renderItem={(x) => <TaskRow task={x} />}
    />
  );
}

/** One task: what broke, the reservation, the assignee; replan, assign and resolve while open. */
export function TaskDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('reservations');
  const query = useTask(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.title') }} />
      <Gate perm={Permission.TenantResolutionTasksRead} body={t('tasks.forbidden')}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>{(task) => <TaskBody task={task} />}</QueryState>
        </Screen>
      </Gate>
    </>
  );
}

function TaskBody({ task }: { task: ResolutionTask }) {
  const { t } = useTranslation('reservations');
  const has = useHas();
  const actions = taskActions(task, has);
  const replan = useReplanTask(task.uuid);
  const assign = useAssignTask(task.uuid);
  const [picking, setPicking] = useState(false);
  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="headline">{t(`tasks.types.${task.task_type}`)}</Text>
          <StatusPill label={t(`tasks.statuses.${task.status}`)} tone={TASK_TONES[task.status]} />
        </View>
        <Lines
          lines={[
            { label: t('tasks.columns.reason'), value: task.reason || null },
            {
              label: t('tasks.columns.reservation'),
              value: `${task.reservation.reference} · ${rangeText(task.reservation.starts_at, task.reservation.ends_at)}`,
            },
            { label: t('tasks.columns.assignee'), value: personName(task.assignee) || '—' },
            { label: t('tasks.columns.created_at'), value: formatShort(task.created_at) },
            {
              label: t('tasks.statuses.resolved'),
              value: task.resolved_at
                ? [formatShort(task.resolved_at), personName(task.resolved_by)].filter(Boolean).join(' · ')
                : null,
            },
            { label: t('tasks.resolution_note'), value: task.resolution_note || null },
          ]}
        />
        <Button
          variant="outline"
          icon="forward"
          title={t('tasks.actions.open_reservation')}
          onPress={() => router.push({ pathname: '/reservations/[uuid]', params: { uuid: task.reservation.uuid } })}
        />
      </Card>
      {actions.resolve ? (
        <Card>
          <Button
            size="lg"
            icon="check"
            title={t('tasks.actions.resolve')}
            onPress={() => router.push(`/reservations/tasks/${task.uuid}/resolve`)}
          />
          <Button
            variant="outline"
            icon="refresh"
            title={t('tasks.actions.replan')}
            loading={replan.isPending}
            onPress={() =>
              replan.mutate(undefined, {
                onSuccess: (out) =>
                  out.replanned
                    ? toast.success(t('tasks.toast.replanned'))
                    : toast.error(t('tasks.toast.replan_failed')),
                onError: (e) => toast.error(apiErrorMessage(e)),
              })
            }
          />
          <Button
            variant="outline"
            icon="customer"
            title={t('tasks.actions.assign')}
            loading={assign.isPending}
            onPress={() => setPicking(true)}
          />
        </Card>
      ) : null}
      <MemberSheet
        visible={picking}
        title={t('tasks.assign_title')}
        value={task.assignee?.uuid ?? null}
        onClose={() => setPicking(false)}
        onPick={(user) => {
          setPicking(false);
          assign.mutate(user, {
            onSuccess: () => toast.success(t('tasks.toast.assigned')),
            onError: (e) => toast.error(apiErrorMessage(e)),
          });
        }}
      />
    </>
  );
}

/** Resolve a task with an optional note (`tenant.resolution_tasks.write`). */
export function ResolveTaskScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('reservations');
  const resolve = useResolveTask(uuid);
  const [note, setNote] = useState('');
  return (
    <>
      <Stack.Screen options={{ title: t('tasks.resolve_title') }} />
      <Gate perm={Permission.TenantResolutionTasksWrite}>
        <FormScreen
          footer={
            <>
              {resolve.error ? (
                <Text variant="footnote" tone="danger">
                  {apiErrorMessage(resolve.error)}
                </Text>
              ) : null}
              <Button
                size="lg"
                icon="check"
                title={t('tasks.actions.resolve')}
                loading={resolve.isPending}
                onPress={() =>
                  resolve.mutate(note.trim(), {
                    onSuccess: () => {
                      toast.success(t('tasks.toast.resolved'));
                      back();
                    },
                  })
                }
              />
            </>
          }>
          <TextArea label={t('tasks.resolution_note')} value={note} onChangeText={setNote} maxLength={500} autoFocus />
        </FormScreen>
      </Gate>
    </>
  );
}

// ---------------------------------------------------------------- customer requests

const REQUEST_FILTERS = ['open', 'resolved', 'rejected', 'all'] as const;

/** "Müşteri talepleri" (the panel's `/reservations/requests`): change and cancel requests from the portal. */
export function RequestsScreen() {
  const { t } = useTranslation('customer_portal');
  return (
    <>
      <Stack.Screen options={{ title: t('staff.title') }} />
      <Gate perm={Permission.TenantReservationsRead} body={t('staff.forbidden')}>
        <RequestsList />
      </Gate>
    </>
  );
}

function RequestRow({ req }: { req: CustomerRequest }) {
  const { t } = useTranslation('customer_portal');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/reservations/requests/${req.uuid}`)}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="callout" className="font-sans-semibold">
            {t(`request_types.${req.type}`)}
          </Text>
          <StatusPill label={t(`request_statuses.${req.status}`)} tone={REQUEST_TONES[req.status]} />
        </View>
        <Text variant="callout" numberOfLines={1}>
          {`${req.reservation.reference} · ${req.customer_name}`}
        </Text>
        {req.message ? (
          <Text variant="footnote" numberOfLines={2}>
            {req.message}
          </Text>
        ) : null}
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[formatShort(req.created_at), req.requester_name].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

function RequestsList() {
  const { t } = useTranslation('customer_portal');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<(typeof REQUEST_FILTERS)[number]>('open');
  const search = useDebounced(q);
  const query = useCustomerRequests({ q: search, status });
  return (
    <PagedList
      query={query}
      keyOf={(x) => x.uuid}
      empty={t('staff.empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('common:search')} />
          <Chips
            options={REQUEST_FILTERS.map((s) => ({
              value: s,
              label: s === 'all' ? t('common:all') : t(`request_statuses.${s}`),
            }))}
            value={status}
            onChange={setStatus}
          />
        </>
      }
      renderItem={(x) => <RequestRow req={x} />}
    />
  );
}

/** One customer request: what was asked, the policy, the answer; resolve / reject while open. */
export function RequestDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('customer_portal');
  const query = useCustomerRequest(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('staff.title') }} />
      <Gate perm={Permission.TenantReservationsRead} body={t('staff.forbidden')}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>{(req) => <RequestBody req={req} />}</QueryState>
        </Screen>
      </Gate>
    </>
  );
}

function RequestBody({ req }: { req: CustomerRequest }) {
  const { t } = useTranslation('customer_portal');
  const has = useHas();
  const actions = requestActions(req, has);
  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="headline">{t(`request_types.${req.type}`)}</Text>
          <StatusPill label={t(`request_statuses.${req.status}`)} tone={REQUEST_TONES[req.status]} />
        </View>
        <Lines
          lines={[
            { label: t('staff.columns.message'), value: req.message || null },
            {
              label: t('staff.columns.reservation'),
              value: `${req.reservation.reference} · ${rangeText(req.reservation.starts_at, req.reservation.ends_at)}`,
            },
            { label: t('reservations:fields.customer'), value: req.customer_name },
            {
              label: t('staff.columns.requester'),
              value: [req.requester_name, req.contact_masked].filter(Boolean).join(' · '),
            },
            {
              label: t('requests.change_title'),
              value:
                req.requested_starts_at && req.requested_ends_at
                  ? t('staff.requested_dates', {
                      start: formatShort(req.requested_starts_at),
                      end: formatShort(req.requested_ends_at),
                    })
                  : null,
            },
            {
              label: t('requests.policy'),
              value:
                [
                  req.policy_text,
                  req.cancellation_fee
                    ? t('staff.fee', { fee: formatMoney(req.cancellation_fee, req.currency) })
                    : null,
                ]
                  .filter(Boolean)
                  .join('\n') || null,
            },
            { label: t('staff.columns.created_at'), value: formatShort(req.created_at) },
            { label: t('staff.columns.resolution_note'), value: req.resolution_note || null },
            {
              label: t('request_statuses.resolved'),
              value: req.resolved_at
                ? [formatShort(req.resolved_at), personName(req.resolved_by)].filter(Boolean).join(' · ')
                : null,
            },
          ]}
        />
        {req.outcome === 'self_cancelled' ? (
          <Text variant="footnote" tone="muted">
            {t('staff.self_cancelled')}
          </Text>
        ) : null}
        <Button
          variant="outline"
          icon="forward"
          title={t('staff.actions.open')}
          onPress={() => router.push({ pathname: '/reservations/[uuid]', params: { uuid: req.reservation.uuid } })}
        />
      </Card>
      {actions.resolve ? (
        <Card>
          <Button
            size="lg"
            icon="check"
            title={t('staff.actions.resolve')}
            onPress={() =>
              router.push({
                pathname: '/reservations/requests/[uuid]/resolve',
                params: { uuid: req.uuid, status: 'resolved' },
              })
            }
          />
          <Button
            variant="ghost"
            icon="close"
            title={t('staff.actions.reject')}
            onPress={() =>
              router.push({
                pathname: '/reservations/requests/[uuid]/resolve',
                params: { uuid: req.uuid, status: 'rejected' },
              })
            }
          />
        </Card>
      ) : null}
    </>
  );
}

/** Close a request with a note the customer sees; required to reject (`tenant.reservations.write`). */
export function ResolveRequestScreen() {
  const { uuid, status: raw } = useLocalSearchParams<{ uuid: string; status?: string }>();
  const status = raw === 'rejected' ? 'rejected' : 'resolved';
  const { t } = useTranslation('customer_portal');
  const resolve = useResolveRequest(uuid);
  const [note, setNote] = useState('');
  const valid = resolveNoteValid(status, note);
  return (
    <>
      <Stack.Screen options={{ title: status === 'rejected' ? t('staff.reject_title') : t('staff.resolve_title') }} />
      <Gate perm={Permission.TenantReservationsWrite}>
        <FormScreen
          footer={
            <>
              {resolve.error ? (
                <Text variant="footnote" tone="danger">
                  {apiErrorMessage(resolve.error)}
                </Text>
              ) : null}
              <Button
                size="lg"
                variant={status === 'rejected' ? 'destructive' : 'primary'}
                title={status === 'rejected' ? t('staff.actions.reject') : t('staff.actions.resolve')}
                disabled={!valid}
                loading={resolve.isPending}
                onPress={() =>
                  resolve.mutate(
                    { status, note: note.trim() },
                    {
                      onSuccess: () => {
                        toast.success(t(status === 'rejected' ? 'staff.toast.rejected' : 'staff.toast.resolved'));
                        back();
                      },
                    },
                  )
                }
              />
            </>
          }>
          <Text tone="muted">{t('staff.description')}</Text>
          <TextArea
            label={t('staff.note')}
            hint={status === 'rejected' ? t('common:reason_hint') : t('common:optional')}
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            autoFocus
          />
        </FormScreen>
      </Gate>
    </>
  );
}
