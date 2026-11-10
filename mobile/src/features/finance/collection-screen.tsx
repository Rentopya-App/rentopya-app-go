import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatShort } from '@/core/format';
import { amountText, parseAmount } from '@/core/money';
import { Facts, Notice } from '@/features/inspections/parts';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { Screen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useCashAccounts, useCollection, useRefundCollection, useVoidCollection } from './api';
import {
  ALLOCATION_TONE,
  allocationStatusKey,
  chargeKindKey,
  COLLECTION_TONE,
  collectionStatusKey,
  itemStatusKey,
  methodKey,
  purposeKey,
  reasonText,
  refundPayload,
  refundStatusKey,
  settlementKey,
  type FinanceCollection,
} from './model';
import { Figures, Forbidden } from './parts';

function actorName(a: { name: string; surname: string; email: string } | null | undefined) {
  if (!a) return '';
  return `${a.name} ${a.surname}`.trim() || a.email;
}

/**
 * One collection (the panel's collection page): the figures (gross /
 * commission / net for online payments), where it landed, the open items it
 * pays and its refunds; refund (`tenant.payment.refund`) and void
 * (`tenant.finance.ledger.adjust`). Allocating the credit stays in the panel.
 */
export function CollectionScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const can = useCan();
  const readable = can(Permission.TenantFinanceAccountsRead);
  const query = useCollection(readable ? uuid : '');
  return (
    <>
      <Stack.Screen options={{ title: query.data?.code ?? t('finance:collections.title') }} />
      {readable ? (
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>{(c) => <Body c={c} />}</QueryState>
        </Screen>
      ) : (
        <Forbidden body={t('finance:forbidden')} />
      )}
    </>
  );
}

function Body({ c }: { c: FinanceCollection }) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const can = useCan();
  const online = c.method === 'online';
  const canRefund = can(Permission.TenantPaymentRefund) && Number(c.refundable) > 0;
  const canVoid = can(Permission.TenantFinanceLedgerAdjust) && c.voidable;
  const allocations = c.allocations ?? [];
  const refunds = c.refunds ?? [];
  const facts = [
    { label: t('finance:fields.method'), value: t(methodKey(c.method)) },
    { label: t('finance:fields.reference_no'), value: c.reference_no || '—' },
    { label: t('finance:fields.payer_name'), value: c.payer_name || '—' },
    { label: t('finance:fields.purpose'), value: t(purposeKey(c.purpose)) },
    { label: t('finance:fields.branch'), value: c.branch?.name ?? t('finance:head_office') },
    {
      label: t('finance:fields.cash_account'),
      value: c.cash_account
        ? `${c.cash_account.code ?? ''} · ${c.cash_account.name ?? ''}`
        : online
          ? t('finance:collection.settlement_pending')
          : '—',
    },
    {
      label: t('finance:fields.recorded_by'),
      value: actorName(c.created_by) || t('finance:collection.system'),
    },
    { label: t('finance:fields.recorded_at'), value: formatShort(c.created_at) },
    ...(c.settled_at ? [{ label: t('finance:fields.settled_at'), value: formatShort(c.settled_at) }] : []),
    ...(c.voided_at ? [{ label: t('finance:fields.void_reason'), value: c.void_reason || '—' }] : []),
  ];

  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill label={t(collectionStatusKey(c.status))} tone={COLLECTION_TONE[c.status]} />
          <StatusPill label={t(allocationStatusKey(c.allocation_status))} tone={ALLOCATION_TONE[c.allocation_status]} />
          {c.settlement_status !== 'none' ? <StatusPill label={t(settlementKey(c.settlement_status))} /> : null}
        </View>
        <View className="gap-0.5">
          <Text variant="figure">{formatMoney(c.amount, c.currency)}</Text>
          <Text variant="callout" tone="muted">
            {[c.account.name || c.account.code, formatCalendarDate(c.collection_date)].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Figures
          items={[
            { label: t('finance:columns.allocated'), value: formatMoney(c.allocated_amount, c.currency) },
            { label: t('finance:columns.credit_left'), value: formatMoney(c.unallocated_amount, c.currency) },
            { label: t('finance:columns.refunded'), value: formatMoney(c.refunded_amount, c.currency) },
            ...(online
              ? [
                  { label: t('finance:columns.gross'), value: formatMoney(c.gross_amount, c.currency) },
                  {
                    label: t('finance:columns.commission'),
                    value: formatMoney(c.commission_amount, c.currency),
                    tone: 'danger' as const,
                  },
                  { label: t('finance:columns.net'), value: formatMoney(c.net_amount, c.currency) },
                ]
              : []),
          ]}
        />
      </Card>

      {canRefund || canVoid ? (
        <View className="gap-2">
          {canRefund ? (
            <Button
              icon="refresh"
              variant="outline"
              title={t('finance:actions.refund')}
              onPress={() => router.push(`/finance/collections/${c.uuid}/refund`)}
            />
          ) : null}
          {canVoid ? (
            <Button
              icon="cancel"
              variant="outline"
              title={t('finance:actions.void')}
              onPress={() => router.push(`/finance/collections/${c.uuid}/void`)}
            />
          ) : null}
        </View>
      ) : null}

      <Card title={t('finance:collection.details')}>
        <Facts rows={facts} />
        {c.note ? (
          <Text variant="footnote" tone="muted">
            {c.note}
          </Text>
        ) : null}
      </Card>

      {c.rental || c.reservation ? (
        <View>
          <SectionHeader title={t('linked')} />
          <List>
            {c.rental ? (
              <ListRow
                icon="car"
                title={c.rental.code ?? '—'}
                subtitle={t('finance:fields.rental')}
                onPress={() => router.push(`/rentals/${c.rental!.uuid}`)}
                last={!c.reservation}
              />
            ) : null}
            {c.reservation ? (
              <ListRow
                icon="calendar"
                title={c.reservation.code ?? '—'}
                subtitle={t('reservation')}
                onPress={() => router.push(`/reservations/${c.reservation!.uuid}`)}
                last
              />
            ) : null}
          </List>
        </View>
      ) : null}

      <View>
        <SectionHeader title={`${t('finance:collection.allocations')} (${allocations.length})`} />
        {allocations.length ? (
          <List>
            {allocations.map((a, i) => (
              <ListRow
                key={a.entry_uuid}
                title={`${formatMoney(a.amount, c.currency)} · ${t(purposeKey(a.purpose))}${
                  a.charge_kind ? ` · ${t(chargeKindKey(a.charge_kind))}` : ''
                }`}
                subtitle={[
                  a.rental?.code ?? a.description,
                  `${t('finance:columns.due_date')}: ${formatCalendarDate(a.due_date)}`,
                  t(itemStatusKey(a.item_status)),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                last={i === allocations.length - 1}
              />
            ))}
          </List>
        ) : (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('finance:collection.no_allocations')}
          </Text>
        )}
      </View>

      <View>
        <SectionHeader title={`${t('finance:collection.refunds')} (${refunds.length})`} />
        {refunds.length ? (
          <List>
            {refunds.map((r, i) => (
              <ListRow
                key={r.uuid}
                title={`${formatMoney(r.amount, r.currency)} · ${t(refundStatusKey(r.status))}`}
                subtitle={[formatShort(r.created_at), reasonText(r.reason), r.failure_reason, r.cash_account?.name]
                  .filter(Boolean)
                  .join(' · ')}
                last={i === refunds.length - 1}
              />
            ))}
          </List>
        ) : (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('finance:collection.no_refunds')}
          </Text>
        )}
      </View>
    </>
  );
}

/** Collection screens that need it loaded and a permission. */
function WithCollection({
  uuid,
  allowed,
  children,
}: {
  uuid: string;
  allowed: boolean;
  children: (c: FinanceCollection) => React.ReactNode;
}) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const query = useCollection(allowed ? uuid : '');
  if (!allowed) return <Forbidden body={t('finance:forbidden')} />;
  return <QueryState query={query}>{(c) => <>{children(c)}</>}</QueryState>;
}

/** "Tahsilatı iade et": amount up to what is refundable, the account the money leaves (manual), a reason. */
export function RefundCollectionScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const can = useCan();
  return (
    <>
      <Stack.Screen options={{ title: t('finance:collection_refund.title'), presentation: 'modal' }} />
      <WithCollection
        uuid={uuid}
        allowed={can(Permission.TenantFinanceAccountsRead) && can(Permission.TenantPaymentRefund)}>
        {(c) => <RefundForm c={c} />}
      </WithCollection>
    </>
  );
}

function RefundForm({ c }: { c: FinanceCollection }) {
  const { t, i18n } = useTranslation(['finance_app', 'finance']);
  const online = !!c.payment_uuid;
  const accounts = useCashAccounts(!online);
  const [amount, setAmount] = useState(() => amountText(c.refundable, i18n.language));
  const [account, setAccount] = useState(c.cash_account?.uuid ?? '');
  const refund = useRefundCollection(c.uuid);
  const options = (accounts.data?.items ?? [])
    .filter((a) => a.currency === c.currency)
    .map((a) => ({ value: a.uuid, label: `${a.code} · ${a.name}` }));
  if (c.cash_account && !options.some((o) => o.value === c.cash_account!.uuid))
    options.unshift({
      value: c.cash_account.uuid,
      label: `${c.cash_account.code ?? ''} · ${c.cash_account.name ?? ''}`,
    });
  const check = refundPayload(c, { amount, reason: 'xxx', cashAccountUuid: account }, parseAmount);
  const amountError =
    !check.ok && amount !== ''
      ? check.error === 'amount'
        ? t('finance:validation.amount')
        : check.error === 'too_much'
          ? t('finance:collection_refund.too_much', { amount: formatMoney(c.refundable, c.currency) })
          : undefined
      : undefined;
  return (
    <ReasonForm
      description={t(online ? 'finance:collection_refund.online_description' : 'finance:collection_refund.description')}
      label={t('finance:fields.reason')}
      submitTitle={t('finance:actions.refund')}
      destructive
      pending={refund.isPending}
      error={refund.error}
      onSubmit={(reason) => {
        const built = refundPayload(c, { amount, reason, cashAccountUuid: account }, parseAmount);
        if (!built.ok) {
          toast.error(
            built.error === 'cash_account' ? t('deposits:validation.cash_account') : t('finance:validation.amount'),
          );
          return;
        }
        refund.mutate(built.body, {
          onSuccess: () => {
            toast.success(t('finance:toast.collection_refunded'));
            router.back();
          },
        });
      }}>
      {Number(c.allocated_amount) > 0 ? <Notice body={t('finance:collection_refund.allocation_hint')} /> : null}
      <Input
        label={t('finance:fields.amount')}
        value={amount}
        onChangeText={setAmount}
        inputMode="decimal"
        keyboardType="decimal-pad"
        hint={t('refundable', { amount: formatMoney(c.refundable, c.currency) })}
        error={amountError}
      />
      {!online ? (
        <Select
          label={t('finance:collection_refund.cash_account')}
          placeholder={t('finance:fields.choose_account')}
          value={account || null}
          options={options}
          onChange={setAccount}
        />
      ) : null}
    </ReasonForm>
  );
}

/** "Tahsilatı iptal et": a manual collection recorded by mistake, closed with a reversing entry. */
export function VoidCollectionScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const can = useCan();
  return (
    <>
      <Stack.Screen options={{ title: t('finance:collection_void.title'), presentation: 'modal' }} />
      <WithCollection
        uuid={uuid}
        allowed={can(Permission.TenantFinanceAccountsRead) && can(Permission.TenantFinanceLedgerAdjust)}>
        {(c) => <VoidForm c={c} />}
      </WithCollection>
    </>
  );
}

function VoidForm({ c }: { c: FinanceCollection }) {
  const { t } = useTranslation(['finance_app', 'finance']);
  const voidIt = useVoidCollection(c.uuid);
  return (
    <ReasonForm
      description={t('finance:collection_void.description')}
      label={t('finance:fields.reason')}
      submitTitle={t('finance:actions.void')}
      destructive
      pending={voidIt.isPending}
      error={voidIt.error}
      onSubmit={(reason) =>
        voidIt.mutate(reason, {
          onSuccess: () => {
            toast.success(t('finance:toast.collection_voided'));
            router.back();
          },
        })
      }>
      <Card>
        <Facts
          rows={[
            { label: c.code, value: formatMoney(c.amount, c.currency) },
            { label: t('finance:fields.method'), value: t(methodKey(c.method)) },
          ]}
        />
      </Card>
    </ReasonForm>
  );
}
