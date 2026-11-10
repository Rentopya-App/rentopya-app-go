import { router, Stack, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { PlateBadge } from '@/features/vehicles/vehicle-row';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useTransfer, useTransferActivity } from './api';
import { personName, STATUS_TONES, transferActions, type Transfer } from './lib';

/** One transfer (`tenant.transfers.read`): the plan, what happened, the next step and the audit trail. */
export function TransferDetailScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation('transfers');
  return (
    <>
      <Stack.Screen options={{ title: t('transfers_app:detail_title') }} />
      <Can
        perm={Permission.TenantTransfersRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <Detail uuid={uuid} />
      </Can>
    </>
  );
}

function Detail({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const query = useTransfer(uuid);
  const activity = useTransferActivity(uuid);
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void activity.refetch();
          }}
        />
      }>
      <QueryState query={query} rows={5}>
        {(transfer) => (
          <>
            <Summary transfer={transfer} />
            <Actions transfer={transfer} />
            <Card title={t('transfers_app:activity')}>
              <QueryState query={activity} rows={2}>
                {(page) => <Activity items={page.items} />}
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

function Summary({ transfer }: { transfer: Transfer }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <PlateBadge plate={transfer.vehicle.plate} large />
        <View className="flex-1" />
        <StatusPill label={t(`status.${transfer.status}`)} tone={STATUS_TONES[transfer.status]} />
      </View>
      <Text tone="muted">{transfer.vehicle.label}</Text>
      <View>
        <Row label={t('columns.route')}>
          {`${transfer.from_branch.code} · ${transfer.from_branch.name} → ${transfer.to_branch.code} · ${transfer.to_branch.name}`}
        </Row>
        <Row label={t('columns.planned_departure')}>{formatShort(transfer.planned_departure)}</Row>
        <Row label={t('columns.planned_arrival')}>{formatShort(transfer.planned_arrival)}</Row>
        {transfer.actual_departure ? (
          <Row label={t('columns.actual_departure')}>{formatShort(transfer.actual_departure)}</Row>
        ) : null}
        {transfer.actual_arrival ? (
          <Row label={t('columns.actual_arrival')}>{formatShort(transfer.actual_arrival)}</Row>
        ) : null}
        <Row label={t('columns.responsible')}>
          {personName(transfer.responsible) || t('transfers_app:no_responsible')}
        </Row>
        <Row label={t('columns.cost')}>{transfer.cost != null ? formatMoney(transfer.cost) : '—'}</Row>
        <Row label={t('columns.note')} last>
          {transfer.note || '—'}
        </Row>
      </View>
    </Card>
  );
}

/** The panel's row menu as buttons: start / complete first, edit, cancel; the vehicle page. */
function Actions({ transfer }: { transfer: Transfer }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const can = useCan();
  const write = can(Permission.TenantTransfersWrite);
  const actions = write ? transferActions(transfer) : [];
  const base = `/transfers/${transfer.uuid}`;
  return (
    <Card title={t('transfers_app:next_step')}>
      {actions.length === 0 ? (
        <Text variant="callout" tone="muted">
          {transfer.status === 'completed' || transfer.status === 'cancelled'
            ? t('transfers_app:closed')
            : t('transfers_app:no_actions')}
        </Text>
      ) : null}
      {actions.includes('start') ? (
        <Button
          size="lg"
          icon="forward"
          title={t('actions.start')}
          onPress={() => router.push(`${base}/start` as Href)}
        />
      ) : null}
      {actions.includes('complete') ? (
        <Button
          size="lg"
          icon="check"
          title={t('actions.complete')}
          onPress={() => router.push(`${base}/complete` as Href)}
        />
      ) : null}
      {actions.includes('edit') ? (
        <Button
          variant="outline"
          icon="edit"
          title={t('actions.edit')}
          onPress={() => router.push(`${base}/edit` as Href)}
        />
      ) : null}
      {can(Permission.TenantVehiclesRead) ? (
        <Button
          variant="outline"
          icon="car"
          title={t('actions.view_vehicle')}
          onPress={() => router.push(`/vehicle/${transfer.vehicle.uuid}`)}
        />
      ) : null}
      {actions.includes('cancel') ? (
        <Button
          variant="ghost"
          icon="cancel"
          title={t('actions.cancel')}
          onPress={() => router.push(`${base}/cancel` as Href)}
        />
      ) : null}
    </Card>
  );
}

function Activity({
  items,
}: {
  items: { uuid: string; action: string; created_at: string; actor: Transfer['responsible'] }[];
}) {
  const { t, i18n } = useTranslation(['transfers_app']);
  if (items.length === 0) {
    return (
      <Text variant="callout" tone="muted">
        {t('activity_empty')}
      </Text>
    );
  }
  // The panel's activity labels; an unknown action shows as it is.
  const describe = (action: string) => {
    const key = `activity:actions.${action}`;
    return i18n.exists(key) ? t(key) : action;
  };
  return (
    <View>
      {items.map((e, i) => (
        <View key={e.uuid} className="flex-row gap-3">
          <View className="items-center">
            <View className="mt-1.5 size-2 rounded-full bg-primary" />
            {i < items.length - 1 ? <View className="w-px flex-1 bg-border" /> : null}
          </View>
          <View className="flex-1 gap-0.5 pb-3">
            <Text variant="callout" className="font-sans-medium">
              {describe(e.action)}
            </Text>
            <Text variant="footnote" tone="muted">
              {[formatShort(e.created_at), personName(e.actor) || t('system_actor')].join(' · ')}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}
