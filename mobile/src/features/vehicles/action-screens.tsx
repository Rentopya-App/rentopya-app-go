import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { displayTimeZone, localDate } from '@/core/format';
import { dayTimes, zonedIso } from '@/core/zoned';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';
import { toast } from '@/ui/toast';

import {
  useChangeStatus,
  useCompleteMaintenance,
  useCreateBlock,
  useVehicle,
  useVehicleMaintenance,
  type Vehicle,
  type VehicleMaintenance,
} from './api';
import {
  BLOCK_KINDS,
  blockRequest,
  canSyncStatus,
  completeRequest,
  validateBlock,
  validateComplete,
  statusRequest,
  validateStatus,
  VEHICLE_STATUSES,
  type BlockKind,
  type BlockValues,
  type CompleteValues,
  type Errors,
  type StatusValues,
} from './forms';
import { blockKindKey, maintenanceTypeKey, statusKey } from './labels';

/** Client errors (i18n keys) win over the API's field messages; the rest goes above the button. */
function useErrors(local: Errors, error: unknown) {
  const { t } = useTranslation();
  const api = formErrors(error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);
  return { field, message: api.message };
}

function Footer({ message, ...button }: { message?: string } & React.ComponentProps<typeof Button>) {
  return (
    <>
      {message ? (
        <Text variant="footnote" tone="danger">
          {message}
        </Text>
      ) : null}
      <Button size="lg" {...button} />
    </>
  );
}

/** Screens of one vehicle that need it loaded and a permission. */
function WithVehicle({
  uuid,
  perm,
  children,
}: {
  uuid: string;
  perm: Parameters<ReturnType<typeof useCan>>[0];
  children: (v: Vehicle) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const vehicle = useVehicle(uuid);
  if (!can(perm)) return <EmptyState icon="security" title={t('forbidden')} />;
  return (
    <View className="flex-1 bg-background">
      <QueryState query={vehicle}>{children}</QueryState>
    </View>
  );
}

// --- status ------------------------------------------------------------------

/** "Durum değiştir": the new status with the km / fuel reading and a note, recorded in the history. */
export function StatusScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation('vehicles');
  return (
    <>
      <Stack.Screen options={{ title: t('status_dialog.title') }} />
      <WithVehicle uuid={uuid} perm={Permission.TenantVehiclesWrite}>
        {(v) => <StatusForm vehicle={v} />}
      </WithVehicle>
    </>
  );
}

function StatusForm({ vehicle }: { vehicle: Vehicle }) {
  const { t } = useTranslation(['vehicles', 'vehicles_app']);
  const change = useChangeStatus(vehicle.uuid);
  const [v, setV] = useState<StatusValues>({
    status: vehicle.status,
    odometer_km: String(vehicle.odometer_km),
    fuel_level: vehicle.fuel_level != null ? String(vehicle.fuel_level) : '',
    note: '',
  });
  const [local, setLocal] = useState<Errors>({});
  const err = useErrors(local, change.error);
  const set = (patch: Partial<StatusValues>) => setV((s) => ({ ...s, ...patch }));
  const submit = () => {
    const e = validateStatus(v);
    setLocal(e);
    if (Object.keys(e).length) return;
    change.mutate(statusRequest(v), {
      onSuccess: () => {
        toast.success(t('toast.status_changed'));
        router.back();
      },
    });
  };
  return (
    <FormScreen
      footer={
        <Footer message={err.message} title={t('status_dialog.submit')} loading={change.isPending} onPress={submit} />
      }>
      <Text tone="muted">{t('status_dialog.description', { plate: vehicle.plate })}</Text>
      <Select
        label={t('fields.status')}
        value={v.status}
        options={VEHICLE_STATUSES.map((s) => ({ value: s, label: t(statusKey(s)) }))}
        onChange={(status) => set({ status })}
        error={err.field('status')}
      />
      <Input
        label={t('fields.odometer_km')}
        value={v.odometer_km}
        onChangeText={(odometer_km) => set({ odometer_km })}
        keyboardType="number-pad"
        error={err.field('odometer_km')}
      />
      <Input
        label={t('fields.fuel_level')}
        value={v.fuel_level}
        onChangeText={(fuel_level) => set({ fuel_level })}
        keyboardType="number-pad"
        error={err.field('fuel_level')}
      />
      <TextArea
        label={t('fields.note')}
        value={v.note}
        onChangeText={(note) => set({ note })}
        maxLength={2000}
        error={err.field('note')}
      />
    </FormScreen>
  );
}

// --- maintenance completion --------------------------------------------------

/** "Bakımı tamamla": the plan becomes a done record (same row). */
export function CompleteMaintenanceScreen({ uuid, itemUuid }: { uuid: string; itemUuid: string }) {
  const { t } = useTranslation('vehicle_records');
  const items = useVehicleMaintenance(uuid);
  const can = useCan();
  return (
    <>
      <Stack.Screen options={{ title: t('maintenance.complete_title') }} />
      {!can(Permission.TenantVehiclesWrite) ? (
        <EmptyState icon="security" title={t('common:forbidden')} />
      ) : (
        <View className="flex-1 bg-background">
          <QueryState query={items}>
            {(data) => {
              const item = data.items.find((m) => m.uuid === itemUuid && m.kind === 'planned');
              return item ? (
                <CompleteForm uuid={uuid} item={item} />
              ) : (
                <EmptyState icon="wrench" title={t('vehicles_app:maintenance_gone')} />
              );
            }}
          </QueryState>
        </View>
      )}
    </>
  );
}

function CompleteForm({ uuid, item }: { uuid: string; item: VehicleMaintenance }) {
  const { t } = useTranslation('vehicle_records');
  const complete = useCompleteMaintenance(uuid);
  const today = localDate(new Date());
  const [v, setV] = useState<CompleteValues>({
    done_date: today,
    done_km: item.planned_km != null ? String(item.planned_km) : '',
    service_provider: item.service_provider,
    cost: item.cost ?? '',
    note: item.note,
  });
  const [local, setLocal] = useState<Errors>({});
  const err = useErrors(local, complete.error);
  const set = (patch: Partial<CompleteValues>) => setV((s) => ({ ...s, ...patch }));
  const submit = () => {
    const e = validateComplete(v, today);
    setLocal(e);
    if (Object.keys(e).length) return;
    complete.mutate(
      { itemUuid: item.uuid, body: completeRequest(v) },
      {
        onSuccess: () => {
          toast.success(t('toast.maintenance_completed'));
          router.back();
        },
      },
    );
  };
  return (
    <FormScreen
      footer={
        <Footer message={err.message} title={t('maintenance.complete')} loading={complete.isPending} onPress={submit} />
      }>
      <Text variant="headline">{t(maintenanceTypeKey(item.maintenance_type))}</Text>
      <Text tone="muted">{t('maintenance.complete_description')}</Text>
      <DateField
        label={t('fields.done_date')}
        value={v.done_date}
        max={today}
        onChange={(done_date) => set({ done_date })}
        error={err.field('done_date')}
      />
      <Input
        label={t('fields.done_km')}
        value={v.done_km}
        onChangeText={(done_km) => set({ done_km })}
        keyboardType="number-pad"
        error={err.field('done_km')}
      />
      <Input
        label={t('fields.service_provider')}
        value={v.service_provider}
        onChangeText={(service_provider) => set({ service_provider })}
        maxLength={255}
        error={err.field('service_provider')}
      />
      <Input
        label={t('fields.cost')}
        value={v.cost}
        onChangeText={(cost) => set({ cost })}
        keyboardType="decimal-pad"
        error={err.field('cost')}
      />
      <TextArea
        label={t('fields.note')}
        value={v.note}
        onChangeText={(note) => set({ note })}
        maxLength={2000}
        error={err.field('note')}
      />
    </FormScreen>
  );
}

// --- blocks ------------------------------------------------------------------

const TIMES = dayTimes(0, 23, 30);

/** A day and a time of day in the organization zone, or empty. */
function InstantField({
  label,
  placeholder,
  value,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  value: { day: string; time: string } | null;
  onChange: (v: { day: string; time: string } | null) => void;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <DateField
        label={label}
        value={value?.day}
        placeholder={placeholder}
        onChange={(day) => onChange({ day, time: value?.time ?? '09:00' })}
        onClear={() => onChange(null)}
        error={error}
      />
      {value ? <TimeStrip value={value.time} times={TIMES} onChange={(time) => onChange({ ...value, time })} /> : null}
    </View>
  );
}

/** "Engel ekle" / "Bakıma al" (`quick`: maintenance from now, open-ended, only the reason). */
export function BlockScreen({ uuid, quick }: { uuid: string; quick: boolean }) {
  const { t } = useTranslation('vehicle_blocks');
  return (
    <>
      <Stack.Screen options={{ title: quick ? t('dialog.maintenance_title') : t('dialog.create_title') }} />
      <WithVehicle uuid={uuid} perm={Permission.TenantBlocksWrite}>
        {(v) => <BlockForm vehicle={v} quick={quick} />}
      </WithVehicle>
    </>
  );
}

function BlockForm({ vehicle, quick }: { vehicle: Vehicle; quick: boolean }) {
  const { t } = useTranslation(['vehicle_blocks', 'vehicles_app']);
  const create = useCreateBlock(vehicle.uuid);
  const [kind, setKind] = useState<BlockKind>('maintenance');
  const [start, setStart] = useState<{ day: string; time: string } | null>(null);
  const [end, setEnd] = useState<{ day: string; time: string } | null>(null);
  const [reason, setReason] = useState('');
  const [sync, setSync] = useState(true);
  const [local, setLocal] = useState<Errors>({});
  const err = useErrors(local, create.error);
  const zone = displayTimeZone();
  const values: BlockValues = {
    kind,
    starts_at: start ? zonedIso(start.day, start.time, zone) : '',
    ends_at: end ? zonedIso(end.day, end.time, zone) : '',
    reason,
    sync_status: sync,
  };
  const syncable = canSyncStatus(kind, values.starts_at, new Date());

  const submit = () => {
    const now = new Date();
    const e = validateBlock(values, now);
    setLocal(e);
    if (Object.keys(e).length) return;
    create.mutate(blockRequest(values, now), {
      onSuccess: (r) => {
        toast.success(r.status_changed ? t('toast.created_with_status') : t('toast.created'));
        router.back();
      },
    });
  };

  return (
    <FormScreen
      footer={
        <Footer
          // An overlap answers 409 with a `block` field detail.
          message={err.message ?? err.field('block')}
          title={quick ? t('actions.start_maintenance') : t('actions.save')}
          loading={create.isPending}
          onPress={submit}
        />
      }>
      <Text tone="muted">{quick ? t('dialog.maintenance_description') : t('dialog.description')}</Text>
      {quick ? null : (
        <>
          <View className="gap-2">
            <Text variant="footnote" tone="muted" className="font-sans-medium">
              {t('fields.kind')}
            </Text>
            <Chips
              options={BLOCK_KINDS.map((k) => ({ value: k, label: t(blockKindKey(k)) }))}
              value={kind}
              onChange={setKind}
            />
          </View>
          <InstantField
            label={t('fields.starts_at')}
            placeholder={t('fields.starts_now')}
            value={start}
            onChange={setStart}
            error={err.field('starts_at')}
          />
          <InstantField
            label={t('fields.ends_at')}
            placeholder={t('open_ended')}
            value={end}
            onChange={setEnd}
            error={err.field('ends_at')}
          />
        </>
      )}
      <TextArea
        label={t('fields.reason')}
        value={reason}
        onChangeText={setReason}
        maxLength={2000}
        error={err.field('reason')}
      />
      {syncable ? (
        <SwitchRow
          label={t('fields.sync_status')}
          description={t('fields.sync_status_hint')}
          value={sync}
          onChange={setSync}
        />
      ) : null}
    </FormScreen>
  );
}
