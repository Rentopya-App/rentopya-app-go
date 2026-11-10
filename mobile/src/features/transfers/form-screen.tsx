import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Can, Permission } from '@/core/auth/permissions';
import { displayTimeZone } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { dayTimes } from '@/core/zoned';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { OptionSheet, Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';
import { toast } from '@/ui/toast';

import { useCreateTransfer, useTransfer, useTransferAssignees, useUpdateTransfer, useVehicleOptions } from './api';
import {
  createRequest,
  instantIso,
  instantOf,
  isStarted,
  patchRequest,
  personName,
  validateTransfer,
  type Errors,
  type Instant,
  type Transfer,
  type TransferValues,
} from './lib';

const TIMES = dayTimes(0, 23, 30);
/** Select values for "no choice" (an empty value reads as unset). */
const AUTO = '__auto__';
const NONE = '__none__';

/** A day and a time of day in the organization zone. */
export function InstantField({
  label,
  placeholder,
  value,
  onChange,
  onClear,
  error,
  disabled,
}: {
  label: string;
  placeholder?: string;
  value: Instant | null;
  onChange: (v: Instant) => void;
  onClear?: () => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <View className="gap-2">
      <DateField
        label={label}
        value={value?.day}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(day) => onChange({ day, time: value?.time ?? '09:00' })}
        onClear={onClear}
        error={error}
      />
      {value && !disabled ? (
        <TimeStrip value={value.time} times={TIMES} onChange={(time) => onChange({ ...value, time })} />
      ) : null}
    </View>
  );
}

/** Active vehicle by plate, searched on the server (the panel's async combobox). */
function VehiclePicker({
  value,
  onChange,
  error,
}: {
  value: { uuid: string; label: string; description: string } | null;
  onChange: (v: { uuid: string; label: string; description: string }) => void;
  error?: string;
}) {
  const { t } = useTranslation('transfers');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const vehicles = useVehicleOptions(search, open);
  const options = (vehicles.data?.items ?? []).map((v) => ({
    value: v.uuid,
    label: v.plate,
    description: `${v.label} · ${v.current_branch.name}`,
  }));
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {t('fields.vehicle')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('fields.vehicle')}
        accessibilityValue={{ text: value?.label }}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
        )}>
        <Icon name="car" tone="muted-foreground" size={18} />
        <View className="flex-1">
          <Text numberOfLines={1} tone={value ? 'default' : 'muted'}>
            {value?.label ?? t('fields.vehicle_placeholder')}
          </Text>
          {value?.description ? (
            <Text variant="footnote" tone="muted" numberOfLines={1}>
              {value.description}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
      <OptionSheet
        visible={open}
        title={t('fields.vehicle_search')}
        options={options}
        value={value?.uuid}
        onSearch={setQ}
        loading={vehicles.isFetching}
        onClose={() => setOpen(false)}
        onPick={(uuid) => {
          const o = options.find((x) => x.value === uuid);
          if (o) onChange({ uuid, label: o.label, description: o.description });
          setOpen(false);
        }}
      />
    </View>
  );
}

/** "Transfer planla" (`tenant.transfers.write`); `vehicle` fixes the vehicle (from a vehicle page). */
export function NewTransferScreen({ vehicle }: { vehicle?: string }) {
  const { t } = useTranslation('transfers');
  return (
    <>
      <Stack.Screen options={{ title: t('dialog.title') }} />
      <Can
        perm={Permission.TenantTransfersWrite}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <TransferForm fixedVehicle={vehicle} />
      </Can>
    </>
  );
}

/** "Transferi düzenle": the plan of a planned transfer, only cost and note once it started. */
export function EditTransferScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation('transfers');
  const query = useTransfer(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('dialog.edit_title') }} />
      <Can
        perm={Permission.TenantTransfersWrite}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <View className="flex-1 bg-background">
          <QueryState query={query}>
            {(transfer) =>
              transfer.status === 'cancelled' ? (
                <EmptyState icon="cancel" title={t('status.cancelled')} />
              ) : (
                <TransferForm transfer={transfer} />
              )
            }
          </QueryState>
        </View>
      </Can>
    </>
  );
}

function TransferForm({ transfer, fixedVehicle }: { transfer?: Transfer; fixedVehicle?: string }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const zone = displayTimeZone();
  const started = transfer ? isStarted(transfer) : false;
  const branches = useSelectedBranch().branches;
  const assignees = useTransferAssignees(!started);
  const create = useCreateTransfer();
  const update = useUpdateTransfer(transfer?.uuid ?? '');
  const mutation = transfer ? update : create;

  const [vehicle, setVehicle] = useState<{ uuid: string; label: string; description: string } | null>(
    transfer
      ? { uuid: transfer.vehicle.uuid, label: transfer.vehicle.plate, description: transfer.vehicle.label }
      : fixedVehicle
        ? { uuid: fixedVehicle, label: '', description: '' }
        : null,
  );
  const [from, setFrom] = useState(transfer?.from_branch.uuid ?? AUTO);
  const [to, setTo] = useState(transfer?.to_branch.uuid ?? '');
  const [responsible, setResponsible] = useState(transfer?.responsible?.uuid ?? NONE);
  const [departure, setDeparture] = useState<Instant | null>(() =>
    instantOf(transfer ? new Date(transfer.planned_departure) : new Date(Date.now() + 3_600_000), zone),
  );
  const [arrival, setArrival] = useState<Instant | null>(() =>
    instantOf(transfer ? new Date(transfer.planned_arrival) : new Date(Date.now() + 4 * 3_600_000), zone),
  );
  const [cost, setCost] = useState(transfer?.cost ?? '');
  const [note, setNote] = useState(transfer?.note ?? '');
  const [local, setLocal] = useState<Errors>({});
  const api = formErrors(mutation.error);
  const field = (name: string) => (local[name] ? t(local[name]) : api.fields[name]);

  const values: TransferValues = {
    vehicle_uuid: vehicle?.uuid ?? '',
    from_branch_uuid: from === AUTO ? '' : from,
    to_branch_uuid: to,
    responsible_user_uuid: responsible === NONE ? '' : responsible,
    planned_departure: instantIso(departure, zone),
    planned_arrival: instantIso(arrival, zone),
    cost,
    note,
  };

  const submit = () => {
    const e = validateTransfer(values, started);
    setLocal(e);
    if (Object.keys(e).length) return;
    const onSuccess = (saved: Transfer) => {
      toast.success(transfer ? t('toast.updated') : t('toast.created'));
      if (transfer) router.back();
      else router.replace(`/transfers/${saved.uuid}`);
    };
    if (transfer) update.mutate(patchRequest(values, started), { onSuccess });
    else create.mutate(createRequest(values), { onSuccess });
  };

  const branchOptions = branches.map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` }));
  // A transfer's own branches stay pickable even when the branch list is not readable.
  if (transfer) {
    for (const b of [transfer.from_branch, transfer.to_branch])
      if (!branchOptions.some((o) => o.value === b.uuid))
        branchOptions.push({ value: b.uuid, label: `${b.code} · ${b.name}` });
  }
  const people = [
    { value: NONE, label: t('fields.no_responsible') },
    ...(assignees.data?.items ?? []).map((m) => ({ value: m.uuid, label: personName(m), description: m.email })),
  ];
  if (transfer?.responsible && !people.some((p) => p.value === transfer.responsible?.uuid))
    people.push({ value: transfer.responsible.uuid, label: personName(transfer.responsible), description: '' });

  return (
    <FormScreen
      footer={
        <>
          {api.message ? (
            <Text variant="footnote" tone="danger">
              {api.message}
            </Text>
          ) : null}
          <Button size="lg" title={t('actions.save')} loading={mutation.isPending} onPress={submit} />
        </>
      }>
      <Text tone="muted">{started ? t('dialog.started_description') : t('dialog.description')}</Text>
      {transfer || fixedVehicle ? (
        transfer ? (
          <Text variant="headline">{`${transfer.vehicle.plate} · ${transfer.vehicle.label}`}</Text>
        ) : null
      ) : (
        <VehiclePicker value={vehicle} onChange={setVehicle} error={field('vehicle_uuid')} />
      )}
      {started ? null : (
        <>
          <Select
            label={t('fields.from_branch')}
            icon="building"
            value={from}
            searchable={branchOptions.length > 8}
            options={[{ value: AUTO, label: t('fields.from_auto') }, ...branchOptions]}
            onChange={setFrom}
            error={field('from_branch_uuid')}
          />
          <Text variant="footnote" tone="muted">
            {t('fields.from_branch_hint')}
          </Text>
          <Select
            label={t('fields.to_branch')}
            icon="building"
            value={to || null}
            placeholder={t('fields.branch_placeholder')}
            searchable={branchOptions.length > 8}
            options={branchOptions}
            onChange={setTo}
            error={field('to_branch_uuid')}
          />
          <InstantField
            label={t('fields.planned_departure')}
            value={departure}
            onChange={setDeparture}
            error={field('planned_departure')}
          />
          <InstantField
            label={t('fields.planned_arrival')}
            value={arrival}
            onChange={setArrival}
            error={field('planned_arrival')}
          />
          <Select
            label={t('fields.responsible')}
            icon="user"
            value={responsible}
            searchable={people.length > 8}
            options={people}
            onChange={setResponsible}
            error={field('responsible_user_uuid')}
          />
        </>
      )}
      <Input
        label={t('fields.cost')}
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        placeholder="0.00"
        error={field('cost')}
      />
      <TextArea label={t('fields.note')} value={note} onChangeText={setNote} maxLength={2000} error={field('note')} />
    </FormScreen>
  );
}
