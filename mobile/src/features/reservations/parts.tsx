import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, View } from 'react-native';

import { Can, type PermissionSlug } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { useDebounced } from '@/core/use-debounced';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { OptionSheet } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useMembers } from './api';
import {
  PAYMENT_TONES,
  personName,
  STATUS_TONES,
  type PaymentStatus,
  type ReservationListItem,
  type ReservationStatus,
} from './lib';

/** Screen body behind a permission; the forbidden state otherwise. */
export function Gate({
  perm,
  children,
  body,
}: {
  perm: PermissionSlug | PermissionSlug[];
  children: ReactNode;
  body?: string;
}) {
  const { t } = useTranslation();
  return (
    <Can perm={perm} fallback={<EmptyState icon="security" title={t('common:forbidden')} body={body} />}>
      {children}
    </Can>
  );
}

/** Asks before a step without a form (submit, confirm, cancel a link); the web preview runs it at once. */
export function confirmStep(opts: {
  title: string;
  body?: string;
  ok: string;
  cancel: string;
  destructive?: boolean;
  onOk: () => void;
}) {
  if (Platform.OS === 'web') {
    opts.onOk();
    return;
  }
  Alert.alert(opts.title, opts.body, [
    { text: opts.cancel, style: 'cancel' },
    { text: opts.ok, style: opts.destructive ? 'destructive' : 'default', onPress: opts.onOk },
  ]);
}

export function StatusChip({ status }: { status: ReservationStatus }) {
  const { t } = useTranslation('reservations');
  return <StatusPill label={t(`statuses.${status}`)} tone={STATUS_TONES[status]} />;
}

export function PaymentChip({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation('reservations');
  return <StatusPill label={t(`payment_statuses.${status}`)} tone={PAYMENT_TONES[status]} />;
}

export function rangeText(start: string, end: string) {
  return `${formatShort(start)} → ${formatShort(end)}`;
}

/** Label / value line inside a card; `children` may be any element. */
export function Line({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <View className={last ? 'gap-0.5 py-2' : 'gap-0.5 border-b border-border py-2'}>
      <Text variant="footnote" tone="muted">
        {label}
      </Text>
      {typeof children === 'string' ? <Text variant="callout">{children || '—'}</Text> : children}
    </View>
  );
}

/** Label / value lines; empty values are left out. */
export function Lines({ lines }: { lines: { label: string; value: ReactNode | null | undefined }[] }) {
  const shown = lines.filter((l) => l.value !== null && l.value !== undefined && l.value !== '');
  return (
    <View>
      {shown.map((l, i) => (
        <Line key={l.label} label={l.label} last={i === shown.length - 1}>
          {l.value}
        </Line>
      ))}
    </View>
  );
}

/** One reservation as a list row: reference, state, customer, product, dates, plate. */
export function ReservationRow({ item, trailing }: { item: ReservationListItem; trailing?: ReactNode }) {
  const { t } = useTranslation('reservations_app');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/reservations/[uuid]', params: { uuid: item.uuid } })}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className="flex-1 gap-1">
        <View className="flex-row flex-wrap items-center gap-1.5">
          <Text variant="callout" className="font-sans-semibold">
            {item.reference}
          </Text>
          <StatusChip status={item.status} />
          <PaymentChip status={item.payment_status} />
          {item.open_tasks > 0 ? (
            <StatusPill label={t('reservations:open_tasks_badge', { count: item.open_tasks })} tone="problem" />
          ) : null}
        </View>
        <Text variant="callout" numberOfLines={1}>
          {item.customer.display_name}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {rangeText(item.starts_at, item.ends_at)}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[
            `${item.pickup_branch.code}${item.return_branch.uuid !== item.pickup_branch.uuid ? ` → ${item.return_branch.code}` : ''}`,
            item.product.code,
            item.vehicle?.plate,
            formatMoney(item.total_amount, item.currency),
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        {trailing}
      </View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

/**
 * Staff picker (`GET /v1/tenant/members`, search as you type) with a
 * "nobody" choice that clears the assignment. Members without
 * `tenant.members.read` see only that choice, like the panel.
 */
export function MemberSheet({
  visible,
  title,
  value,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  value: string | null;
  onClose: () => void;
  onPick: (userUuid: string | null) => void;
}) {
  const { t } = useTranslation('reservations_app');
  const [q, setQ] = useState('');
  const query = useDebounced(q);
  const members = useMembers(query.trim(), visible);
  const NONE = '__none__';
  const options = [
    { value: NONE, label: t('assign.nobody'), description: t('reservations:assign.clear_hint') },
    ...(members.data?.items ?? []).map((m) => ({
      value: m.user.uuid,
      label: personName(m.user),
      description: m.user.email,
    })),
  ];
  return (
    <OptionSheet
      visible={visible}
      title={title}
      options={options}
      value={value ?? NONE}
      onSearch={setQ}
      loading={members.isFetching}
      onClose={onClose}
      onPick={(v) => onPick(v === NONE ? null : v)}
    />
  );
}
