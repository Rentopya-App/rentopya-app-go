import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Share, View } from 'react-native';

import { errorMessage } from '@/core/i18n';
import { Permission, useCan, useCanAll } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { enqueueSignature, removeJob, retryFailed } from '@/features/uploads';
import type { SignatureMeta } from '@/features/uploads/machine';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { Select } from '@/ui/select';
import { StatusPill, type StatusTone } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  codeText,
  evidenceVersion,
  inspectionKeys,
  problemText,
  useApprovalLinkActions,
  useApprovalLinks,
  useContractDocument,
  useContractVersion,
  useDocumentSigners,
  useMediaLinks,
  type ApprovalLink,
} from './api';
import { htmlToText, needsContract, signatureReady } from './model';
import { CheckRow, Notice, PhotoThumb } from './parts';
import { SignaturePad } from './signature-pad';
import { pointCount, signaturePNG, strokesPayload, type SignatureCapture } from './signature-png';
import { useWizard } from './wizard-context';

const LINK_TONES: Record<ApprovalLink['status'], StatusTone> = {
  pending: 'progress',
  approved: 'done',
  expired: 'neutral',
  revoked: 'neutral',
  superseded: 'neutral',
};

/**
 * Step 7: the customer signs on the phone. When the rental contract still
 * needs the customer's approval, the contract version is shown and the same
 * signature approves it (bound to its content hash), or an approval link is
 * sent by SMS and its state followed here. The signature goes through the
 * upload queue, so it is kept even without a connection.
 */
export function SignatureStep() {
  const { t } = useTranslation('inspections');
  const { ins, readOnly, locked, queue, orgSlug, values, setValue, setScrollLocked } = useWizard();
  const can = useCan();
  const [capture, setCapture] = useState<SignatureCapture | null>(null);
  const [resign, setResign] = useState(false);
  const [approve, setApprove] = useState(true);
  const [busy, setBusy] = useState(false);
  const name = values.signer ?? ins.rental.customer.display_name;
  const contract = ins.rental.contract;
  const contractNeeded = needsContract(ins);
  const canReadContract = can(Permission.TenantContractsRead);
  const doc = useContractDocument(contract.document_uuid, contractNeeded && canReadContract);
  const current = doc.data?.current_version ?? null;
  const version = useContractVersion(contractNeeded ? contract.document_uuid : null, current?.uuid);
  const job = queue.jobs.find((j) => j.kind === 'signature');
  const signature = ins.signature;
  const links = useMediaLinks(signature ? ins.uuid : null, signature ? evidenceVersion(ins) : '');

  if (job) {
    const failed = job.state === 'failed';
    return (
      <Card title={t('signature.title')}>
        <Notice
          tone={failed ? 'danger' : 'info'}
          icon={failed ? 'error' : 'clock'}
          title={failed ? t('signature.queue_failed') : t('signature.queued')}
          body={
            failed
              ? job.lastErrorCode
                ? codeText(job.lastErrorCode)
                : undefined
              : t('signature.queued_hint', { name: (job.meta as SignatureMeta).signerName })
          }
        />
        {failed ? (
          <View className="flex-row gap-2">
            <Button
              icon="refresh"
              title={t('common:retry')}
              onPress={() => void retryFailed(ins.uuid)}
              className="flex-1"
            />
            <Button variant="outline" icon="edit" title={t('signature.resign')} onPress={() => void removeJob(job.id)} />
          </View>
        ) : null}
      </Card>
    );
  }

  if (signature && !resign) {
    return (
      <Card title={t('signature.title')}>
        <Notice
          tone="success"
          icon="check"
          body={t('signature.signed_by', { name: signature.signer_name, at: formatShort(signature.signed_at) })}
        />
        <PhotoThumb uri={links.data?.[signature.uuid]} label={t('signature.title')} contain className="aspect-[3/1] bg-white" />
        <Text variant="footnote" tone="muted">
          {t('signature.evidence', { points: signature.point_count, hash: signature.sha256.slice(0, 16) })}
        </Text>
        {signature.contract_approval ? <Notice icon="check" body={t('signature.contract_approved')} /> : null}
        {!readOnly && !signature.contract_approval ? (
          <Button variant="outline" icon="edit" title={t('signature.resign')} onPress={() => setResign(true)} />
        ) : null}
      </Card>
    );
  }

  const points = capture ? pointCount(capture) : 0;
  const withContract = contractNeeded && approve && !!current;
  const disabled =
    readOnly ||
    busy ||
    !ins.customer_reviewed_at ||
    !signatureReady(points, name) ||
    (contractNeeded && approve && !current);

  const save = async () => {
    if (!capture) return;
    setBusy(true);
    try {
      await enqueueSignature({
        orgSlug,
        inspectionUuid: ins.uuid,
        pngBase64: signaturePNG(capture),
        signerName: name.trim(),
        signerRole: 'customer',
        strokes: strokesPayload(capture),
        signedAt: new Date().toISOString(),
        contract:
          withContract && contract.document_uuid && current
            ? { document_uuid: contract.document_uuid, version_uuid: current.uuid, content_hash: current.content_hash }
            : undefined,
        label: `${ins.rental.vehicle.plate} · ${t('signature.title')}`,
      });
      setResign(false);
      setCapture(null);
      setValue('signer', null);
      toast.success(t('signature.saved'));
    } catch {
      toast.error(errorMessage(undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {contractNeeded ? (
        <Card title={t('signature.contract_title')}>
          {!canReadContract ? (
            <Notice tone="warning" body={t('signature.contract_forbidden')} />
          ) : version.data ? (
            <>
              <Text variant="footnote" tone="muted">
                {t('signature.contract_version', {
                  version: version.data.version,
                  hash: version.data.content_hash.slice(0, 12),
                })}
              </Text>
              <ScrollView
                nestedScrollEnabled
                className="max-h-72 rounded-md border border-border bg-background p-3"
                accessibilityLabel={t('signature.contract_title')}>
                <Text variant="callout">{htmlToText(version.data.html)}</Text>
              </ScrollView>
            </>
          ) : (
            <Text tone="muted">{doc.isError ? problemText(doc.error) : t('signature.contract_loading')}</Text>
          )}
          <CheckRow label={t('signature.approve_contract')} value={approve} onChange={() => setApprove(!approve)} />
          <RemoteApproval versionUuid={current?.uuid ?? null} contentHash={current?.content_hash ?? null} />
        </Card>
      ) : null}
      <Card title={t('signature.title')}>
        {!ins.customer_reviewed_at ? <Notice tone="warning" body={t('problems.review_first')} /> : null}
        <Input
          label={t('signature.signer')}
          value={name}
          editable={!readOnly}
          autoCapitalize="words"
          onChangeText={(v) => setValue('signer', v)}
        />
        <SignaturePad
          disabled={readOnly || !ins.customer_reviewed_at}
          onChange={setCapture}
          onDrawing={(d) => setScrollLocked(d)}
        />
        <Button size="lg" icon="edit" title={t('signature.save')} disabled={disabled} loading={busy} onPress={() => void save()} />
        {!locked ? null : (
          <Text variant="footnote" tone="muted">
            {t('signature.offline_ok')}
          </Text>
        )}
      </Card>
    </>
  );
}

/**
 * Remote approval of the contract (TEC-711) for a customer who is not at the
 * counter: an approval link of the shown version, sent by SMS (or shared),
 * and its state polled until approved. The API needs `contracts.read` plus
 * `contracts.write` or `rentals.write`.
 */
function RemoteApproval({ versionUuid, contentHash }: { versionUuid: string | null; contentHash: string | null }) {
  const { t } = useTranslation('inspections');
  const { ins, locked, orgSlug } = useWizard();
  const can = useCan();
  const canAll = useCanAll();
  const docUuid = ins.rental.contract.document_uuid;
  const allowed =
    canAll(Permission.TenantContractsRead) && can(Permission.TenantContractsWrite, Permission.TenantRentalsWrite);
  const [open, setOpen] = useState(false);
  const [signer, setSigner] = useState<string | null>(null);
  const signers = useDocumentSigners(docUuid, allowed && open);
  const links = useApprovalLinks(docUuid, allowed);
  const actions = useApprovalLinkActions(docUuid ?? '');
  const qc = useQueryClient();
  const approvedAt = links.data?.items.find((l) => l.status === 'approved')?.approved_at;
  // An approval given on the link: the form's rental now has an approved contract.
  useEffect(() => {
    if (approvedAt) void qc.invalidateQueries({ queryKey: inspectionKeys.detail(orgSlug, ins.uuid) });
  }, [approvedAt, ins.uuid, orgSlug, qc]);
  if (!allowed || !docUuid) return null;

  const pendingLink = links.data?.items.find((l) => l.status === 'pending');
  const latest = links.data?.items[0];
  const options = (signers.data?.signers ?? [])
    .filter((s) => s.has_phone)
    .map((s) => ({
      value: s.role === 'driver' && s.driver_uuid ? `driver:${s.driver_uuid}` : 'renter',
      label: s.name,
      description: `${t(`signature.signer_role_${s.role}`)} · ${s.phone_masked}`,
    }));
  const smsAvailable = signers.data?.sms_available ?? false;

  const create = () => {
    if (!versionUuid || !contentHash || !signer) return;
    const [role, driver] = signer.split(':');
    actions.create.mutate(
      {
        versionUuid,
        body: {
          content_hash: contentHash,
          signer_role: role === 'driver' ? 'driver' : 'renter',
          driver_uuid: driver,
          send_sms: smsAvailable,
        },
      },
      {
        onSuccess: (out) => {
          setOpen(false);
          if (out.sms_error) toast.error(t('remote.sms_failed'));
          else toast.success(out.sms ? t('remote.sent', { phone: out.sms.phone_masked }) : t('remote.created'));
          if (!out.sms && out.link.url) void Share.share({ message: out.link.url });
        },
        onError: (e) => toast.error(problemText(e)),
      },
    );
  };

  return (
    <View className="gap-3 border-t border-border pt-3">
      <Text className="font-sans-semibold">{t('remote.title')}</Text>
      <Text variant="footnote" tone="muted">
        {t('remote.hint')}
      </Text>
      {latest ? (
        <View className="gap-1.5 rounded-md border border-border p-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1" numberOfLines={1}>
              {`${latest.signer_name} · ${latest.phone_masked}`}
            </Text>
            <StatusPill label={t(`remote.status_${latest.status}`)} tone={LINK_TONES[latest.status]} />
          </View>
          <Text variant="footnote" tone="muted">
            {latest.status === 'approved' && latest.approved_at
              ? t('remote.approved_at', { at: formatShort(latest.approved_at) })
              : t('remote.expires', { at: formatShort(latest.expires_at), count: latest.sms_sent_count })}
          </Text>
          {latest.status === 'pending' ? (
            <Text variant="footnote" tone="muted">
              {t('remote.polling')}
            </Text>
          ) : null}
        </View>
      ) : null}
      {pendingLink ? (
        <View className="flex-row gap-2">
          <Button
            variant="outline"
            icon="phone"
            title={t('remote.resend')}
            disabled={locked}
            loading={actions.send.isPending}
            onPress={() =>
              actions.send.mutate(pendingLink.uuid, {
                onSuccess: (out) => toast.success(t('remote.sent', { phone: out.phone_masked })),
                onError: (e) => toast.error(problemText(e)),
              })
            }
            className="flex-1"
          />
          <Button
            variant="outline"
            icon="refresh"
            title={t('remote.check')}
            loading={links.isFetching}
            onPress={() => void links.refetch()}
          />
        </View>
      ) : null}
      {open ? (
        <View className="gap-3">
          <Select
            label={t('remote.signer')}
            placeholder={signers.isLoading ? t('signature.contract_loading') : t('remote.signer_pick')}
            value={signer}
            options={options}
            onChange={setSigner}
          />
          {signers.data && options.length === 0 ? <Notice tone="warning" body={t('remote.no_phone')} /> : null}
          {signers.data && !smsAvailable ? <Notice body={t('remote.no_sms')} /> : null}
          <Button
            icon="link"
            title={smsAvailable ? t('remote.create_send') : t('remote.create')}
            disabled={!signer || !versionUuid || locked}
            loading={actions.create.isPending}
            onPress={create}
          />
        </View>
      ) : (
        <Button
          variant="outline"
          icon="phone"
          title={pendingLink ? t('remote.new_link') : t('remote.open')}
          disabled={locked || !versionUuid}
          onPress={() => setOpen(true)}
        />
      )}
    </View>
  );
}
