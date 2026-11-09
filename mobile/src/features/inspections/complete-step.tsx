import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { waitUntilDrained } from '@/features/uploads';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { inspectionKeys, problemText, useCompleteInspection } from './api';
import { completeGate, completePayload, type Inspection } from './model';
import { Notice } from './parts';
import { clearDraft } from './wizard-draft';
import { useWizard } from './wizard-context';

function Row({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View className="flex-row items-center gap-2.5">
      <Icon name={ok ? 'check' : 'clock'} tone={ok ? 'success' : 'muted-foreground'} size={18} />
      <Text variant="callout" tone={ok ? 'default' : 'muted'} className="flex-1">
        {label}
      </Text>
    </View>
  );
}

/** How long "Tamamla" waits for the device queue before saying what is still waiting. */
const DRAIN_TIMEOUT_MS = 90_000;

/**
 * Step 8: what still blocks the form (RT-A17, the API refuses the same),
 * then the completion. The photos and the signature still on the device are
 * sent first (`waitUntilDrained`); the API then runs the rentals handover /
 * return in the same transaction as the form.
 */
export function CompleteStep({ finished }: { finished?: (ins: Inspection) => ReactNode }) {
  const { t } = useTranslation('inspections');
  const { ins, online, queue, values, setValue, orgSlug } = useWizard();
  const can = useCan();
  const qc = useQueryClient();
  const complete = useCompleteInspection(ins.uuid);
  const [waiting, setWaiting] = useState(false);
  const reason = values.no_signature_reason ?? '';
  const contractReason = values.contract_reason ?? '';
  const handover = ins.kind === 'handover';
  const waivePerm = can(Permission.TenantSignatureWaive);
  const r = ins.readiness;
  const gate = completeGate(ins, {
    queuePending: queue.pending,
    noSignatureReason: reason,
    contractReason,
    canWaiveSignature: waivePerm,
  });

  if (ins.status !== 'draft') {
    const review = ins.review_status === 'pending';
    return (
      <>
        <Card title={t('complete.done_title')}>
          <Notice
            tone={review ? 'danger' : 'success'}
            title={
              review ? t('complete.in_review') : t(handover ? 'complete.handed_over' : 'complete.returned')
            }
            body={review ? t('complete.in_review_hint') : t('complete.done_hint')}
          />
          <Button
            variant="outline"
            icon="car"
            title={t('complete.open_rental')}
            onPress={() => router.push({ pathname: '/rentals/[uuid]', params: { uuid: ins.rental.uuid } })}
          />
          <Button variant="outline" icon="home" title={t('complete.back_home')} onPress={() => router.dismissAll()} />
        </Card>
        {finished?.(ins)}
      </>
    );
  }

  const submit = async () => {
    try {
      if (queue.pending > 0) {
        setWaiting(true);
        const left = await waitUntilDrained(ins.uuid, { timeoutMs: DRAIN_TIMEOUT_MS });
        setWaiting(false);
        if (left.pending > 0 || left.failed > 0) {
          toast.error(t('complete.queue_not_drained', { count: left.pending + left.failed }));
          return;
        }
      }
      // The server's readiness after the last upload.
      await qc.refetchQueries({ queryKey: inspectionKeys.detail(orgSlug, ins.uuid) });
      const fresh = qc.getQueryData<Inspection>(inspectionKeys.detail(orgSlug, ins.uuid)) ?? ins;
      const done = await complete.mutateAsync(completePayload(fresh, reason, contractReason));
      clearDraft(ins.uuid);
      setValue('no_signature_reason', null);
      setValue('contract_reason', null);
      toast.success(done.review_status === 'pending' ? t('toast.in_review') : t('toast.completed'));
    } catch (e) {
      setWaiting(false);
      toast.error(problemText(e));
    }
  };

  return (
    <>
      <Card title={t('complete.checklist')}>
        <Row
          ok={gate.slotsOk}
          label={gate.slotsOk ? t('complete.slots_ok') : t('complete.slots_missing', { count: r.missing_slots.length })}
        />
        <Row
          ok={gate.uploadsOk}
          label={
            gate.uploadsOk
              ? t('complete.uploads_ok')
              : t('complete.uploads_pending', { count: r.incomplete_photos + queue.pending })
          }
        />
        <Row
          ok={gate.damagesOk}
          label={
            gate.damagesOk
              ? t('complete.damages_ok')
              : t('complete.damages_missing', { count: r.damages_without_photo.length })
          }
        />
        <Row ok={gate.fieldsOk} label={t('complete.fields')} />
        <Row ok={gate.signed} label={t('complete.signature')} />
        {queue.failed > 0 ? <Notice tone="danger" body={t('complete.queue_failed', { count: queue.failed })} /> : null}
      </Card>
      {!gate.signed ? (
        <Card title={t('complete.no_signature')}>
          <TextArea
            label={t(handover ? 'complete.waiver_reason' : 'complete.refusal_reason')}
            hint={t(handover ? 'complete.waiver_hint' : 'complete.refusal_hint')}
            error={handover && !waivePerm ? t('complete.waiver_forbidden') : undefined}
            value={reason}
            maxLength={1000}
            onChangeText={(v) => setValue('no_signature_reason', v)}
          />
        </Card>
      ) : null}
      {gate.needsContractWaiver && !ins.signature?.contract_approval ? (
        <Card title={t('complete.contract_title')}>
          <TextArea
            label={t('complete.contract_waiver')}
            hint={t('complete.contract_waiver_hint')}
            value={contractReason}
            maxLength={1000}
            onChangeText={(v) => setValue('contract_reason', v)}
          />
        </Card>
      ) : null}
      {!online ? <Notice tone="warning" icon="offline" body={t('offline.complete')} /> : null}
      <Button
        size="lg"
        icon="check"
        title={waiting ? t('complete.waiting_uploads', { count: queue.pending }) : t('complete.submit')}
        disabled={!online || !gate.readyButQueue || queue.failed > 0}
        loading={waiting || complete.isPending}
        onPress={() => void submit()}
      />
    </>
  );
}
