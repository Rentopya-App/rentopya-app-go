import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, RefreshControl, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatShort, formatTime } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { stepErrorText, useFieldTask, useFieldTaskEvents, useFieldTaskStep } from './api';
import {
  canDo,
  inspectionPath,
  isLate,
  mapsUrl,
  personName,
  placeText,
  primaryStep,
  STATUS_TONES,
  telUrl,
  typeKey,
  type FieldTask,
  type FieldTaskEvent,
} from './lib';

const DETAIL_PERMS = [
  Permission.TenantFieldTasksRead,
  Permission.TenantFieldTasksAssign,
  Permission.TenantFieldTasksExecute,
];

/**
 * One field task (the panel's `/field/my/{uuid}`): when and where, whom to
 * meet (call), the vehicle and the booking, directions in the maps app; then
 * the next step the API offers in `actions`.
 */
export function FieldTaskDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('field_tasks');
  return (
    <>
      <Stack.Screen options={{ title: t('detail.title') }} />
      <Can
        perm={DETAIL_PERMS}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <Detail uuid={uuid} />
      </Can>
    </>
  );
}

function Detail({ uuid }: { uuid: string }) {
  const { t } = useTranslation('field_tasks');
  const query = useFieldTask(uuid);
  const events = useFieldTaskEvents(uuid);
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void events.refetch();
          }}
        />
      }>
      <QueryState query={query} rows={5}>
        {(task) => (
          <>
            <Stack.Screen options={{ title: t(typeKey(task)) }} />
            <Summary task={task} />
            <NextStep task={task} />
            <Card title={t('detail.timeline')}>
              <QueryState query={events} rows={2}>
                {(items) => <Timeline items={items} />}
              </QueryState>
            </Card>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function Row({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <View className={last ? 'gap-0.5 py-2' : 'gap-0.5 border-b border-border py-2'}>
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      {typeof children === 'string' ? <Text variant="callout">{children}</Text> : children}
    </View>
  );
}

function Summary({ task }: { task: FieldTask }) {
  const { t } = useTranslation('field_tasks');
  const maps = mapsUrl(task, Platform.OS);
  const late = isLate(task);
  return (
    <Card>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <StatusPill label={t(`statuses.${task.status}`)} tone={STATUS_TONES[task.status]} />
        {late ? <StatusPill label={t('late')} tone="problem" /> : null}
      </View>
      {task.status === 'issue_reported' && task.issue_note ? (
        <View className="gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <Text variant="footnote" tone="danger" className="font-sans-semibold">
            {t('detail.issue')}
          </Text>
          <Text variant="callout">{task.issue_note}</Text>
        </View>
      ) : null}
      <View>
        <Row label={t('fields.due_at')}>
          <Text variant="callout" tone={late ? 'danger' : 'default'} className="tabular-nums">
            {`${formatShort(task.due_at)} – ${formatTime(task.planned_end_at)}`}
          </Text>
        </Row>
        <Row label={t('fields.place')}>
          <View className="gap-0.5">
            <Text variant="callout">{placeText(task)}</Text>
            <Text variant="footnote" tone="muted">
              {t(`location_kinds.${task.location.kind}`)}
              {task.to_branch ? ` · ${task.branch.code} → ${task.to_branch.code}` : ''}
            </Text>
          </View>
        </Row>
        {task.contact.name || task.contact.phone ? (
          <Row label={t('fields.contact')}>
            {task.contact.phone ? (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${t('detail.call')} ${task.contact.name || task.contact.phone}`}
                onPress={() => void Linking.openURL(telUrl(task.contact.phone))}
                className="flex-row items-center gap-2 active:opacity-70">
                <Icon name="phone" tone="primary" size={16} />
                <Text variant="callout" tone="primary" className="font-sans-medium">
                  {[task.contact.name, task.contact.phone].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>
            ) : (
              task.contact.name
            )}
          </Row>
        ) : null}
        {task.flight_number ? <Row label={t('fields.flight_number')}>{task.flight_number}</Row> : null}
        {task.meeting_note ? <Row label={t('fields.meeting_note')}>{task.meeting_note}</Row> : null}
        <Row label={t('fields.vehicle')}>{task.vehicle ? `${task.vehicle.plate} · ${task.vehicle.label}` : '—'}</Row>
        {task.reservation ? <Row label={t('fields.reservation')}>{task.reservation.reference}</Row> : null}
        {task.rental ? <Row label={t('fields.rental')}>{task.rental.reference}</Row> : null}
        {task.note ? <Row label={t('fields.note')}>{task.note}</Row> : null}
        <Row label={t('fields.assignee')} last>
          {task.assignee ? personName(task.assignee) : t('fields.unassigned')}
        </Row>
      </View>
      {maps || task.contact.phone ? (
        <View className="flex-row gap-2">
          {maps ? (
            <Button
              className="flex-1"
              variant="outline"
              icon="externalLink"
              title={t('detail.directions')}
              onPress={() => Linking.openURL(maps).catch(() => toast.error(t('detail.maps_failed')))}
            />
          ) : null}
          {task.contact.phone ? (
            <Button
              className="flex-1"
              variant="outline"
              icon="phone"
              title={t('detail.call')}
              onPress={() => void Linking.openURL(telUrl(task.contact.phone))}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

/** The steps the API offers now (`actions`); the main one first and full width. */
function NextStep({ task }: { task: FieldTask }) {
  const { t } = useTranslation('field_tasks');
  const can = useCan();
  const step = useFieldTaskStep(task.uuid);
  const inspection = inspectionPath(task);
  const main = primaryStep(task);
  const base = `/field/my/${task.uuid}`;

  const start = () =>
    step.mutate(
      { step: 'start' },
      {
        onSuccess: () => toast.success(t('toast.started')),
        onError: (e) => toast.error(stepErrorText(e)),
      },
    );

  const closed = task.status === 'completed' || task.status === 'cancelled';
  const canCancel = canDo(task, 'cancel') && can(Permission.TenantFieldTasksAssign);
  const any =
    canDo(task, 'start') ||
    (canDo(task, 'inspection') && inspection) ||
    canDo(task, 'complete') ||
    canDo(task, 'report_issue') ||
    canCancel;

  return (
    <Card title={t('detail.next_step')}>
      {!any ? (
        <Text variant="callout" tone="muted">
          {closed ? t('detail.closed') : t('detail.no_actions')}
        </Text>
      ) : null}
      {canDo(task, 'start') ? (
        <Button
          size="lg"
          variant={main === 'start' ? 'primary' : 'outline'}
          icon="forward"
          title={task.status === 'issue_reported' ? t('actions.resume') : t('actions.start')}
          loading={step.isPending}
          onPress={start}
        />
      ) : null}
      {canDo(task, 'inspection') && inspection ? (
        <Button
          size="lg"
          variant={main === 'inspection' ? 'primary' : 'outline'}
          icon="car"
          title={task.inspection === 'return' ? t('actions.open_return_form') : t('actions.open_handover_form')}
          onPress={() => router.push(inspection as Href)}
        />
      ) : null}
      {(task.task_type === 'handover' || task.task_type === 'return') && task.actions.length > 0 && !task.rental ? (
        <Text variant="footnote" tone="muted">
          {t('detail.waiting_rental')}
        </Text>
      ) : null}
      {canDo(task, 'complete') ? (
        <Button
          size={main === 'complete' ? 'lg' : 'md'}
          variant={main === 'complete' ? 'primary' : 'outline'}
          icon="check"
          title={t('actions.complete')}
          disabled={step.isPending}
          onPress={() => router.push(`${base}/complete` as Href)}
        />
      ) : null}
      {canDo(task, 'report_issue') ? (
        <Button
          variant="outline"
          icon="error"
          title={t('actions.report_issue')}
          disabled={step.isPending}
          onPress={() => router.push(`${base}/issue` as Href)}
        />
      ) : null}
      {canCancel ? (
        <Button
          variant="ghost"
          icon="cancel"
          title={t('actions.cancel')}
          disabled={step.isPending}
          onPress={() => router.push(`${base}/cancel` as Href)}
        />
      ) : null}
      {task.transfer && !closed ? (
        <Text variant="footnote" tone="muted">
          {t('detail.transfer_hint')}
        </Text>
      ) : null}
    </Card>
  );
}

function eventTitle(t: (key: string, values?: Record<string, string>) => string, e: FieldTaskEvent) {
  if (e.action === 'status_changed' && e.to_status) {
    return t('events.status_to', { status: t(`statuses.${e.to_status}`) });
  }
  return t(`events.${e.action}`);
}

/** Newest first, like the panel's timeline. */
function Timeline({ items }: { items: FieldTaskEvent[] }) {
  const { t } = useTranslation('field_tasks');
  if (items.length === 0) {
    return (
      <Text variant="callout" tone="muted">
        {t('detail.timeline_empty')}
      </Text>
    );
  }
  const rows = items.slice().reverse();
  return (
    <View>
      {rows.map((e, i) => (
        <View key={e.uuid} className="flex-row gap-3">
          <View className="items-center">
            <View className="mt-1.5 size-2 rounded-full bg-primary" />
            {i < rows.length - 1 ? <View className="w-px flex-1 bg-border" /> : null}
          </View>
          <View className="flex-1 gap-0.5 pb-3">
            <Text variant="callout" className="font-sans-medium">
              {eventTitle(t, e)}
            </Text>
            {e.note ? <Text variant="footnote">{e.note}</Text> : null}
            <Text variant="footnote" tone="muted">
              {[formatShort(e.created_at), e.actor ? personName(e.actor) : ''].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
