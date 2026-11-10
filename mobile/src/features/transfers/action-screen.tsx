import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Can, Permission } from '@/core/auth/permissions';
import { displayTimeZone } from '@/core/format';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useTransfer, useTransferAction } from './api';
import { InstantField } from './form-screen';
import {
  actionRequest,
  ARRIVAL_STATUSES,
  instantIso,
  transferActions,
  type ArrivalStatus,
  type Instant,
  type Transfer,
  type TransferAction,
} from './lib';

/**
 * Start (departure time, now by default), complete (arrival time and the
 * vehicle status after arrival) or cancel (reason) a transfer; the panel's
 * confirmation dialog as a screen.
 */
export function TransferActionScreen({ uuid, action }: { uuid: string; action: TransferAction }) {
  const { t } = useTranslation('transfers');
  const query = useTransfer(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t(`action_dialog.${action}_title`) }} />
      <Can
        perm={Permission.TenantTransfersWrite}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <View className="flex-1 bg-background">
          <QueryState query={query}>
            {(transfer) =>
              transferActions(transfer).includes(action) ? (
                <ActionForm transfer={transfer} action={action} />
              ) : (
                <EmptyState icon="info" title={t('transfers_app:action_unavailable')} />
              )
            }
          </QueryState>
        </View>
      </Can>
    </>
  );
}

function ActionForm({ transfer, action }: { transfer: Transfer; action: TransferAction }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const run = useTransferAction(transfer.uuid, action);
  const [at, setAt] = useState<Instant | null>(null);
  const [arrival, setArrival] = useState<ArrivalStatus>('preparing');
  const [note, setNote] = useState('');
  const err = formErrors(run.error);
  const submit = () =>
    run.mutate(actionRequest(action, { at: instantIso(at, displayTimeZone()), arrival_status: arrival, note }), {
      onSuccess: () => {
        toast.success(t(`toast.${action === 'start' ? 'started' : action === 'complete' ? 'completed' : 'cancelled'}`));
        router.back();
      },
    });
  return (
    <FormScreen
      footer={
        <>
          {err.message ? (
            <Text variant="footnote" tone="danger">
              {err.message}
            </Text>
          ) : null}
          <Button
            size="lg"
            variant={action === 'cancel' ? 'destructive' : 'primary'}
            title={t(`actions.${action}`)}
            loading={run.isPending}
            onPress={submit}
          />
        </>
      }>
      <Text tone="muted">
        {t(`action_dialog.${action}_description`, {
          plate: transfer.vehicle.plate,
          from: transfer.from_branch.name,
          to: transfer.to_branch.name,
        })}
      </Text>
      {action !== 'cancel' ? (
        <InstantField
          label={action === 'start' ? t('fields.actual_departure') : t('fields.actual_arrival')}
          placeholder={t('fields.now')}
          value={at}
          onChange={setAt}
          onClear={() => setAt(null)}
          error={err.fields.at}
        />
      ) : null}
      {action === 'complete' ? (
        <View className="gap-2">
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('fields.arrival_status')}
          </Text>
          <Chips
            options={ARRIVAL_STATUSES.map((s) => ({ value: s, label: t(`arrival_status.${s}`) }))}
            value={arrival}
            onChange={setArrival}
          />
          <Text variant="footnote" tone="muted">
            {t('fields.arrival_status_hint')}
          </Text>
        </View>
      ) : null}
      <TextArea
        label={action === 'cancel' ? t('fields.cancel_reason') : t('fields.note')}
        value={note}
        onChangeText={setNote}
        maxLength={2000}
        error={err.fields.note}
      />
    </FormScreen>
  );
}
