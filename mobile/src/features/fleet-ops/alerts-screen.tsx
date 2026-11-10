import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatNumber } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { docTypeKey, maintenanceTypeKey } from '@/features/vehicles/labels';
import { PlateBadge } from '@/features/vehicles/vehicle-row';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { QueryState } from '@/ui/query-state';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useFleetAlerts, type FleetAlert } from './api';
import { ALERT_KINDS, ALERT_STATES, alertCounts, filterAlerts } from './model';

const ALL = '__all__';

/**
 * "Operasyon özeti" (the panel's `/fleet/alerts`): documents expiring within
 * 30 days or expired and maintenance plans due within 15 days / 1000 km or
 * overdue, in the member's branch scope. A row opens the vehicle card.
 */
export function FleetAlertsScreen() {
  const { t } = useTranslation(['fleet_ops_app', 'vehicle_records']);
  const can = useCan();
  const query = useFleetAlerts();
  const branch = useSelectedBranch();
  const [kind, setKind] = useState<string>(ALL);
  const [state, setState] = useState<string>(ALL);
  const [q, setQ] = useState('');
  const readable = can(Permission.TenantVehiclesRead);
  const canWrite = can(Permission.TenantVehiclesWrite);
  const all = useMemo(
    () => filterAlerts(query.data?.items ?? [], { branchName: branch.branch?.name ?? null }),
    [branch.branch?.name, query.data?.items],
  );
  const items = useMemo(
    () => filterAlerts(all, { kind: kind === ALL ? null : kind, state: state === ALL ? null : state, q }),
    [all, kind, q, state],
  );
  const counts = alertCounts(all);

  if (!readable) {
    return (
      <>
        <Stack.Screen options={{ title: t('vehicle_records:alerts.title') }} />
        <EmptyState icon="security" title={t('vehicle_records:alerts.forbidden')} />
      </>
    );
  }

  const header = (
    <View className="gap-3 pb-3">
      <Text variant="footnote" tone="muted">
        {query.data
          ? t('vehicle_records:alerts.description', {
              documents: query.data.document_horizon_days,
              days: query.data.maintenance_horizon_days,
              km: formatNumber(query.data.maintenance_horizon_km),
            })
          : t('vehicle_records:alerts.description_short')}
      </Text>
      {query.data ? (
        <View className="flex-row gap-3">
          <Card className="flex-1">
            <Text variant="footnote" tone="muted">
              {t('vehicle_records:alerts.state.overdue')}
            </Text>
            <Text variant="title" tone={counts.overdue ? 'danger' : 'default'} className="tabular-nums">
              {formatNumber(counts.overdue)}
            </Text>
          </Card>
          <Card className="flex-1">
            <Text variant="footnote" tone="muted">
              {t('vehicle_records:alerts.state.expiring')}
            </Text>
            <Text variant="title" className="tabular-nums">
              {formatNumber(counts.expiring)}
            </Text>
          </Card>
        </View>
      ) : null}
      <SearchField value={q} onChangeText={setQ} placeholder={t('plate_search')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...ALERT_KINDS.map((k) => ({ value: k, label: t(`vehicle_records:alerts.kind.${k}`) })),
        ]}
        value={kind}
        onChange={setKind}
      />
      <Chips
        options={[
          { value: ALL, label: t('all_states') },
          ...ALERT_STATES.map((s) => ({ value: s, label: t(`vehicle_records:alerts.state.${s}`) })),
        ]}
        value={state}
        onChange={setState}
      />
      {branch.branch ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('branch_filter_current', { name: branch.branch.name })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('vehicle_records:alerts.title'),
          headerRight: () =>
            canWrite ? (
              <HeaderButton
                icon="add"
                label={t('vehicle_records:maintenance.plan')}
                onPress={() => router.push('/fleet/maintenance/new')}
              />
            ) : null,
        }}
      />
      <FlatList
        data={query.data ? items : []}
        keyExtractor={(a) => `${a.kind}-${a.subject_uuid}`}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        className="flex-1 bg-background"
        contentContainerClassName="px-4 pb-10 pt-2"
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <View
            className={cn(
              'overflow-hidden border-x border-border bg-card',
              index === 0 && 'rounded-t-lg border-t',
              index === items.length - 1 && 'rounded-b-lg border-b',
            )}>
            <AlertRow alert={item} canWrite={canWrite} last={index === items.length - 1} />
          </View>
        )}
        ListEmptyComponent={
          query.data ? (
            all.length ? (
              <EmptyState icon="inbox" title={t('alerts_empty_filtered')} />
            ) : (
              <EmptyState
                icon="check"
                title={t('vehicle_records:alerts.empty_title')}
                body={t('vehicle_records:alerts.empty_description')}
              />
            )
          ) : (
            <QueryState query={query}>{() => null}</QueryState>
          )
        }
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      />
    </>
  );
}

function AlertRow({ alert, canWrite, last }: { alert: FleetAlert; canWrite: boolean; last: boolean }) {
  const { t } = useTranslation(['fleet_ops_app', 'vehicle_records']);
  const type = alert.kind === 'document' ? t(docTypeKey(alert.type)) : t(maintenanceTypeKey(alert.type));
  const due = [
    alert.due_date ? formatCalendarDate(alert.due_date) : null,
    alert.due_km != null ? `${formatNumber(alert.due_km)} km` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const left = [
    alert.days_left == null
      ? null
      : alert.days_left === 0
        ? t('vehicle_records:days_today')
        : alert.days_left > 0
          ? t('vehicle_records:days_left', { count: alert.days_left })
          : t('vehicle_records:days_overdue', { count: -alert.days_left }),
    alert.km_left == null
      ? null
      : alert.km_left > 0
        ? t('vehicle_records:km_left', { count: alert.km_left })
        : t('vehicle_records:km_overdue', { count: -alert.km_left }),
  ]
    .filter(Boolean)
    .join(' · ');
  const vehicle = alert.vehicle.uuid;
  return (
    <View className={cn(!last && 'border-b border-border')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${alert.vehicle.plate}, ${type}, ${t(`vehicle_records:alerts.state.${alert.state}`)}`}
        onPress={() => router.push(`/vehicle/${vehicle}`)}
        className="gap-2 px-4 py-3 active:bg-muted">
        <View className="flex-row items-center gap-3">
          <PlateBadge plate={alert.vehicle.plate} />
          <View className="flex-1" />
          <StatusPill
            label={t(`vehicle_records:alerts.state.${alert.state}`)}
            tone={alert.state === 'overdue' ? 'problem' : 'progress'}
          />
        </View>
        <View className="flex-row items-center gap-2">
          <Icon name={alert.kind === 'document' ? 'document' : 'wrench'} tone="muted-foreground" size={16} />
          <Text variant="callout" className="flex-1 font-sans-medium" numberOfLines={1}>
            {type}
            {alert.document_number ? ` · ${alert.document_number}` : ''}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Icon name="calendar" tone="muted-foreground" size={14} />
          <Text variant="footnote" tone="muted" className="flex-1" numberOfLines={1}>
            {due}
          </Text>
          <Text variant="footnote" tone={alert.state === 'overdue' ? 'danger' : 'muted'} className="tabular-nums">
            {left}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <Icon name="location" tone="muted-foreground" size={14} />
          <Text variant="footnote" tone="muted" className="flex-1" numberOfLines={1}>
            {alert.vehicle.current_branch} · {formatNumber(alert.vehicle.odometer_km)} km
          </Text>
        </View>
      </Pressable>
      {alert.kind === 'maintenance' && canWrite ? (
        <View className="flex-row gap-2 px-4 pb-3">
          <Button
            title={t('vehicle_records:maintenance.complete')}
            icon="check"
            variant="outline"
            onPress={() => router.push(`/vehicle/${vehicle}/maintenance/${alert.subject_uuid}`)}
          />
          <Button
            title={t('new_maintenance')}
            icon="add"
            variant="ghost"
            onPress={() => router.push({ pathname: '/fleet/maintenance/new', params: { vehicle } })}
          />
        </View>
      ) : null}
    </View>
  );
}
