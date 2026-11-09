import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatNumber } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { VEHICLE_STATUSES_AFTER } from './model';
import { Notice } from './parts';
import { useChargePreview } from './return-api';
import {
  canEditLine,
  editReady,
  lineSubject,
  overridesWith,
  readingsDelta,
  showComputed,
  type ChargeLine,
} from './return-model';
import { useWizard } from './wizard-context';

/**
 * Return step: the charges computed from the reservation's policy snapshot
 * (late, km, fuel, missing equipment) and the damage amounts, reviewed by
 * staff (the panel's ChargesStep). Changing a computed amount needs
 * `tenant.price.override`; the customer's dispute and where the vehicle goes
 * next are recorded here too. Nothing is charged before the completion.
 */
export function ChargesStep() {
  const { t } = useTranslation('returns');
  const { ins, readOnly, locked, commit, values, setValue } = useWizard();
  const can = useCan();
  const canOverride = can(Permission.TenantPriceOverride);
  const preview = useChargePreview(ins.uuid, true, ins.updated_at);
  const [editing, setEditing] = useState<ChargeLine | null>(null);
  const note = values.dispute_note ?? ins.dispute_note;
  const deltas = readingsDelta(ins);
  const data = preview.data;

  const text = (line: ChargeLine) => {
    const s = lineSubject(line, ins);
    switch (s.kind) {
      case 'override':
      case 'raw':
        return s.text;
      case 'damage':
        return `${t(`inspections:zones.${s.zone}`, { defaultValue: s.zone })}${s.description ? ` · ${s.description}` : ''}`;
      case 'equipment':
        return t('reason_equipment', { item: s.label });
      case 'policy':
        return t(`reason_${s.key}`);
    }
  };

  return (
    <>
      <Card title={data ? `${t('title')} · ${formatMoney(data.total, data.currency)}` : t('title')}>
        {data ? (
          <Text variant="footnote" tone="muted">
            {t('summary', { late: data.late_minutes, km: formatNumber(data.driven_km), version: data.settings_version })}
          </Text>
        ) : null}
        {deltas.km != null || deltas.fuel != null ? (
          <View className="flex-row gap-2">
            {deltas.km != null ? <StatusPill label={t('delta_km', { km: formatNumber(deltas.km) })} /> : null}
            {deltas.fuel != null ? (
              <StatusPill
                label={t('delta_fuel', { delta: deltas.fuel })}
                tone={deltas.fuel < 0 ? 'problem' : 'neutral'}
              />
            ) : null}
          </View>
        ) : null}
        {preview.isError ? (
          <Notice tone="danger" body={t('load_failed')}>
            <Button variant="outline" icon="refresh" title={t('common:retry')} onPress={() => void preview.refetch()} />
          </Notice>
        ) : !data ? (
          <Text tone="muted">{t('common:loading')}</Text>
        ) : data.lines.length === 0 ? (
          <Notice title={t('empty')} body={t('empty_description')} />
        ) : (
          data.lines.map((line) => (
            <Pressable
              key={line.key}
              accessibilityRole={canEditLine(line, locked, canOverride) ? 'button' : undefined}
              disabled={!canEditLine(line, locked, canOverride)}
              onPress={() => setEditing(line)}
              className="gap-1.5 rounded-md border border-border p-3 active:opacity-80">
              <View className="flex-row items-start gap-2">
                <View className="flex-1 gap-1">
                  <Text className="font-sans-semibold">{t(`kind_${line.kind}`)}</Text>
                  <Text variant="footnote" tone="muted">
                    {text(line)}
                  </Text>
                </View>
                <View className="items-end gap-0.5">
                  <Text className="font-sans-semibold tabular-nums">{formatMoney(line.amount, line.currency)}</Text>
                  {showComputed(line) && line.computed ? (
                    <Text variant="footnote" tone="muted" className="tabular-nums">
                      {t('computed', { amount: formatMoney(line.computed, line.currency) })}
                    </Text>
                  ) : null}
                </View>
                {canEditLine(line, locked, canOverride) ? <Icon name="edit" tone="primary" size={16} /> : null}
              </View>
              {line.disputed || line.overridden ? (
                <View className="flex-row gap-1.5">
                  {line.disputed ? <StatusPill label={t('disputed')} tone="problem" /> : null}
                  {line.overridden ? <StatusPill label={t('overridden')} /> : null}
                </View>
              ) : null}
            </Pressable>
          ))
        )}
      </Card>
      <Card title={t('dispute_title')}>
        <SwitchRow
          label={t('disputes')}
          value={ins.disputed}
          disabled={locked}
          onChange={(disputed) => void commit({ disputed })}
        />
        {ins.disputed ? (
          <TextArea
            label={t('dispute_note')}
            hint={t('dispute_hint')}
            value={note}
            editable={!locked}
            maxLength={2000}
            onChangeText={(v) => setValue('dispute_note', v)}
            onEndEditing={async () => {
              if (note === ins.dispute_note) return setValue('dispute_note', null);
              if (await commit({ dispute_note: note })) setValue('dispute_note', null);
            }}
          />
        ) : null}
        <View className="gap-1.5">
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('vehicle_after')}
          </Text>
          <Chips
            options={VEHICLE_STATUSES_AFTER.map((v) => ({ value: v, label: t(`vehicle_${v}`) }))}
            value={ins.vehicle_status_after ?? 'cleaning'}
            onChange={(v) => !locked && void commit({ vehicle_status_after: v })}
          />
        </View>
      </Card>
      {!readOnly ? (
        <EditSheet
          line={editing}
          initialReason={ins.charge_overrides.find((o) => o.key === editing?.key)?.reason ?? ''}
          onClose={() => setEditing(null)}
          onSave={async (amount, reason) => {
            if (!editing) return;
            if (await commit({ charge_overrides: overridesWith(ins.charge_overrides, editing.key, amount, reason) })) {
              setEditing(null);
              void preview.refetch();
            }
          }}
        />
      ) : null}
    </>
  );
}

function EditSheet({
  line,
  initialReason,
  onClose,
  onSave,
}: {
  line: ChargeLine | null;
  initialReason: string;
  onClose: () => void;
  onSave: (amount: string, reason: string) => Promise<void>;
}) {
  const { t } = useTranslation('returns');
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState<{ key: string | null; amount: string; reason: string }>({
    key: null,
    amount: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  if (line && form.key !== line.key) setForm({ key: line.key, amount: line.amount, reason: initialReason });
  return (
    <Modal visible={!!line} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {line ? (
        <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Text variant="headline" className="flex-1" numberOfLines={1}>
              {t('edit_title')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common:close')} onPress={onClose} hitSlop={10}>
              <Icon name="close" tone="muted-foreground" size={22} />
            </Pressable>
          </View>
          <View className="flex-1 gap-4 px-4 pt-4">
            <Text variant="footnote" tone="muted">
              {`${t(`kind_${line.kind}`)}${line.computed ? ` · ${t('computed', { amount: formatMoney(line.computed, line.currency) })}` : ''}`}
            </Text>
            <Input
              label={t('amount')}
              value={form.amount}
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={(amount) => setForm({ ...form, amount })}
            />
            <TextArea
              label={t('reason')}
              hint={line.source === 'policy' ? t('reason_required') : undefined}
              value={form.reason}
              maxLength={500}
              onChangeText={(reason) => setForm({ ...form, reason })}
            />
          </View>
          <View className="px-4 pt-3">
            <Button
              size="lg"
              icon="check"
              title={t('save')}
              loading={busy}
              disabled={!editReady(line, form.amount, form.reason)}
              onPress={async () => {
                setBusy(true);
                await onSave(form.amount, form.reason);
                setBusy(false);
              }}
            />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
