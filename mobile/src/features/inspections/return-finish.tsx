import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { StatusPill, type StatusTone } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { problemText } from './api';
import { VEHICLE_STATUSES_AFTER, type Inspection } from './model';
import { Notice } from './parts';
import { useCompleteReturn, useDecideCharge, useReturnRental, useReviewInspection } from './return-api';
import {
  canApproveCharge,
  canCompleteReturn,
  canWaiveCharge,
  completeReturnPayload,
  decisionNoteRequired,
  decisionReady,
  returnCharges,
  reviewGate,
  reviewPayload,
  reviewPending,
  type RentalCharge,
  type VehicleStatus,
} from './return-model';

const STATUS_TONES: Record<RentalCharge['status'], StatusTone> = {
  proposed: 'progress',
  approved: 'done',
  waived: 'neutral',
};

/**
 * After a return is completed: the review of a disputed or unsigned return
 * (`POST …/review`, as the panel's inspection detail), the rental's charges
 * with approve / waive (`tenant.damage.approve` for disputed and damage
 * charges, `tenant.rentals.close` for the rest) and the return check
 * (`POST /rentals/{uuid}/complete-return`) when the rental still waits in it.
 */
export function ReturnFinished({ ins }: { ins: Inspection }) {
  const can = useCan();
  const rental = useReturnRental(ins.rental.uuid, can(Permission.TenantRentalsRead));
  return (
    <>
      {reviewPending(ins) ? <ReviewCard ins={ins} onDone={() => void rental.refetch()} /> : null}
      {rental.data ? <ChargesCard rentalUuid={ins.rental.uuid} charges={rental.data.charges} /> : null}
      {rental.data && canCompleteReturn(rental.data.status, ins, can(Permission.TenantRentalsClose)) ? (
        <CompleteReturnCard
          rentalUuid={ins.rental.uuid}
          proposed={returnCharges(rental.data.charges).filter((c) => c.status === 'proposed').length}
          initial={ins.vehicle_status_after ?? 'cleaning'}
        />
      ) : null}
    </>
  );
}

function VehicleChips({ value, onChange }: { value: VehicleStatus; onChange: (v: VehicleStatus) => void }) {
  const { t } = useTranslation('returns');
  return (
    <View className="gap-1.5">
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {t('vehicle_after')}
      </Text>
      <Chips
        options={VEHICLE_STATUSES_AFTER.map((v) => ({ value: v, label: t(`vehicle_${v}`) }))}
        value={value}
        onChange={onChange}
      />
    </View>
  );
}

function ReviewCard({ ins, onDone }: { ins: Inspection; onDone: () => void }) {
  const { t } = useTranslation('returns');
  const can = useCan();
  const review = useReviewInspection(ins.uuid);
  const [note, setNote] = useState('');
  const [vehicle, setVehicle] = useState<VehicleStatus>(ins.vehicle_status_after ?? 'cleaning');
  const perms = { close: can(Permission.TenantRentalsClose), waive: can(Permission.TenantSignatureWaive) };
  const gate = reviewGate(ins, note, perms);
  return (
    <Card title={t('review_title')}>
      <Notice tone="danger" body={t('review_hint')} />
      {!perms.close ? (
        <Text variant="footnote" tone="muted">
          {t('review_forbidden')}
        </Text>
      ) : (
        <>
          <Text variant="footnote" tone="muted">
            {gate.unsigned ? t('resolve_unsigned') : t('resolve_hint')}
          </Text>
          <TextArea label={t('review_note')} value={note} maxLength={1000} onChangeText={setNote} />
          <VehicleChips value={vehicle} onChange={setVehicle} />
          {gate.waiveMissing ? <Notice tone="warning" body={t('waive_needed')} /> : null}
          <Button
            size="lg"
            icon="check"
            title={t('resolve')}
            disabled={!gate.ok}
            loading={review.isPending}
            onPress={() =>
              review.mutate(reviewPayload(note, vehicle), {
                onSuccess: () => {
                  toast.success(t('reviewed'));
                  onDone();
                },
                onError: (e) => toast.error(problemText(e)),
              })
            }
          />
        </>
      )}
    </Card>
  );
}

type Pending = { charge: RentalCharge; decision: 'approve' | 'waive' } | null;

function ChargesCard({ rentalUuid, charges }: { rentalUuid: string; charges: RentalCharge[] }) {
  const { t } = useTranslation('returns');
  const can = useCan();
  const decide = useDecideCharge(rentalUuid);
  const [pending, setPending] = useState<Pending>(null);
  const perms = { close: can(Permission.TenantRentalsClose), damage: can(Permission.TenantDamageApprove) };
  const list = returnCharges(charges);
  if (!list.length) return null;
  return (
    <Card title={`${t('rental_charges')} · ${list.length}`}>
      {list.map((c) => (
        <View key={c.uuid} className="gap-2 rounded-md border border-border p-3">
          <View className="flex-row items-start gap-2">
            <View className="flex-1 gap-1">
              <Text className="font-sans-semibold">{t(`kind_${c.kind}`)}</Text>
              {c.reason ? (
                <Text variant="footnote" tone="muted" numberOfLines={2}>
                  {c.reason}
                </Text>
              ) : null}
            </View>
            <View className="items-end gap-0.5">
              <Text className="font-sans-semibold tabular-nums">{formatMoney(c.amount, c.currency)}</Text>
              {c.original_amount ? (
                <Text variant="footnote" tone="muted" className="tabular-nums">
                  {t('computed', { amount: formatMoney(c.original_amount, c.currency) })}
                </Text>
              ) : null}
            </View>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            <StatusPill label={t(`charge_status_${c.status}`)} tone={STATUS_TONES[c.status]} />
            {c.disputed ? <StatusPill label={t('disputed')} tone="problem" /> : null}
          </View>
          {c.decided_at ? (
            <Text variant="footnote" tone="muted">
              {`${formatShort(c.decided_at)}${c.decision_note ? ` — ${c.decision_note}` : ''}`}
            </Text>
          ) : null}
          {canApproveCharge(c, perms) || canWaiveCharge(c, perms) ? (
            <View className="flex-row gap-2">
              {canApproveCharge(c, perms) ? (
                <Button
                  icon="check"
                  title={t('approve')}
                  onPress={() => setPending({ charge: c, decision: 'approve' })}
                  className="flex-1"
                />
              ) : null}
              {canWaiveCharge(c, perms) ? (
                <Button
                  variant="outline"
                  icon="cancel"
                  title={t('waive')}
                  onPress={() => setPending({ charge: c, decision: 'waive' })}
                  className="flex-1"
                />
              ) : null}
            </View>
          ) : c.status === 'proposed' && c.disputed && !perms.damage ? (
            <Text variant="footnote" tone="muted">
              {t('disputed_hint')}
            </Text>
          ) : null}
        </View>
      ))}
      <DecisionSheet
        pending={pending}
        busy={decide.isPending}
        onClose={() => !decide.isPending && setPending(null)}
        onConfirm={(note) =>
          pending &&
          decide.mutate(
            { ...pending, note },
            {
              onSuccess: () => {
                toast.success(t(pending.decision === 'approve' ? 'approved' : 'waived'));
                setPending(null);
              },
              onError: (e) => toast.error(problemText(e)),
            },
          )
        }
      />
    </Card>
  );
}

function DecisionSheet({
  pending,
  busy,
  onClose,
  onConfirm,
}: {
  pending: Pending;
  busy: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
}) {
  const { t } = useTranslation('returns');
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<{ id: string | null; note: string }>({ id: null, note: '' });
  const id = pending ? `${pending.charge.uuid}:${pending.decision}` : null;
  if (id && state.id !== id) setState({ id, note: '' });
  return (
    <Modal visible={!!pending} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {pending ? (
        <View className="flex-1 bg-background" style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
          <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
            <Text variant="headline" className="flex-1" numberOfLines={1}>
              {t(pending.decision === 'approve' ? 'approve_title' : 'waive_title')}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common:close')} onPress={onClose} hitSlop={10}>
              <Icon name="close" tone="muted-foreground" size={22} />
            </Pressable>
          </View>
          <View className="flex-1 gap-4 px-4 pt-4">
            <Text variant="callout">
              {`${t(`kind_${pending.charge.kind}`)} · ${formatMoney(pending.charge.amount, pending.charge.currency)}`}
            </Text>
            {pending.charge.disputed ? <Notice tone="warning" body={t('disputed_hint')} /> : null}
            <TextArea
              label={t('decision_note')}
              hint={decisionNoteRequired(pending.decision, pending.charge) ? t('note_required') : undefined}
              value={state.note}
              maxLength={1000}
              onChangeText={(note) => setState({ ...state, note })}
            />
          </View>
          <View className="px-4 pt-3">
            <Button
              size="lg"
              variant={pending.decision === 'waive' ? 'destructive' : 'primary'}
              icon={pending.decision === 'waive' ? 'cancel' : 'check'}
              title={t(pending.decision === 'approve' ? 'approve' : 'waive')}
              loading={busy}
              disabled={!decisionReady(pending.decision, pending.charge, state.note)}
              onPress={() => onConfirm(state.note)}
            />
          </View>
        </View>
      ) : null}
    </Modal>
  );
}

function CompleteReturnCard({
  rentalUuid,
  proposed,
  initial,
}: {
  rentalUuid: string;
  proposed: number;
  initial: VehicleStatus;
}) {
  const { t } = useTranslation('returns');
  const complete = useCompleteReturn(rentalUuid);
  const [vehicle, setVehicle] = useState<VehicleStatus>(initial);
  const [note, setNote] = useState('');
  const [depositTask, setDepositTask] = useState(false);
  return (
    <Card title={t('check_title')}>
      <Text variant="footnote" tone="muted">
        {t('check_description')}
      </Text>
      {proposed > 0 ? <Notice tone="warning" body={t('check_open_charges', { count: proposed })} /> : null}
      <VehicleChips value={vehicle} onChange={setVehicle} />
      <TextArea label={t('check_note')} value={note} maxLength={1000} onChangeText={setNote} />
      <SwitchRow label={t('check_deposit_task')} value={depositTask} onChange={setDepositTask} />
      <Button
        size="lg"
        icon="check"
        title={t('complete_return')}
        loading={complete.isPending}
        onPress={() =>
          complete.mutate(completeReturnPayload(vehicle, note, depositTask), {
            onSuccess: () => toast.success(t('return_completed')),
            onError: (e) => toast.error(problemText(e)),
          })
        }
      />
    </Card>
  );
}
