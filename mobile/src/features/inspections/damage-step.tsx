import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PhotoMeta } from '@/features/uploads/machine';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { problemText, useDamageActions } from './api';
import { isZone, ZONES } from './diagram';
import {
  DAMAGE_TYPES,
  damagePayload,
  damagePhotoCount,
  newDamageDraft,
  SEVERITIES,
  type DamageDraft,
  type InspectionDamage,
} from './model';
import { Notice } from './parts';
import { useCapture } from './use-capture';
import { VehicleDiagram } from './vehicle-diagram';
import { useWizard } from './wizard-context';

function confirm(title: string, ok: string, cancel: string, run: () => void) {
  if (Platform.OS === 'web') return run();
  Alert.alert(title, undefined, [
    { text: cancel, style: 'cancel' },
    { text: ok, style: 'destructive', onPress: run },
  ]);
}

/**
 * Step 4: damages on the vehicle diagram. Tap the spot, describe it, then
 * photograph it (every damage needs a completed photo before the form can be
 * completed). A return shows the handover damages as rings.
 */
export function DamageStep() {
  const { t } = useTranslation('inspections');
  const { ins, locked, readOnly, queue } = useWizard();
  const actions = useDamageActions(ins.uuid);
  const capture = useCapture();
  const [draft, setDraft] = useState<DamageDraft | null>(null);
  const isReturn = ins.kind === 'return';
  const queued = (damage: string) =>
    queue.jobs.filter(
      (j) => j.kind === 'photo' && (j.meta as PhotoMeta).damageUuid === damage && j.state !== 'failed',
    ).length;
  const zoneLabel = (z: string) => t(`zones.${z}`, { defaultValue: z });

  const save = () => {
    if (!draft) return;
    actions.add.mutate(damagePayload(draft, ins.kind), {
      onSuccess: (next) => {
        setDraft(null);
        toast.success(t('damages.added'));
        // Straight to the photo of the new damage (it is required).
        const created = next.damages.find((d) => !ins.damages.some((o) => o.uuid === d.uuid));
        if (created) void capture.take({ slot: 'damage', damageUuid: created.uuid, label: zoneLabel(created.zone) });
      },
      onError: (e) => toast.error(problemText(e)),
    });
  };

  return (
    <>
      <Card title={`${t('damages.title')} · ${ins.damages.length}`}>
        <Text variant="footnote" tone="muted">
          {t(isReturn ? 'damages.hint_return' : 'damages.hint')}
        </Text>
        <VehicleDiagram
          damages={ins.damages}
          baseline={ins.baseline?.damages ?? []}
          selected={draft?.zone ?? null}
          disabled={locked}
          onTap={(zone, pos) => setDraft(newDamageDraft(ins.kind, zone, pos))}
        />
        {!locked ? (
          <Button
            variant="outline"
            icon="car"
            title={t('zones.interior')}
            onPress={() => setDraft(newDamageDraft(ins.kind, 'interior'))}
          />
        ) : null}
      </Card>
      {ins.damages.length === 0 ? (
        <Notice body={t('damages.empty_description')} title={t('damages.empty')} />
      ) : (
        <View className="gap-3">
          {ins.damages.map((d, i) => (
            <DamageRow
              key={d.uuid}
              index={i + 1}
              damage={d}
              isReturn={isReturn}
              photos={damagePhotoCount(ins.photos, d.uuid)}
              queued={queued(d.uuid)}
              readOnly={readOnly}
              locked={locked}
              zoneLabel={zoneLabel(d.zone)}
              onPhoto={() => void capture.take({ slot: 'damage', damageUuid: d.uuid, label: zoneLabel(d.zone) })}
              onMore={() => capture.choose({ slot: 'damage', damageUuid: d.uuid, label: zoneLabel(d.zone) })}
              onRemove={() =>
                confirm(t('damages.remove_confirm'), t('damages.remove'), t('common:cancel'), () =>
                  actions.remove.mutate(d.uuid, { onError: (e) => toast.error(problemText(e)) }),
                )
              }
            />
          ))}
        </View>
      )}
      {ins.baseline && ins.baseline.damages.length > 0 ? (
        <Card title={`${t('damages.at_handover')} · ${ins.baseline.damages.length}`}>
          {ins.baseline.damages.map((d) => (
            <Text key={d.uuid} variant="callout">
              {`${zoneLabel(d.zone)} · ${t(`damage_types.${d.damage_type}`)} · ${t(`severities.${d.severity}`)}${
                d.description ? ` — ${d.description}` : ''
              }`}
            </Text>
          ))}
        </Card>
      ) : null}
      <DamageSheet
        draft={draft}
        isReturn={isReturn}
        pending={actions.add.isPending}
        onChange={setDraft}
        onClose={() => !actions.add.isPending && setDraft(null)}
        onSave={save}
      />
    </>
  );
}

function DamageRow({
  index,
  damage,
  isReturn,
  photos,
  queued,
  readOnly,
  locked,
  zoneLabel,
  onPhoto,
  onMore,
  onRemove,
}: {
  index: number;
  damage: InspectionDamage;
  isReturn: boolean;
  photos: number;
  queued: number;
  readOnly: boolean;
  locked: boolean;
  zoneLabel: string;
  onPhoto: () => void;
  onMore: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('inspections');
  return (
    <View className="gap-3 rounded-lg border border-border bg-card p-4" style={{ borderCurve: 'continuous' }}>
      <View className="flex-row items-start gap-3">
        <View className="size-7 items-center justify-center rounded-full bg-destructive">
          <Text variant="footnote" className="font-sans-bold text-white">
            {index}
          </Text>
        </View>
        <View className="flex-1 gap-1">
          <Text className="font-sans-semibold">{zoneLabel}</Text>
          <Text variant="footnote" tone="muted">
            {`${t(`damage_types.${damage.damage_type}`)} · ${t(`severities.${damage.severity}`)}`}
          </Text>
          {damage.description ? <Text variant="callout">{damage.description}</Text> : null}
          <View className="flex-row flex-wrap gap-1.5">
            {isReturn && damage.is_new ? <StatusPill label={t('damages.new')} tone="problem" /> : null}
            {damage.disputed ? <StatusPill label={t('damages.disputed')} tone="progress" /> : null}
            <StatusPill
              label={
                queued > 0 ? t('damages.photos_queued', { count: photos, queued }) : t('damages.photos', { count: photos })
              }
              tone={photos > 0 ? 'done' : queued > 0 ? 'progress' : 'problem'}
            />
          </View>
        </View>
        {!locked ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('damages.remove')} hitSlop={10} onPress={onRemove}>
            <Icon name="trash" tone="destructive" size={20} />
          </Pressable>
        ) : null}
      </View>
      {!readOnly ? (
        <View className="flex-row gap-2">
          <Button icon="camera" title={t('damages.add_photo')} onPress={onPhoto} className="flex-1" />
          <Button variant="outline" icon="photos" title={t('photos.more')} onPress={onMore} />
        </View>
      ) : null}
    </View>
  );
}

function DamageSheet({
  draft,
  isReturn,
  pending,
  onChange,
  onClose,
  onSave,
}: {
  draft: DamageDraft | null;
  isReturn: boolean;
  pending: boolean;
  onChange: (d: DamageDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation('inspections');
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={!!draft} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {draft ? (
        <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Text variant="headline" className="flex-1" numberOfLines={1}>
              {t('damages.new_title')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common:close')} onPress={onClose} hitSlop={10}>
              <Icon name="close" tone="muted-foreground" size={22} />
            </Pressable>
          </View>
          <View className="flex-1 gap-4 px-4 pt-4">
            <Text variant="footnote" tone="muted">
              {t('damages.dialog_description')}
            </Text>
            <Select
              label={t('damages.zone')}
              value={draft.zone}
              options={ZONES.map((z) => ({ value: z, label: t(`zones.${z}`) }))}
              onChange={(zone) =>
                // Another zone than the tapped one: the marker goes to that zone's centre.
                onChange({ ...draft, zone, ...(zone !== draft.zone && isZone(zone) ? { pos_x: null, pos_y: null } : {}) })
              }
            />
            <View className="gap-1.5">
              <Text variant="footnote" tone="muted" className="font-sans-medium">
                {t('damages.type')}
              </Text>
              <Chips
                options={DAMAGE_TYPES.map((v) => ({ value: v, label: t(`damage_types.${v}`) }))}
                value={draft.damage_type}
                onChange={(damage_type) => onChange({ ...draft, damage_type })}
              />
            </View>
            <View className="gap-1.5">
              <Text variant="footnote" tone="muted" className="font-sans-medium">
                {t('damages.severity')}
              </Text>
              <Chips
                options={SEVERITIES.map((v) => ({ value: v, label: t(`severities.${v}`) }))}
                value={draft.severity}
                onChange={(severity) => onChange({ ...draft, severity })}
              />
            </View>
            <TextArea
              label={t('damages.description')}
              value={draft.description}
              maxLength={2000}
              onChangeText={(description) => onChange({ ...draft, description })}
            />
            {isReturn ? (
              <>
                <SwitchRow
                  label={t('damages.is_new')}
                  value={draft.is_new}
                  onChange={(is_new) => onChange({ ...draft, is_new })}
                />
                <SwitchRow
                  label={t('damages.customer_disputes')}
                  value={draft.disputed}
                  onChange={(disputed) => onChange({ ...draft, disputed })}
                />
              </>
            ) : null}
          </View>
          <View className="gap-2 px-4 pt-3">
            <Button size="lg" icon="camera" title={t('damages.save')} loading={pending} onPress={onSave} />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}
