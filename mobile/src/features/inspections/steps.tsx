import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatNumber, formatShort } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { cn } from '@/ui/cn';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { checkKm, clampFuel, delta, FUEL_STEP, kmDigits, missingNow, restPresent, toggleItem } from './model';
import { CheckRow, Facts, Notice } from './parts';
import { useWizard } from './wizard-context';

/** Plate as on the panel: a framed monospace plate next to the model. */
export function PlateLine() {
  const { ins } = useWizard();
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <View className="rounded-md border-2 border-foreground px-2 py-0.5">
        <Text variant="headline" className="tabular-nums tracking-wider">
          {ins.rental.vehicle.plate}
        </Text>
      </View>
      <Text tone="muted" numberOfLines={1} className="flex-1">
        {ins.rental.vehicle.label}
      </Text>
    </View>
  );
}

/** Step 1: the vehicle and the customer / driver are who the rental says. */
export function VerifyStep() {
  const { t } = useTranslation('inspections');
  const { ins, locked, commit } = useWizard();
  const v = ins.verification;
  const set = (patch: Partial<typeof v>) => void commit({ verification: { ...v, ...patch } });
  const drivers = ins.rental.drivers.filter((d) => d.uuid);
  return (
    <>
      <Card title={t('verify.vehicle')}>
        <PlateLine />
        <CheckRow
          label={t('verify.plate_confirmed')}
          value={v.plate_confirmed}
          disabled={locked}
          onChange={() => set({ plate_confirmed: !v.plate_confirmed })}
        />
        <CheckRow
          label={t('verify.vehicle_ok')}
          value={v.vehicle_ok}
          disabled={locked}
          onChange={() => set({ vehicle_ok: !v.vehicle_ok })}
        />
      </Card>
      <Card title={t('verify.customer')}>
        <Text variant="headline">{ins.rental.customer.display_name}</Text>
        <Select
          label={t('verify.driver')}
          placeholder={t('verify.driver_pick')}
          value={v.driver_uuid}
          disabled={locked}
          options={drivers.map((d) => ({
            value: d.uuid as string,
            label: d.name,
            description: d.licence_hint || undefined,
          }))}
          onChange={(uuid) => set({ driver_uuid: uuid })}
        />
        {ins.kind === 'handover' ? (
          <>
            <CheckRow
              label={t('verify.identity_checked')}
              value={v.identity_checked}
              disabled={locked}
              onChange={() => set({ identity_checked: !v.identity_checked })}
            />
            <CheckRow
              label={t('verify.licence_checked')}
              value={v.licence_checked}
              disabled={locked}
              onChange={() => set({ licence_checked: !v.licence_checked })}
            />
          </>
        ) : null}
      </Card>
    </>
  );
}

/** Fuel level in the panel's 5 % steps: − / + and a tappable gauge, big enough for gloves. */
function FuelGauge({
  value,
  disabled,
  onChange,
  label,
}: {
  value: number | null;
  disabled?: boolean;
  onChange: (v: number) => void;
  label: string;
}) {
  const set = (v: number) => {
    const next = clampFuel(v);
    if (next === value) return;
    void Haptics.selectionAsync();
    onChange(next);
  };
  const segments = 100 / FUEL_STEP;
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
          disabled={disabled || value === 0}
          onPress={() => set((value ?? 100) - FUEL_STEP)}
          className={cn('size-11 items-center justify-center rounded-full bg-secondary', disabled && 'opacity-40')}>
          <Icon name="remove" tone="primary" size={20} />
        </Pressable>
        <Text variant="figure" className="flex-1 text-center" accessibilityLiveRegion="polite">
          {value == null ? '—' : `%${value}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
          disabled={disabled || value === 100}
          onPress={() => set((value ?? 0) + FUEL_STEP)}
          className={cn('size-11 items-center justify-center rounded-full bg-secondary', disabled && 'opacity-40')}>
          <Icon name="add" tone="primary" size={20} />
        </Pressable>
      </View>
      <View className="h-10 flex-row gap-0.5" accessibilityRole="adjustable" accessibilityLabel={label}>
        {Array.from({ length: segments }, (_, i) => {
          const level = (i + 1) * FUEL_STEP;
          const on = value != null && level <= value;
          return (
            <Pressable
              key={level}
              accessibilityRole="button"
              accessibilityLabel={`%${level}`}
              disabled={disabled}
              onPress={() => set(level)}
              className={cn(
                'flex-1 rounded-sm',
                on ? 'bg-primary' : 'bg-muted',
                i === 0 && 'rounded-l-md',
                i === segments - 1 && 'rounded-r-md',
              )}
            />
          );
        })}
      </View>
      <View className="flex-row justify-between">
        {['E', '1/4', '1/2', '3/4', 'F'].map((m) => (
          <Text key={m} variant="footnote" tone="muted">
            {m}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Step 3: km, fuel and equipment (a return shows the handover values and the deltas). */
export function ReadingsStep() {
  const { t } = useTranslation('inspections');
  const { ins, locked, commit, values, setValue } = useWizard();
  const base = ins.baseline;
  const kmText = values.km ?? (ins.km != null ? String(ins.km) : '');
  const km = checkKm(kmText, base?.km);
  const kmError =
    km.problem === 'invalid' ? t('readings.km_invalid') : km.problem === 'below_handover' ? t('readings.km_below') : undefined;
  const sendKm = async () => {
    if (km.value == null || km.problem === 'invalid' || km.value === ins.km) {
      if (km.value === ins.km) setValue('km', null);
      return;
    }
    if (await commit({ km: km.value })) setValue('km', null);
  };
  const driven = delta(km.value, base?.km);
  const fuelDiff = delta(ins.fuel, base?.fuel);
  const missing = base ? missingNow(ins.template.checklist, ins.equipment, base.equipment) : [];

  return (
    <>
      <Card title={t('readings.title')}>
        <Input
          label={t('readings.km')}
          value={kmText}
          editable={!locked}
          inputMode="numeric"
          keyboardType="number-pad"
          returnKeyType="done"
          error={kmError}
          hint={
            base?.km != null
              ? [
                  t('readings.at_handover_km', { km: formatNumber(base.km) }),
                  driven != null && driven >= 0 ? t('readings.driven', { km: formatNumber(driven) }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : ins.km == null
                ? t('readings.answer_required')
                : undefined
          }
          onChangeText={(v) => setValue('km', kmDigits(v))}
          onEndEditing={() => void sendKm()}
          onSubmitEditing={() => void sendKm()}
        />
        <View className="gap-1.5">
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('readings.fuel')}
          </Text>
          <FuelGauge
            label={t('readings.fuel')}
            value={ins.fuel}
            disabled={locked}
            onChange={(fuel) => void commit({ fuel })}
          />
          {base?.fuel != null ? (
            <Text variant="footnote" tone={fuelDiff != null && fuelDiff < 0 ? 'danger' : 'muted'}>
              {[
                t('readings.at_handover_fuel', { fuel: base.fuel }),
                fuelDiff != null && fuelDiff !== 0 ? t('readings.fuel_delta', { delta: fuelDiff }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : ins.fuel == null ? (
            <Text variant="footnote" tone="muted">
              {t('readings.answer_required')}
            </Text>
          ) : null}
        </View>
      </Card>
      <Card title={`${t('readings.equipment')} · ${ins.template.checklist.length}`}>
        {ins.template.checklist.map((item) => {
          const value = ins.equipment[item.key];
          const gone = missing.some((m) => m.key === item.key);
          return (
            <CheckRow
              key={item.key}
              label={item.label}
              value={value}
              missing
              disabled={locked}
              hint={
                gone
                  ? t('readings.missing_now')
                  : value === undefined && item.required
                    ? t('readings.answer_required')
                    : value === false
                      ? t('readings.missing')
                      : undefined
              }
              hintTone={gone ? 'danger' : 'muted'}
              onChange={() => void commit({ equipment: { [item.key]: toggleItem(value) } })}
            />
          );
        })}
        {!locked ? (
          <Button
            variant="outline"
            icon="check"
            title={t('readings.mark_rest_present')}
            disabled={Object.keys(restPresent(ins.template.checklist, ins.equipment)).length === 0}
            onPress={() => void commit({ equipment: restPresent(ins.template.checklist, ins.equipment) })}
          />
        ) : null}
      </Card>
    </>
  );
}

/** Customer review: the summary shown to the customer before signing. */
export function ReviewStep() {
  const { t } = useTranslation('inspections');
  const { ins, locked, commit, values, setValue } = useWizard();
  const statement = values.statement ?? ins.customer_statement;
  const missing = ins.template.checklist.filter((i) => ins.equipment[i.key] === false);
  const photos = ins.photos.filter((p) => p.status === 'completed').length;
  const send = async () => {
    if (statement === ins.customer_statement) return setValue('statement', null);
    if (await commit({ customer_statement: statement })) setValue('statement', null);
  };
  return (
    <>
      <Card title={t('review_step.summary')}>
        <Facts
          rows={[
            { label: t('review_step.vehicle'), value: `${ins.rental.vehicle.plate} · ${ins.rental.vehicle.label}` },
            { label: t('readings.km'), value: ins.km != null ? formatNumber(ins.km) : '—' },
            { label: t('readings.fuel'), value: ins.fuel != null ? `%${ins.fuel}` : '—' },
            {
              label: t('review_step.missing_equipment'),
              value: missing.length ? missing.map((i) => i.label).join(', ') : t('review_step.none'),
              tone: missing.length ? 'danger' : undefined,
            },
            { label: t('review_step.damages'), value: String(ins.damages.length) },
            { label: t('review_step.photos'), value: String(photos) },
            { label: t('review_step.time'), value: formatShort(ins.occurred_at ?? new Date().toISOString()) },
          ]}
        />
      </Card>
      <Card title={t('review_step.statement')}>
        <TextArea
          label={t('review_step.statement')}
          placeholder={t('review_step.statement_hint')}
          value={statement}
          editable={!locked}
          maxLength={2000}
          onChangeText={(v) => setValue('statement', v)}
          onEndEditing={() => void send()}
        />
      </Card>
      {ins.customer_reviewed_at ? (
        <Notice
          tone="success"
          body={t('review_step.reviewed_at', { at: formatShort(ins.customer_reviewed_at) })}
          icon="check"
        />
      ) : (
        <Button
          size="lg"
          icon="check"
          title={t('review_step.confirm')}
          disabled={locked}
          onPress={async () => {
            if (statement !== ins.customer_statement) await send();
            void commit({ customer_reviewed: true });
          }}
        />
      )}
    </>
  );
}
