import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Can, Permission, useCan, type PermissionSlug } from '@/core/auth/permissions';
import { displayTimeZone, formatMoney, formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen } from '@/ui/screen';
import { OptionSheet, Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';
import { toast } from '@/ui/toast';

import {
  rentalErrorText,
  useCancelRental,
  useDecideCharge,
  useExtendRental,
  useRental,
  useSwapCandidates,
  useSwapVehicle,
} from './api';
import {
  chargeDecisions,
  decisionNoteRequired,
  decisionNoteValid,
  extendRequest,
  isDecision,
  lastKm,
  rentalActions,
  swapRequest,
  timesAround,
  timesWith,
  nextDayOf,
  wallClock,
  type Rental,
} from './lib';

function Gate({ perm, children }: { perm: PermissionSlug; children: ReactNode }) {
  const { t } = useTranslation('rentals');
  return (
    <Can perm={perm} fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
      {children}
    </Can>
  );
}

/** Loads the rental, then the form; a rental no longer in a state for the action says so. */
function WithRental({ children }: { children: (rental: Rental) => ReactNode }) {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const query = useRental(uuid);
  return (
    <QueryState query={query} rows={3}>
      {(rental) => children(rental)}
    </QueryState>
  );
}

function NotNow() {
  const { t } = useTranslation('rentals');
  return <EmptyState icon="info" title={t('problems.invalid_transition')} />;
}

function Summary({ rental }: { rental: Rental }) {
  return (
    <Text variant="callout" tone="muted">
      {[rental.reference, rental.vehicle.plate, rental.customer.display_name].filter(Boolean).join(' · ')}
    </Text>
  );
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <Text variant="footnote" tone="danger">
      {text}
    </Text>
  );
}

/** Day + time of the organization zone, without native pickers. */
function WhenField({
  label,
  day,
  time,
  min,
  error,
  onDay,
  onTime,
}: {
  label: string;
  day: string;
  time: string;
  min?: string;
  error?: string;
  onDay: (d: string) => void;
  onTime: (t: string) => void;
}) {
  // Keeps the order while picking, so the chosen chip does not jump away.
  const [times] = useState(() => timesAround(time));
  const shown = times.includes(time) ? times : timesWith(time);
  return (
    <View className="gap-2">
      <DateField label={label} value={day} min={min} onChange={onDay} icon="calendar" error={error} />
      <TimeStrip value={time} onChange={onTime} times={shown} />
    </View>
  );
}

// ------------------------------------------------------------ extend

/** "Uzat": a later return time (priced by the reservation's extension rule) and an optional reason. */
export function ExtendRentalScreen() {
  const { t } = useTranslation('rentals');
  return (
    <>
      <Stack.Screen options={{ title: t('extend.title') }} />
      <Gate perm={Permission.TenantRentalsWrite}>
        <WithRental>{(rental) => <ExtendForm rental={rental} />}</WithRental>
      </Gate>
    </>
  );
}

function ExtendForm({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const zone = displayTimeZone();
  const start = wallClock(rental.planned_return_at, zone);
  const [day, setDay] = useState(nextDayOf(start.day));
  const [time, setTime] = useState(start.time);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const extend = useExtendRental(rental.uuid);
  if (!rentalActions(rental.status, { write: can(Permission.TenantRentalsWrite), close: false }).extend)
    return <NotNow />;
  const check = extendRequest({ day, time, reason }, rental.planned_return_at, zone);
  const submit = () => {
    if (!('body' in check) || !check.body) return;
    setProblem(null);
    extend.mutate(check.body, {
      onSuccess: () => {
        toast.success(t('toast.extended'));
        router.back();
      },
      onError: (e) => setProblem(rentalErrorText(e)),
    });
  };
  return (
    <FormScreen
      footer={
        <>
          <Problem text={problem} />
          <Button
            size="lg"
            icon="calendar"
            title={t('actions.extend')}
            disabled={!('body' in check)}
            loading={extend.isPending}
            onPress={submit}
          />
        </>
      }>
      <Summary rental={rental} />
      <Text tone="muted">{t('extend.description')}</Text>
      <Text variant="footnote" tone="muted">
        {`${t('rentals_app:extend.current')}: ${formatShort(rental.planned_return_at)}`}
      </Text>
      <WhenField
        label={t('extend.new_end')}
        day={day}
        time={time}
        min={start.day}
        error={'error' in check && check.error ? t(check.error) : undefined}
        onDay={setDay}
        onTime={setTime}
      />
      <Input label={t('fields.reason')} value={reason} onChangeText={setReason} maxLength={500} />
    </FormScreen>
  );
}

// ------------------------------------------------------------ swap

/**
 * "Araç değiştir": the current vehicle comes back (km / fuel in) and the
 * new one goes out (km / fuel out) from the swap time and branch.
 */
export function SwapVehicleScreen() {
  const { t } = useTranslation('rentals');
  return (
    <>
      <Stack.Screen options={{ title: t('swap.title') }} />
      <Gate perm={Permission.TenantRentalsWrite}>
        <WithRental>{(rental) => <SwapForm rental={rental} />}</WithRental>
      </Gate>
    </>
  );
}

function VehiclePicker({
  rental,
  value,
  onChange,
  error,
}: {
  rental: Rental;
  value: { uuid: string; label: string; description: string } | null;
  onChange: (v: { uuid: string; label: string; description: string }) => void;
  error?: string;
}) {
  const { t } = useTranslation('rentals');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const candidates = useSwapCandidates(search, rental.vehicle.uuid, open);
  const options = (candidates.data ?? []).map((v) => ({
    value: v.uuid,
    label: v.plate,
    description: [v.label, v.current_branch?.name].filter(Boolean).join(' · '),
  }));
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {t('swap.new_vehicle')}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('swap.new_vehicle')}
        onPress={() => setOpen(true)}
        className={
          error
            ? 'min-h-[52px] flex-row items-center gap-2 rounded-lg border border-destructive bg-card px-4'
            : 'min-h-[52px] flex-row items-center gap-2 rounded-lg border border-border bg-card px-4'
        }>
        <View className="flex-1">
          <Text tone={value ? 'default' : 'muted'}>{value?.label ?? t('swap.vehicle_placeholder')}</Text>
          {value?.description ? (
            <Text variant="footnote" tone="muted" numberOfLines={1}>
              {value.description}
            </Text>
          ) : null}
        </View>
        <Icon name="search" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
      <OptionSheet
        visible={open}
        title={t('swap.new_vehicle')}
        options={options}
        value={value?.uuid}
        onSearch={setQ}
        loading={candidates.isFetching}
        onClose={() => setOpen(false)}
        onPick={(uuid) => {
          const o = options.find((x) => x.value === uuid);
          if (o) onChange({ uuid: o.value, label: o.label, description: o.description });
          setOpen(false);
        }}
      />
    </View>
  );
}

function SwapForm({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const zone = displayTimeZone();
  const branches = useSelectedBranch().branches;
  const minKm = lastKm(rental.legs) ?? 0;
  const now = wallClock(new Date().toISOString(), zone);
  const [vehicle, setVehicle] = useState<{ uuid: string; label: string; description: string } | null>(null);
  const [day, setDay] = useState(now.day);
  const [time, setTime] = useState(now.time);
  const [branchUuid, setBranchUuid] = useState(
    rental.actual_pickup.branch?.uuid ?? rental.planned_pickup.branch?.uuid ?? '',
  );
  const [inKm, setInKm] = useState(minKm ? String(minKm) : '');
  const [inFuel, setInFuel] = useState('');
  const [outKm, setOutKm] = useState('');
  const [outFuel, setOutFuel] = useState('100');
  const [reason, setReason] = useState('');
  const [tried, setTried] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const swap = useSwapVehicle(rental.uuid);
  if (!rentalActions(rental.status, { write: can(Permission.TenantRentalsWrite), close: false }).swap)
    return <NotNow />;

  const result = swapRequest(
    { vehicleUuid: vehicle?.uuid ?? '', day, time, branchUuid, inKm, inFuel, outKm, outFuel, reason },
    { vehicleUuid: rental.vehicle.uuid, minKm },
    zone,
  );
  const err = (k: keyof typeof result.errors) => (tried && result.errors[k] ? t(result.errors[k]!) : undefined);
  // Branch choices: the member's branches, plus the rental's own one when it is not among them.
  const branchOptions = [
    ...branches.map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` })),
    ...[rental.actual_pickup.branch, rental.planned_pickup.branch]
      .filter((b): b is NonNullable<typeof b> => !!b && !branches.some((x) => x.uuid === b.uuid))
      .slice(0, 1)
      .map((b) => ({ value: b.uuid, label: [b.code, b.name].filter(Boolean).join(' · ') })),
  ];
  const submit = () => {
    setTried(true);
    if (!result.body) return;
    setProblem(null);
    swap.mutate(result.body, {
      onSuccess: () => {
        toast.success(t('toast.swapped'));
        router.back();
      },
      onError: (e) => setProblem(rentalErrorText(e)),
    });
  };
  return (
    <FormScreen
      footer={
        <>
          <Problem text={problem ?? (tried && !result.body ? t('common:check_fields') : null)} />
          <Button size="lg" icon="refresh" title={t('actions.swap')} loading={swap.isPending} onPress={submit} />
        </>
      }>
      <Summary rental={rental} />
      <Text tone="muted">{t('swap.description', { plate: rental.vehicle.plate })}</Text>
      <VehiclePicker rental={rental} value={vehicle} onChange={setVehicle} error={err('vehicle')} />
      <WhenField label={t('fields.swap_at')} day={day} time={time} error={err('at')} onDay={setDay} onTime={setTime} />
      <Select
        label={t('fields.swap_branch')}
        icon="building"
        value={branchUuid || null}
        options={branchOptions}
        error={err('branch')}
        onChange={setBranchUuid}
      />
      <Input
        label={t('swap.in_km', { plate: rental.vehicle.plate })}
        value={inKm}
        onChangeText={setInKm}
        keyboardType="number-pad"
        hint={minKm ? t('fields.km_min', { km: minKm }) : t('fields.km_hint')}
        error={err('in_km')}
      />
      <Input
        label={t('swap.in_fuel', { plate: rental.vehicle.plate })}
        value={inFuel}
        onChangeText={setInFuel}
        keyboardType="number-pad"
        hint={t('fields.fuel_hint')}
        error={err('in_fuel')}
      />
      <Input
        label={t('swap.out_km')}
        value={outKm}
        onChangeText={setOutKm}
        keyboardType="number-pad"
        error={err('out_km')}
      />
      <Input
        label={t('swap.out_fuel')}
        value={outFuel}
        onChangeText={setOutFuel}
        keyboardType="number-pad"
        hint={t('fields.fuel_hint')}
        error={err('out_fuel')}
      />
      <TextArea
        label={t('fields.reason')}
        hint={t('common:reason_hint')}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        error={err('reason')}
      />
    </FormScreen>
  );
}

// ------------------------------------------------------------ cancel

/** Cancels a rental before the handover (`tenant.rentals.close`); the reservation stays as it is. */
export function CancelRentalScreen() {
  const { t } = useTranslation('rentals');
  return (
    <>
      <Stack.Screen options={{ title: t('cancel.title') }} />
      <Gate perm={Permission.TenantRentalsClose}>
        <WithRental>{(rental) => <CancelForm rental={rental} />}</WithRental>
      </Gate>
    </>
  );
}

function CancelForm({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const cancel = useCancelRental(rental.uuid);
  if (!rentalActions(rental.status, { write: false, close: can(Permission.TenantRentalsClose) }).cancel)
    return <NotNow />;
  return (
    <ReasonForm
      description={t('cancel.description', { reference: rental.reference })}
      label={t('fields.reason')}
      submitTitle={t('actions.cancel')}
      destructive
      pending={cancel.isPending}
      error={null}
      onSubmit={(reason) =>
        cancel.mutate(reason, {
          onSuccess: () => {
            toast.success(t('toast.cancelled'));
            router.back();
          },
          onError: (e) => toast.error(rentalErrorText(e)),
        })
      }
    />
  );
}

// ------------------------------------------------------------ charge decision

/**
 * Approve or waive a proposed charge (`?decision=approve|waive`). Who may
 * do it follows the panel: approve with `tenant.rentals.close` (damage also
 * `tenant.damage.approve`, disputed only that), waive with
 * `tenant.rentals.close`; a waiver and a disputed charge need a note.
 */
export function ChargeDecisionScreen() {
  const { t } = useTranslation('rentals');
  const { decision } = useLocalSearchParams<{ decision?: string }>();
  const kind = isDecision(decision) ? decision : 'approve';
  return (
    <>
      <Stack.Screen options={{ title: kind === 'waive' ? t('charges.waive_title') : t('charges.approve_title') }} />
      <Can
        perm={[Permission.TenantRentalsClose, Permission.TenantDamageApprove]}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <WithRental>{(rental) => <DecisionForm rental={rental} decision={kind} />}</WithRental>
      </Can>
    </>
  );
}

function DecisionForm({ rental, decision }: { rental: Rental; decision: 'approve' | 'waive' }) {
  const { t } = useTranslation('rentals');
  const { chargeUuid } = useLocalSearchParams<{ chargeUuid: string }>();
  const can = useCan();
  const decide = useDecideCharge(rental.uuid);
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const charge = rental.charges.find((c) => c.uuid === chargeUuid);
  if (!charge) return <EmptyState icon="inbox" title={t('charges.empty')} />;
  const allowed = chargeDecisions(charge, {
    close: can(Permission.TenantRentalsClose),
    damage: can(Permission.TenantDamageApprove),
  })[decision];
  if (!allowed) {
    return (
      <EmptyState
        icon="info"
        title={charge.status !== 'proposed' ? t('problems.already_decided') : t('common:forbidden')}
        body={charge.disputed && charge.status === 'proposed' ? t('charges.disputed_hint') : undefined}
      />
    );
  }
  const required = decisionNoteRequired(decision, charge);
  const valid = decisionNoteValid(note, required);
  const submit = () => {
    setProblem(null);
    decide.mutate(
      { charge: charge.uuid, decision, note: note.trim() },
      {
        onSuccess: () => {
          toast.success(t(decision === 'approve' ? 'toast.charge_approved' : 'toast.charge_waived'));
          router.back();
        },
        onError: (e) => setProblem(rentalErrorText(e)),
      },
    );
  };
  return (
    <FormScreen
      footer={
        <>
          <Problem text={problem} />
          <Button
            size="lg"
            variant={decision === 'waive' ? 'destructive' : 'primary'}
            icon={decision === 'waive' ? 'cancel' : 'check'}
            title={t(decision === 'waive' ? 'charges.actions.waive' : 'charges.actions.approve')}
            disabled={!valid}
            loading={decide.isPending}
            onPress={submit}
          />
        </>
      }>
      <Summary rental={rental} />
      <View className="gap-1 rounded-lg border border-border bg-card p-4">
        <Text variant="headline">
          {`${t(`charges.kinds.${charge.kind}`)} · ${formatMoney(charge.amount, charge.currency || 'TRY')}`}
        </Text>
        {charge.reason ? <Text variant="callout">{charge.reason}</Text> : null}
        {charge.disputed ? (
          <Text variant="footnote" tone="danger">
            {t('charges.disputed_hint')}
          </Text>
        ) : null}
      </View>
      <TextArea
        label={t('charges.decision_note')}
        hint={required ? t('common:reason_hint') : t('common:optional')}
        value={note}
        onChangeText={setNote}
        maxLength={required ? 500 : 1000}
      />
    </FormScreen>
  );
}
