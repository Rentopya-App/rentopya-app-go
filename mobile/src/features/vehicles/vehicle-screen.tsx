import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, RefreshControl, View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatNumber, formatRelative, formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { PlanMaintenanceButton } from '@/features/fleet-ops/maintenance-screens';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useOpenRental,
  useRefreshVehicle,
  useReleaseBlock,
  useVehicle,
  useVehicleBlocks,
  useVehicleDocuments,
  useVehicleEvents,
  useVehicleKasko,
  useVehicleMaintenance,
  type Vehicle,
  type VehicleBlock,
  type VehicleDocument,
} from './api';
import { openDocumentFile } from './document-file';
import { STATUS_SYNC_KINDS } from './forms';
import {
  BLOCK_STATE_TONE,
  blockKindKey,
  blockStateKey,
  DOC_STATUS_TONE,
  docStatusKey,
  docTypeKey,
  MAINTENANCE_STATUS_TONE,
  maintenanceStatusKey,
  maintenanceTypeKey,
  rentalStatusKey,
  STATUS_TONE,
  statusKey,
} from './labels';
import { PlateBadge } from './vehicle-row';

const actorName = (a: { name: string; surname: string; email: string } | null | undefined) =>
  a ? `${a.name} ${a.surname}`.trim() || a.email : null;

/** "Aracın kartı": what a field user needs at the car, in the panel's order. */
export function VehicleScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const query = useVehicle(uuid);
  const refresh = useRefreshVehicle(uuid);
  const [refreshing, setRefreshing] = useState(false);
  const notFound = isApiError(query.error) && query.error.status === 404;

  return (
    <>
      <Stack.Screen options={{ title: query.data?.plate ?? t('vehicles:detail_title') }} />
      {notFound && !query.data ? (
        <EmptyState icon="car" title={t('not_found_title')} body={t('vehicles:not_found')} />
      ) : (
        <Screen
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh().finally(() => setRefreshing(false));
              }}
            />
          }>
          <QueryState query={query}>{(vehicle) => <VehicleCard vehicle={vehicle} />}</QueryState>
        </Screen>
      )}
    </>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const can = useCan();
  const canWrite = can(Permission.TenantVehiclesWrite);
  const canBlock = can(Permission.TenantBlocksWrite);
  const uuid = vehicle.uuid;
  return (
    <>
      <Card>
        <View className="flex-row items-start gap-3">
          <PlateBadge plate={vehicle.plate} large />
          <View className="flex-1" />
          <StatusPill label={t(statusKey(vehicle.status))} tone={STATUS_TONE[vehicle.status]} />
        </View>
        <View className="gap-0.5">
          <Text variant="headline">{vehicle.label || vehicle.plate}</Text>
          <Text variant="footnote" tone="muted">
            {[
              [vehicle.brand, vehicle.model, vehicle.type_name].filter(Boolean).join(' · ') || '—',
              vehicle.model_year,
              vehicle.color,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {vehicle.manual_entry ? <StatusPill label={t('vehicles:manual_badge')} /> : null}
          {!vehicle.in_service ? <StatusPill label={t('vehicles:not_in_service')} tone="problem" /> : null}
          {!vehicle.is_active ? <StatusPill label={t('inactive')} tone="problem" /> : null}
        </View>
        <View className="gap-1.5">
          <Fact icon="location" label={t('vehicles:header.current_branch')} value={vehicle.current_branch.name} />
          {vehicle.home_branch.uuid !== vehicle.current_branch.uuid ? (
            <Fact icon="building" label={t('vehicles:header.home_branch')} value={vehicle.home_branch.name} />
          ) : null}
          <Fact
            icon="gauge"
            label={t('vehicles:fields.odometer_km')}
            value={`${formatNumber(vehicle.odometer_km)} km${vehicle.fuel_level != null ? ` · ${t('fuel', { value: vehicle.fuel_level })}` : ''}`}
          />
          <Fact icon="clock" label={t('status_since')} value={formatRelative(vehicle.status_changed_at)} />
        </View>
      </Card>

      {canWrite || canBlock ? (
        <View className="flex-row flex-wrap gap-2">
          {canWrite ? (
            <Button
              title={t('vehicles:actions.change_status')}
              icon="refresh"
              variant="secondary"
              onPress={() => router.push(`/vehicle/${uuid}/status`)}
            />
          ) : null}
          {canBlock ? (
            <Button
              title={t('vehicle_blocks:actions.start_maintenance')}
              icon="wrench"
              variant="secondary"
              onPress={() => router.push({ pathname: '/vehicle/[uuid]/block', params: { uuid, quick: '1' } })}
            />
          ) : null}
          {canWrite ? (
            <Button
              title={t('vehicles:actions.edit')}
              icon="edit"
              variant="outline"
              onPress={() => router.push(`/vehicle/${uuid}/edit`)}
            />
          ) : null}
        </View>
      ) : null}

      <ActiveBlockBanner uuid={uuid} />
      <OpenRental uuid={uuid} />
      <Expiry vehicle={vehicle} />
      <Documents uuid={uuid} />
      <Maintenance uuid={uuid} />
      <Blocks uuid={uuid} />
      <Kasko vehicle={vehicle} />
      <History uuid={uuid} />
    </>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: 'location' | 'building' | 'gauge' | 'clock';
  label: string;
  value: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name={icon} tone="muted-foreground" size={16} />
      <Text variant="footnote" tone="muted">
        {label}:
      </Text>
      <Text variant="footnote" className="flex-1 font-sans-medium" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** The block covering now, as on the panel's summary tab. */
function ActiveBlockBanner({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const blocks = useVehicleBlocks(uuid);
  const block = blocks.data?.items.find((b) => b.state === 'active');
  if (!block) return null;
  return (
    <View className="gap-1 rounded-lg border border-destructive bg-destructive/10 p-4">
      <Text variant="headline" tone="danger">
        {t('vehicles:summary.active_block', { kind: t(blockKindKey(block.kind)) })}
      </Text>
      <Text variant="footnote">
        {formatShort(block.starts_at)} – {block.ends_at ? formatShort(block.ends_at) : t('vehicle_blocks:open_ended')}
        {block.reason ? ` · ${block.reason}` : ''}
      </Text>
    </View>
  );
}

/** The rental holding the vehicle now; opens the rental summary (`/rentals/[uuid]`). */
function OpenRental({ uuid }: { uuid: string }) {
  const { t } = useTranslation('vehicles_app');
  const can = useCan();
  const rental = useOpenRental(uuid);
  if (!can(Permission.TenantRentalsRead) || !rental.data) return null;
  const r = rental.data;
  return (
    <View>
      <SectionHeader title={t('open_rental')} />
      <Card onPress={() => router.push(`/rentals/${r.uuid}` as Href)}>
        <View className="flex-row items-center gap-2">
          <Text variant="headline" className="flex-1">
            {r.reference}
          </Text>
          <StatusPill label={t(rentalStatusKey(r.status))} tone={r.overdue_at ? 'problem' : 'progress'} />
        </View>
        <Text>{r.customer.display_name}</Text>
        <Text variant="footnote" tone="muted">
          {t('rental_window', {
            from: formatShort(r.actual_pickup_at ?? r.planned_pickup_at),
            to: formatShort(r.planned_return_at),
            branch: r.return_branch.name,
          })}
        </Text>
        {r.overdue_at ? (
          <Text variant="footnote" tone="danger">
            {t('rental_overdue', { since: formatRelative(r.overdue_at) })}
          </Text>
        ) : null}
      </Card>
    </View>
  );
}

/** Next document expiries and maintenance (the panel's summary cards). */
function Expiry({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const day = (d: string | null) => (d ? formatCalendarDate(d) : t('vehicles:summary.no_document'));
  const next = vehicle.next_maintenance_date
    ? `${formatCalendarDate(vehicle.next_maintenance_date)}${vehicle.next_maintenance_km != null ? ` · ${formatNumber(vehicle.next_maintenance_km)} km` : ''}`
    : vehicle.next_maintenance_km != null
      ? `${formatNumber(vehicle.next_maintenance_km)} km`
      : t('vehicles:summary.no_plan');
  return (
    <List>
      <ListRow icon="security" title={t('vehicles:summary.inspection')} subtitle={day(vehicle.inspection_until)} />
      <ListRow icon="security" title={t('vehicles:summary.insurance')} subtitle={day(vehicle.insurance_until)} />
      <ListRow icon="security" title={t('vehicles:summary.kasko_policy')} subtitle={day(vehicle.kasko_until)} />
      <ListRow
        icon="wrench"
        title={t('vehicles:summary.maintenance')}
        subtitle={next}
        trailing={
          vehicle.maintenance_status !== 'none' ? (
            <StatusPill
              label={t(maintenanceStatusKey(vehicle.maintenance_status))}
              tone={MAINTENANCE_STATUS_TONE[vehicle.maintenance_status]}
            />
          ) : undefined
        }
        last
      />
    </List>
  );
}

function Documents({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicle_records']);
  const can = useCan();
  const docs = useVehicleDocuments(uuid);
  const [opening, setOpening] = useState<string | null>(null);
  const download = can(Permission.TenantDocumentDownload);
  const open = async (d: VehicleDocument) => {
    setOpening(d.uuid);
    try {
      await openDocumentFile(uuid, d);
    } catch (e) {
      toast.error(isApiError(e) ? apiErrorMessage(e) : t('vehicle_records:toast.download_failed'));
    } finally {
      setOpening(null);
    }
  };
  return (
    <View>
      <SectionHeader title={t('vehicle_records:documents.title')} />
      <QueryState query={docs} rows={2}>
        {(data) => {
          // Current document of each type; the history stays on the panel.
          const items = data.items.filter((d) => d.is_current);
          if (!items.length) return <EmptyState icon="document" title={t('vehicle_records:documents.empty_title')} />;
          return (
            <List>
              {items.map((d, i) => (
                <ListRow
                  key={d.uuid}
                  icon="document"
                  title={t(docTypeKey(d.doc_type))}
                  subtitle={[
                    d.document_number,
                    d.valid_until ? t('valid_until', { date: formatCalendarDate(d.valid_until) }) : null,
                    d.file && download ? (opening === d.uuid ? t('common:loading') : t('open_file')) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  trailing={<StatusPill label={t(docStatusKey(d.status))} tone={DOC_STATUS_TONE[d.status]} />}
                  onPress={d.file && download && !opening ? () => void open(d) : undefined}
                  last={i === items.length - 1}
                />
              ))}
            </List>
          );
        }}
      </QueryState>
    </View>
  );
}

function Maintenance({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicle_records']);
  const can = useCan();
  const items = useVehicleMaintenance(uuid);
  const canWrite = can(Permission.TenantVehiclesWrite);
  return (
    <View>
      <SectionHeader title={t('vehicle_records:maintenance.title')} />
      <PlanMaintenanceButton vehicle={uuid} />
      <QueryState query={items} rows={2}>
        {(data) => {
          // Open plans first (the API's order), then the three latest done.
          const plans = data.items.filter((m) => m.kind === 'planned');
          const done = data.items.filter((m) => m.kind === 'done').slice(0, 3);
          const rows = [...plans, ...done];
          if (!rows.length) return <EmptyState icon="wrench" title={t('vehicle_records:maintenance.empty_title')} />;
          return (
            <List>
              {rows.map((m, i) => {
                const target =
                  m.kind === 'planned'
                    ? [
                        m.planned_date ? formatCalendarDate(m.planned_date) : null,
                        m.planned_km != null ? `${formatNumber(m.planned_km)} km` : null,
                      ]
                    : [
                        m.done_date ? formatCalendarDate(m.done_date) : null,
                        m.done_km != null ? `${formatNumber(m.done_km)} km` : null,
                        m.cost ? formatMoney(m.cost, m.currency) : null,
                      ];
                return (
                  <View key={m.uuid}>
                    <ListRow
                      icon="wrench"
                      title={t(maintenanceTypeKey(m.maintenance_type))}
                      subtitle={[...target, m.service_provider].filter(Boolean).join(' · ')}
                      trailing={
                        <StatusPill
                          label={t(maintenanceStatusKey(m.status))}
                          tone={MAINTENANCE_STATUS_TONE[m.status]}
                        />
                      }
                      last={i === rows.length - 1 && !(m.kind === 'planned' && canWrite)}
                    />
                    {m.kind === 'planned' && canWrite ? (
                      <View className={i === rows.length - 1 ? 'px-4 py-2' : 'border-b border-border px-4 py-2'}>
                        <Button
                          title={t('vehicle_records:maintenance.complete')}
                          icon="check"
                          variant="outline"
                          onPress={() => router.push(`/vehicle/${uuid}/maintenance/${m.uuid}`)}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </List>
          );
        }}
      </QueryState>
    </View>
  );
}

/** "Engeli kapat" with the panel's "make the vehicle available again" choice. */
function confirmRelease(t: (k: string) => string, block: VehicleBlock, run: (syncStatus: boolean) => void) {
  const syncable = STATUS_SYNC_KINDS.includes(block.kind);
  if (Platform.OS === 'web') {
    run(syncable);
    return;
  }
  Alert.alert(t('vehicle_blocks:dialog.release_title'), t('vehicle_blocks:dialog.release_description'), [
    { text: t('common:cancel'), style: 'cancel' },
    ...(syncable
      ? [
          { text: t('release_only'), onPress: () => run(false) },
          { text: t('vehicle_blocks:fields.release_sync_status'), onPress: () => run(true) },
        ]
      : [{ text: t('vehicle_blocks:actions.release'), onPress: () => run(false) }]),
  ]);
}

function Blocks({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicle_blocks']);
  const can = useCan();
  const blocks = useVehicleBlocks(uuid);
  const release = useReleaseBlock(uuid);
  if (!can(Permission.TenantBlocksRead)) return null;
  const canWrite = can(Permission.TenantBlocksWrite);
  return (
    <View>
      <SectionHeader title={t('vehicle_blocks:title')} />
      <QueryState query={blocks} rows={2}>
        {(data) => (
          <>
            {data.items.length ? (
              <List>
                {data.items.slice(0, 5).map((b, i, all) => (
                  <View key={b.uuid}>
                    <ListRow
                      icon="cancel"
                      title={t(blockKindKey(b.kind))}
                      subtitle={[
                        `${formatShort(b.starts_at)} – ${b.ends_at ? formatShort(b.ends_at) : t('vehicle_blocks:open_ended')}`,
                        b.reason,
                        actorName(b.created_by),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      trailing={<StatusPill label={t(blockStateKey(b.state))} tone={BLOCK_STATE_TONE[b.state]} />}
                      last={i === all.length - 1 && !(canWrite && b.state === 'active')}
                    />
                    {canWrite && b.state === 'active' ? (
                      <View className={i === all.length - 1 ? 'px-4 py-2' : 'border-b border-border px-4 py-2'}>
                        <Button
                          title={t('vehicle_blocks:actions.release')}
                          icon="check"
                          variant="outline"
                          loading={release.isPending && release.variables?.blockUuid === b.uuid}
                          onPress={() =>
                            confirmRelease(t, b, (syncStatus) =>
                              release.mutate(
                                { blockUuid: b.uuid, syncStatus },
                                {
                                  onSuccess: () => toast.success(t('vehicle_blocks:toast.released')),
                                  onError: (e) => toast.error(apiErrorMessage(e)),
                                },
                              ),
                            )
                          }
                        />
                      </View>
                    ) : null}
                  </View>
                ))}
              </List>
            ) : (
              <EmptyState icon="cancel" title={t('vehicle_blocks:empty_title')} />
            )}
            {canWrite ? (
              <Button
                title={t('vehicle_blocks:actions.create')}
                icon="add"
                variant="ghost"
                className="mt-2"
                onPress={() => router.push(`/vehicle/${uuid}/block`)}
              />
            ) : null}
          </>
        )}
      </QueryState>
    </View>
  );
}

function Kasko({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const kasko = useVehicleKasko(vehicle.uuid);
  if (vehicle.manual_entry) return null;
  const items = kasko.data?.items.slice(0, 6) ?? [];
  return (
    <View>
      <SectionHeader title={t('vehicles:detail.kasko')} />
      <Card>
        <Text variant="figure">{vehicle.kasko_value ? formatMoney(vehicle.kasko_value) : '—'}</Text>
        <Text variant="footnote" tone="muted">
          {vehicle.kasko_period
            ? t('vehicles:kasko.period', { period: vehicle.kasko_period })
            : t('vehicles:kasko.none')}
        </Text>
        {items.length > 1 ? (
          <View className="gap-1 border-t border-border pt-3">
            {items.map((v) => (
              <View key={v.period} className="flex-row">
                <Text variant="footnote" tone="muted" className="flex-1 tabular-nums">
                  {v.period}
                </Text>
                <Text variant="footnote" className="tabular-nums">
                  {formatMoney(v.value)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    </View>
  );
}

/** The three latest status changes, then the full history and activity on their own screen. */
function History({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const events = useVehicleEvents(uuid, 3);
  const items = events.data?.pages[0]?.items ?? [];
  return (
    <View>
      <SectionHeader title={t('vehicles:tabs.history')} />
      <List>
        {items.map((e) => (
          <ListRow
            key={e.uuid}
            icon="history"
            title={
              e.event_type === 'created'
                ? t('vehicles:events.created')
                : `${e.from_status ? `${t(statusKey(e.from_status))} → ` : ''}${t(statusKey(e.to_status))}`
            }
            subtitle={[formatShort(e.created_at), actorName(e.actor) ?? t('vehicles:events.system_actor'), e.note]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
        <ListRow icon="history" title={t('history_all')} onPress={() => router.push(`/vehicle/${uuid}/history`)} last />
      </List>
    </View>
  );
}
