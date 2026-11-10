import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatNumber, localDate } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { MAINTENANCE_STATUS_TONE, maintenanceStatusKey, maintenanceTypeKey } from '@/features/vehicles/labels';
import { PlateBadge } from '@/features/vehicles/vehicle-row';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { PagedList } from '@/ui/paged-list';
import { FormScreen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useCreateMaintenance, useUpcomingMaintenance, type Vehicle } from './api';
import {
  MAINTENANCE_TYPES,
  maintenanceDefaults,
  maintenanceLeft,
  maintenanceRequest,
  validateMaintenance,
  type Errors,
  type MaintenanceKind,
  type MaintenanceType,
  type MaintenanceValues,
} from './model';
import { VehiclePicker } from './vehicle-picker';

/**
 * "Yaklaşan bakımlar": active vehicles by their next planned maintenance
 * (soonest first, vehicles without a plan last), with the branch filter.
 * A row opens the vehicle card, where plans are completed.
 */
export function UpcomingMaintenanceScreen() {
  const { t } = useTranslation(['fleet_ops_app', 'vehicle_records']);
  const can = useCan();
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const query = useUpcomingMaintenance({ q: search, branch: branch.branchUuid });
  const today = localDate(new Date());
  const readable = can(Permission.TenantVehiclesRead);

  return (
    <>
      <Stack.Screen
        options={{
          title: t('upcoming_title'),
          headerRight: () =>
            can(Permission.TenantVehiclesWrite) ? (
              <HeaderButton
                icon="add"
                label={t('vehicle_records:maintenance.plan')}
                onPress={() => router.push('/fleet/maintenance/new')}
              />
            ) : null,
        }}
      />
      {readable ? (
        <PagedList
          query={query}
          keyOf={(v) => v.uuid}
          empty={search.trim() ? t('vehicles:empty_filtered_title') : t('upcoming_empty')}
          header={
            <>
              <Text variant="footnote" tone="muted">
                {t('upcoming_hint')}
              </Text>
              <SearchField value={q} onChangeText={setQ} placeholder={t('plate_search')} />
              {branch.branch ? (
                <Text variant="footnote" tone="muted" className="px-1">
                  {t('branch_filter_current', { name: branch.branch.name })}
                </Text>
              ) : null}
            </>
          }
          renderItem={(v, _i, last) => <UpcomingRow vehicle={v} today={today} last={last} />}
        />
      ) : (
        <EmptyState icon="security" title={t('vehicle_records:alerts.forbidden')} />
      )}
    </>
  );
}

function UpcomingRow({ vehicle, today, last }: { vehicle: Vehicle; today: string; last: boolean }) {
  const { t } = useTranslation(['fleet_ops_app', 'vehicle_records']);
  const planned = vehicle.maintenance_status !== 'none';
  const left = maintenanceLeft(vehicle, today);
  const target = [
    vehicle.next_maintenance_date ? formatCalendarDate(vehicle.next_maintenance_date) : null,
    vehicle.next_maintenance_km != null ? `${formatNumber(vehicle.next_maintenance_km)} km` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const remaining = [
    left.days == null
      ? null
      : left.days === 0
        ? t('vehicle_records:days_today')
        : left.days > 0
          ? t('vehicle_records:days_left', { count: left.days })
          : t('vehicle_records:days_overdue', { count: -left.days }),
    left.km == null
      ? null
      : left.km > 0
        ? t('vehicle_records:km_left', { count: left.km })
        : t('vehicle_records:km_overdue', { count: -left.km }),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${vehicle.plate}, ${target || t('vehicle_records:vehicle_maintenance.none')}`}
      onPress={() => router.push(`/vehicle/${vehicle.uuid}`)}
      className={cn('gap-2 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-3">
        <PlateBadge plate={vehicle.plate} />
        <View className="flex-1" />
        <StatusPill
          label={
            planned
              ? t(maintenanceStatusKey(vehicle.maintenance_status))
              : t('vehicle_records:vehicle_maintenance.none')
          }
          tone={planned ? MAINTENANCE_STATUS_TONE[vehicle.maintenance_status] : 'neutral'}
        />
      </View>
      <Text variant="callout" numberOfLines={1}>
        {vehicle.label || [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'}
      </Text>
      {planned ? (
        <View className="flex-row items-center gap-2">
          <Icon name="wrench" tone="muted-foreground" size={14} />
          <Text variant="footnote" tone="muted" className="flex-1" numberOfLines={1}>
            {target}
          </Text>
          <Text
            variant="footnote"
            tone={vehicle.maintenance_status === 'overdue' ? 'danger' : 'muted'}
            className="tabular-nums">
            {remaining}
          </Text>
        </View>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Icon name="location" tone="muted-foreground" size={14} />
        <Text variant="footnote" tone="muted" className="flex-1" numberOfLines={1}>
          {vehicle.current_branch.name} · {formatNumber(vehicle.odometer_km)} km
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * "Bakım planla" / "Yapılan bakım ekle" (the panel's maintenance dialog):
 * a plan with a date and / or km target, or a done record with its date,
 * km and cost. Opened from the alerts, the upcoming list or the vehicle card
 * (`vehicle` fixed then).
 */
export function NewMaintenanceScreen({ vehicle, kind }: { vehicle?: string; kind?: string }) {
  const { t } = useTranslation('vehicle_records');
  const can = useCan();
  return (
    <>
      <Stack.Screen options={{ title: t('fleet_ops_app:new_maintenance_title') }} />
      {can(Permission.TenantVehiclesWrite) ? (
        <MaintenanceForm vehicle={vehicle} initialKind={kind === 'done' ? 'done' : 'planned'} />
      ) : (
        <EmptyState icon="security" title={t('common:forbidden')} />
      )}
    </>
  );
}

function MaintenanceForm({ vehicle, initialKind }: { vehicle?: string; initialKind: MaintenanceKind }) {
  const { t } = useTranslation(['vehicle_records', 'fleet_ops_app']);
  const create = useCreateMaintenance();
  const today = localDate(new Date());
  const [vehicleUuid, setVehicleUuid] = useState(vehicle ?? '');
  const [v, setV] = useState<MaintenanceValues>(() => maintenanceDefaults(initialKind, today));
  const [local, setLocal] = useState<Errors>({});
  const api = formErrors(create.error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);
  const set = (patch: Partial<MaintenanceValues>) => setV((s) => ({ ...s, ...patch }));
  const setKind = (kind: MaintenanceKind) =>
    set({ kind, done_date: kind === 'done' ? v.done_date || today : v.done_date });

  const submit = () => {
    const e = validateMaintenance(v, today);
    if (!vehicleUuid) e.vehicle = 'vehicle_records:validation.required';
    setLocal(e);
    if (Object.keys(e).length) return;
    create.mutate(
      { vehicleUuid, body: maintenanceRequest(v) },
      {
        onSuccess: () => {
          toast.success(t('toast.maintenance_created'));
          router.back();
        },
      },
    );
  };

  return (
    <FormScreen
      footer={
        <>
          {api.message ? (
            <Text variant="footnote" tone="danger">
              {api.message}
            </Text>
          ) : null}
          <Button size="lg" title={t('save')} loading={create.isPending} onPress={submit} />
        </>
      }>
      <Chips<MaintenanceKind>
        options={[
          { value: 'planned', label: t('maintenance.plan') },
          { value: 'done', label: t('maintenance.record') },
        ]}
        value={v.kind}
        onChange={setKind}
      />
      <Text tone="muted">
        {v.kind === 'planned' ? t('maintenance.plan_description') : t('maintenance.record_description')}
      </Text>
      <VehiclePicker
        label={t('fleet_ops_app:vehicle')}
        value={vehicleUuid}
        onChange={setVehicleUuid}
        disabled={!!vehicle}
        error={field('vehicle')}
      />
      <Select<MaintenanceType>
        label={t('fields.maintenance_type')}
        value={v.maintenance_type}
        options={MAINTENANCE_TYPES.map((m) => ({ value: m, label: t(maintenanceTypeKey(m)) }))}
        onChange={(maintenance_type) => set({ maintenance_type })}
        error={field('maintenance_type')}
      />
      <DateField
        label={t('fields.planned_date')}
        value={v.planned_date || null}
        placeholder={t('fleet_ops_app:optional_date')}
        onChange={(planned_date) => set({ planned_date })}
        onClear={() => set({ planned_date: '' })}
        error={field('planned_date')}
      />
      <Input
        label={t('fields.planned_km')}
        value={v.planned_km}
        onChangeText={(planned_km) => set({ planned_km })}
        keyboardType="number-pad"
        error={field('planned_km')}
      />
      {v.kind === 'done' ? (
        <>
          <DateField
            label={t('fields.done_date')}
            value={v.done_date}
            max={today}
            onChange={(done_date) => set({ done_date })}
            error={field('done_date')}
          />
          <Input
            label={t('fields.done_km')}
            value={v.done_km}
            onChangeText={(done_km) => set({ done_km })}
            keyboardType="number-pad"
            error={field('done_km')}
          />
        </>
      ) : null}
      <Input
        label={t('fields.service_provider')}
        value={v.service_provider}
        onChangeText={(service_provider) => set({ service_provider })}
        maxLength={255}
        error={field('service_provider')}
      />
      <Input
        label={t('fields.cost')}
        value={v.cost}
        onChangeText={(cost) => set({ cost })}
        keyboardType="decimal-pad"
        error={field('cost')}
      />
      <TextArea
        label={t('fields.note')}
        value={v.note}
        onChangeText={(note) => set({ note })}
        maxLength={2000}
        error={field('note')}
      />
    </FormScreen>
  );
}

/** "Bakım planla" on the vehicle card (`tenant.vehicles.write`). */
export function PlanMaintenanceButton({ vehicle }: { vehicle: string }) {
  const { t } = useTranslation('vehicle_records');
  const can = useCan();
  if (!can(Permission.TenantVehiclesWrite)) return null;
  return (
    <View className="pb-2">
      <Button
        title={t('maintenance.plan')}
        icon="add"
        variant="outline"
        onPress={() => router.push({ pathname: '/fleet/maintenance/new', params: { vehicle } })}
      />
    </View>
  );
}
