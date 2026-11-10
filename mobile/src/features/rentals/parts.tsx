import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatShort } from '@/core/format';
import { Icon } from '@/ui/icon';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import {
  INSPECTION_STATUS_TONES,
  isTaskLate,
  personName,
  RENTAL_TONES,
  REVIEW_TONES,
  TASK_TONES,
  type InspectionListItem,
  type OperationTask,
  type RentalListItem,
} from './lib';

/** Label over value inside a card; string values are plain callout text. */
export function Field({
  label,
  children,
  last,
  onPress,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <View
      className={last ? 'flex-row items-center gap-2 py-2' : 'flex-row items-center gap-2 border-b border-border py-2'}>
      <View className="flex-1 gap-0.5">
        <Text variant="footnote" tone="muted">
          {label}
        </Text>
        {typeof children === 'string' ? (
          <Text variant="callout" tone={onPress ? 'primary' : 'default'}>
            {children}
          </Text>
        ) : (
          children
        )}
      </View>
      {onPress ? <Icon name="forward" tone="muted-foreground" size={16} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} className="active:opacity-70">
      {body}
    </Pressable>
  );
}

/** Label / value pairs; empty values are left out, the last one has no separator. */
export function Fields({ rows }: { rows: { label: string; value?: string | null; onPress?: () => void }[] }) {
  const shown = rows.filter((r) => r.value);
  return (
    <View>
      {shown.map((r, i) => (
        <Field key={r.label} label={r.label} last={i === shown.length - 1} onPress={r.onPress}>
          {r.value ?? ''}
        </Field>
      ))}
    </View>
  );
}

function RowShell({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(href as Href)}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className="flex-1 gap-1">{children}</View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

/** One rental in the list: reference, status, customer, vehicle and the planned window. */
export function RentalRow({ rental }: { rental: RentalListItem }) {
  const { t } = useTranslation('rentals');
  const branches =
    rental.pickup_branch.uuid === rental.return_branch.uuid
      ? (rental.pickup_branch.code ?? rental.pickup_branch.name)
      : `${rental.pickup_branch.code ?? rental.pickup_branch.name} → ${rental.return_branch.code ?? rental.return_branch.name}`;
  return (
    <RowShell href={`/rentals/${rental.uuid}`}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text variant="callout" className="font-sans-semibold">
          {rental.reference}
        </Text>
        <StatusPill label={t(`statuses.${rental.status}`)} tone={RENTAL_TONES[rental.status]} />
        {rental.overdue_at ? <StatusPill label={t('overdue_badge')} tone="problem" /> : null}
        {rental.open_charges > 0 ? (
          <StatusPill label={t('open_charges_badge', { count: rental.open_charges })} tone="progress" />
        ) : null}
      </View>
      <Text variant="callout" numberOfLines={1}>
        {rental.customer.display_name}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[rental.vehicle.plate, rental.vehicle.label, branches].filter(Boolean).join(' · ')}
      </Text>
      <Text variant="footnote" tone="muted" className="tabular-nums" numberOfLines={1}>
        {`${formatShort(rental.actual_pickup_at ?? rental.planned_pickup_at)} → ${formatShort(
          rental.actual_return_at ?? rental.planned_return_at,
        )}`}
        {rental.late_minutes > 0 ? ` · ${t('late_minutes', { count: rental.late_minutes })}` : ''}
      </Text>
    </RowShell>
  );
}

/** One operation task: type, status, due time (red when late), rental, plate, branch, assignee. */
export function TaskRow({ task, showRental = true }: { task: OperationTask; showRental?: boolean }) {
  const { t } = useTranslation('rentals');
  const late = isTaskLate(task);
  return (
    <RowShell href={`/operation-tasks/${task.uuid}`}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text variant="callout" className="font-sans-semibold">
          {t(`tasks.types.${task.task_type}`)}
        </Text>
        <StatusPill label={t(`tasks.statuses.${task.status}`)} tone={TASK_TONES[task.status]} />
        {late ? <StatusPill label={t('rentals_app:late')} tone="problem" /> : null}
      </View>
      <Text variant="footnote" tone={late ? 'danger' : 'default'} className="tabular-nums">
        {formatShort(task.due_at)}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[
          showRental ? task.rental?.reference : null,
          task.vehicle?.plate,
          task.branch.code ?? task.branch.name,
          task.assignee ? personName(task.assignee) : t('rentals_app:tasks.unassigned'),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </RowShell>
  );
}

/** One handover / return form: rental, kind, version, status, review state and evidence count. */
export function InspectionRow({ item, showRental = true }: { item: InspectionListItem; showRental?: boolean }) {
  const { t } = useTranslation('inspections_web');
  return (
    <RowShell href={`/inspections/${item.uuid}`}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text variant="callout" className="font-sans-semibold">
          {[showRental ? item.rental.reference : null, t(`kinds.${item.kind}`)].filter(Boolean).join(' · ')}
          {item.version > 1 ? ` v${item.version}` : ''}
        </Text>
        <StatusPill label={t(`statuses.${item.status}`)} tone={INSPECTION_STATUS_TONES[item.status]} />
        {item.review_status !== 'none' ? (
          <StatusPill label={t(`review.${item.review_status}`)} tone={REVIEW_TONES[item.review_status]} />
        ) : null}
        {item.disputed ? <StatusPill label={t('list.disputed')} tone="problem" /> : null}
      </View>
      <Text variant="footnote" numberOfLines={1}>
        {[item.vehicle.plate, item.customer.display_name].join(' · ')}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[
          t('list.evidence', { photos: item.photos, damages: item.damages }),
          `${t('list.columns.signature')}: ${t(`signature_status.${item.signature_status}`)}`,
          formatShort(item.finalized_at ?? item.created_at),
        ].join(' · ')}
      </Text>
    </RowShell>
  );
}
