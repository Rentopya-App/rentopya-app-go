import { randomUUID } from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, RefreshControl, Share, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { apiErrorMessage } from '@/core/i18n';
import { formatMoney, formatShort } from '@/core/format';
import { parseAmount } from '@/core/money';
import { useSelectedBranch } from '@/core/tenant';
import { Facts, Notice } from '@/features/inspections/parts';
import { Button } from '@/ui/button';
import { Card, Stat } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen, Screen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useCancelDeposit,
  useDeposit,
  useDeposits,
  useDepositTotals,
  useRentalCharges,
  useRentalDeposits,
  useResolveDeposit,
  useVerifyDeposit,
} from './api';
import {
  cancelReasonText,
  cashHeld,
  chargeKindKey,
  DEDUCTION_TARGETS,
  deductibleCharges,
  deductionTargetKey,
  DEPOSIT_STATUSES,
  DEPOSIT_TONE,
  depositMethodKey,
  depositStatusKey,
  emptyLine,
  fromCents,
  HELD_OVER_PRESETS,
  resolvePayload,
  resolveTotals,
  type DeductionLine,
  type ResolveForm,
  type SecurityDeposit,
} from './model';
import { DepositRow, Figures, Forbidden } from './parts';

const ALL = '__all__';

/**
 * "Depozitolar" (`tenant.finance.deposits.read`): every deposit and
 * pre-authorization with the totals, state and "held over N days" filters
 * and the menu's branch filter. `?rental=` (a return or task link) narrows it
 * to one rental. A row opens the deposit and its resolution.
 */
export function DepositsScreen() {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const can = useCan();
  const readable = can(Permission.TenantFinanceDepositsRead);
  const params = useLocalSearchParams<{ rental?: string }>();
  const branch = useSelectedBranch();
  const [status, setStatus] = useState<string>(ALL);
  const [heldOver, setHeldOver] = useState<string>(ALL);
  const days = heldOver === ALL ? null : Number(heldOver);
  const query = useDeposits(
    { status: status === ALL ? null : status, branch: branch.branchUuid, heldOver: days, rental: params.rental },
    readable,
  );
  const totals = useDepositTotals(days, readable);
  const sums = totals.data;
  const filtered = status !== ALL || heldOver !== ALL || !!params.rental;

  const header = (
    <>
      {sums ? (
        <Card>
          <View className="flex-row gap-4">
            <Stat label={t('deposits:totals.held')} value={formatMoney(sums.held_amount, sums.currency)} />
            <Stat
              label={t('deposits:totals.held_over', { days: sums.held_over_days })}
              value={String(sums.held_over)}
            />
          </View>
          <Text variant="footnote" tone="muted">
            {[
              t('deposits:totals.count', { count: sums.held_count }),
              sums.pending_count > 0 ? t('deposits:totals.pending', { count: sums.pending_count }) : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Card>
      ) : null}
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...DEPOSIT_STATUSES.map((s) => ({ value: s, label: t(depositStatusKey(s)) })),
        ]}
        value={status}
        onChange={setStatus}
      />
      <Chips
        options={[
          { value: ALL, label: t('deposits:filters.held_over_any') },
          ...HELD_OVER_PRESETS.map((d) => ({ value: String(d), label: t('held_over_chip', { days: d }) })),
        ]}
        value={heldOver}
        onChange={setHeldOver}
      />
      {params.rental ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('rental_filter')}
        </Text>
      ) : branch.branch ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('branch_filter', { name: branch.branch.name })}
        </Text>
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('deposits:title') }} />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(d) => d.uuid}
          empty={filtered ? t('deposits:empty_filtered') : t('deposits:empty')}
          renderItem={(d, _i, last) => (
            <DepositRow d={d} last={last} onPress={() => router.push(`/finance/deposits/${d.uuid}`)} />
          )}
        />
      ) : (
        <Forbidden body={t('deposits:forbidden')} />
      )}
    </>
  );
}

/**
 * One deposit (the panel's deposit drawer): figures, where it is held, the
 * online pre-auth page while pending, the deductions, and the actions the API
 * allows (`capabilities`): verify, release / pay back in full, deduct, cancel.
 */
export function DepositScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const can = useCan();
  const readable = can(Permission.TenantFinanceDepositsRead);
  const query = useDeposit(readable ? uuid : '');
  return (
    <>
      <Stack.Screen options={{ title: t('deposits:detail.title') }} />
      {readable ? (
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>{(d) => <DepositBody d={d} />}</QueryState>
        </Screen>
      ) : (
        <Forbidden body={t('deposits:forbidden')} />
      )}
    </>
  );
}

function DepositBody({ d }: { d: SecurityDeposit }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const can = useCan();
  const verify = useVerifyDeposit(d.uuid);
  const write = can(Permission.TenantFinanceDepositsWrite);
  const held = cashHeld(d.method);
  const open = d.status === 'held' || d.status === 'pending';
  const notes = [d.note, d.resolution_note, d.cancel_reason ? cancelReasonText(d.cancel_reason, t) : '']
    .filter(Boolean)
    .join('\n');
  const facts = [
    { label: t('deposits:columns.branch'), value: d.branch.name ?? '—' },
    { label: t('deposits:columns.held_at'), value: d.held_at ? formatShort(d.held_at) : '—' },
    ...(d.cash_account
      ? [
          {
            label: t('deposits:columns.cash_account'),
            value: `${d.cash_account.code ?? ''} · ${d.cash_account.name ?? ''}`,
          },
        ]
      : []),
    ...(d.pos_reference ? [{ label: t('deposits:fields.pos_reference'), value: d.pos_reference }] : []),
    ...(d.provider_payment_id
      ? [{ label: t('deposits:detail.provider_reference'), value: d.provider_payment_id }]
      : []),
    ...(d.authorization_expires_at
      ? [{ label: t('deposits:fields.hold_until'), value: formatShort(d.authorization_expires_at) }]
      : []),
    ...(d.resolved_at ? [{ label: t('deposits:columns.resolved_at'), value: formatShort(d.resolved_at) }] : []),
  ];

  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill label={t(depositStatusKey(d.status))} tone={DEPOSIT_TONE[d.status]} />
          <Text variant="footnote" tone="muted">
            {t(depositMethodKey(d.method))}
          </Text>
        </View>
        <View className="gap-0.5">
          <Text variant="figure">{formatMoney(d.amount, d.currency)}</Text>
          <Text variant="callout" tone="muted" numberOfLines={1}>
            {[d.rental.code, d.customer.name].filter(Boolean).join(' · ')}
          </Text>
          {d.status === 'held' && d.held_days > 0 ? (
            <Text variant="footnote" tone="muted">
              {t('deposits:detail.held_days', { days: d.held_days })}
            </Text>
          ) : null}
        </View>
        <Figures
          items={[
            { label: t('deposits:columns.captured'), value: formatMoney(d.captured_amount, d.currency) },
            {
              label: t(
                open ? 'deposits:columns.open' : held ? 'deposits:resolve.paid_back' : 'deposits:resolve.released',
              ),
              value: formatMoney(open ? d.open_amount : d.returned_amount, d.currency),
            },
          ]}
        />
      </Card>

      {d.status === 'pending' && d.payment_page_url ? (
        <Notice title={t('deposits:detail.preauth_page')} body={t('deposits:detail.preauth_hint')}>
          <View className="flex-row flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              icon="link"
              title={t('share_link')}
              onPress={() => void Share.share({ message: d.payment_page_url, url: d.payment_page_url })}
            />
            <Button
              variant="ghost"
              icon="externalLink"
              title={t('deposits:actions.open_page')}
              onPress={() => void Linking.openURL(d.payment_page_url)}
            />
          </View>
        </Notice>
      ) : null}
      {d.customer_notice_status === 'pending' ? <Notice body={t('deposits:detail.notice_pending')} /> : null}

      {write && (d.capabilities.verify || d.capabilities.release || d.capabilities.deduct || d.capabilities.cancel) ? (
        <View className="gap-2">
          {d.capabilities.deduct ? (
            <Button
              icon="remove"
              title={t('deposits:actions.deduct')}
              onPress={() => router.push(`/finance/deposits/${d.uuid}/resolve?mode=deduct`)}
            />
          ) : null}
          {d.capabilities.release ? (
            <Button
              icon="refresh"
              variant={d.capabilities.deduct ? 'outline' : 'primary'}
              title={t(held ? 'deposits:actions.refund_full' : 'deposits:actions.release_full')}
              onPress={() => router.push(`/finance/deposits/${d.uuid}/resolve?mode=release`)}
            />
          ) : null}
          {d.capabilities.verify ? (
            <Button
              icon="security"
              variant="outline"
              title={t('deposits:actions.verify')}
              loading={verify.isPending}
              onPress={() =>
                verify.mutate(undefined, {
                  onSuccess: (out) =>
                    toast.success(
                      t(
                        out.status === 'held'
                          ? 'deposits:toast.verified'
                          : out.status === 'cancelled'
                            ? 'deposits:toast.declined'
                            : 'deposits:toast.still_pending',
                      ),
                    ),
                  onError: (e) => toast.error(apiErrorMessage(e)),
                })
              }
            />
          ) : null}
          {d.capabilities.cancel ? (
            <Button
              icon="cancel"
              variant="ghost"
              title={t('deposits:actions.cancel')}
              onPress={() => router.push(`/finance/deposits/${d.uuid}/cancel`)}
            />
          ) : null}
        </View>
      ) : null}

      <Card title={t('deposits:detail.title')}>
        <Facts rows={facts} />
        {notes ? (
          <Text variant="footnote" tone="muted">
            {notes}
          </Text>
        ) : null}
      </Card>

      <View>
        <SectionHeader title={t('linked')} />
        <List>
          <ListRow
            icon="car"
            title={d.rental.code ?? '—'}
            subtitle={t('deposits:actions.open_rental')}
            onPress={() => router.push(`/rentals/${d.rental.uuid}`)}
            last={!d.reservation?.uuid}
          />
          {d.reservation?.uuid ? (
            <ListRow
              icon="calendar"
              title={d.reservation.code ?? '—'}
              subtitle={t('reservation')}
              onPress={() => router.push(`/reservations/${d.reservation.uuid}`)}
              last
            />
          ) : null}
        </List>
      </View>

      <View>
        <SectionHeader title={`${t('deposits:detail.deductions')} (${d.deductions.length})`} />
        {d.deductions.length ? (
          <List>
            {d.deductions.map((x, i) => (
              <ListRow
                key={x.uuid}
                title={`${formatMoney(x.amount, d.currency)} · ${t(deductionTargetKey(x.applies_to))}`}
                subtitle={[
                  x.reason,
                  x.charge?.code ? t(chargeKindKey(x.charge.code)) : '',
                  x.damage ? t('deposits:detail.damage_link') : '',
                  x.document ? t('has_document') : '',
                ]
                  .filter(Boolean)
                  .join(' · ')}
                last={i === d.deductions.length - 1}
              />
            ))}
          </List>
        ) : (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('deposits:detail.no_deductions')}
          </Text>
        )}
      </View>
    </>
  );
}

function WithDeposit({ uuid, children }: { uuid: string; children: (d: SecurityDeposit) => React.ReactNode }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const can = useCan();
  const allowed = can(Permission.TenantFinanceDepositsRead) && can(Permission.TenantFinanceDepositsWrite);
  const query = useDeposit(allowed ? uuid : '');
  if (!allowed) return <Forbidden body={t('deposits:forbidden')} />;
  return <QueryState query={query}>{(d) => <>{children(d)}</>}</QueryState>;
}

/** "Depozitoyu iptal et": a pre-authorization the customer never completed. */
export function CancelDepositScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  return (
    <>
      <Stack.Screen options={{ title: t('deposits:cancel.title'), presentation: 'modal' }} />
      <WithDeposit uuid={uuid}>{(d) => <CancelForm d={d} />}</WithDeposit>
    </>
  );
}

function CancelForm({ d }: { d: SecurityDeposit }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const cancel = useCancelDeposit(d.uuid);
  return (
    <ReasonForm
      description={t('deposits:cancel.description')}
      label={t('deposits:fields.reason')}
      submitTitle={t('deposits:actions.cancel')}
      destructive
      pending={cancel.isPending}
      error={cancel.error}
      onSubmit={(reason) =>
        cancel.mutate(reason, {
          onSuccess: () => {
            toast.success(t('deposits:toast.cancelled'));
            router.back();
          },
        })
      }
    />
  );
}

/**
 * "Depozitoyu sonuçlandır" after the return: release / pay back in full, or
 * deduct lines (each with a reason, booked on an approved charge, the rent or
 * the general balance) and release / pay back the rest. One idempotency key
 * per opening, so a retried submission never posts twice.
 */
export function ResolveDepositScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const params = useLocalSearchParams<{ mode?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('deposits:resolve.title'), presentation: 'modal' }} />
      <WithDeposit uuid={uuid}>
        {(d) =>
          d.capabilities.release ? (
            <ResolveFormView
              d={d}
              initialMode={params.mode === 'deduct' && d.capabilities.deduct ? 'deduct' : 'release'}
            />
          ) : (
            <Notice tone="warning" body={t('not_resolvable')} />
          )
        }
      </WithDeposit>
    </>
  );
}

function LineEditor({
  line,
  index,
  error,
  charges,
  currency,
  onChange,
  onRemove,
}: {
  line: DeductionLine;
  index: number;
  error?: string;
  charges: { value: string; label: string }[];
  currency: string;
  onChange: (l: DeductionLine) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  return (
    <Card title={t('line_title', { n: index + 1 })}>
      <Input
        label={t('deposits:fields.amount')}
        value={line.amount}
        inputMode="decimal"
        keyboardType="decimal-pad"
        hint={currency}
        error={error === 'amount' ? t('finance:validation.amount') : undefined}
        onChangeText={(amount) => onChange({ ...line, amount })}
      />
      <View className="gap-1.5">
        <Text variant="footnote" tone="muted" className="font-sans-medium">
          {t('deposits:fields.applies_to')}
        </Text>
        <Chips
          options={DEDUCTION_TARGETS.map((x) => ({ value: x, label: t(deductionTargetKey(x)) }))}
          value={line.appliesTo}
          onChange={(appliesTo) => onChange({ ...line, appliesTo })}
        />
      </View>
      {line.appliesTo === 'charge' ? (
        charges.length ? (
          <Select
            label={t('deposits:fields.charge')}
            placeholder={t('deposits:fields.choose')}
            value={line.chargeUuid || null}
            options={charges}
            error={error === 'charge' ? t('deposits:validation.charge') : undefined}
            onChange={(chargeUuid) => onChange({ ...line, chargeUuid })}
          />
        ) : (
          <Notice tone="warning" body={t('deposits:resolve.no_approved_charges')} />
        )
      ) : null}
      <TextArea
        label={t('deposits:fields.reason')}
        value={line.reason}
        maxLength={500}
        error={error === 'reason' ? t('finance:validation.reason') : undefined}
        onChangeText={(reason) => onChange({ ...line, reason })}
      />
      <Button variant="ghost" icon="trash" title={t('deposits:resolve.remove_line')} onPress={onRemove} />
    </Card>
  );
}

function ResolveFormView({ d, initialMode }: { d: SecurityDeposit; initialMode: 'release' | 'deduct' }) {
  const { t } = useTranslation(['finance_app', 'deposits']);
  const [key] = useState(() => randomUUID());
  const [form, setForm] = useState<ResolveForm>(() => ({
    mode: initialMode,
    lines: initialMode === 'deduct' ? [emptyLine(randomUUID())] : [],
    refundAccountUuid: d.cash_account?.uuid ?? '',
    captureAccountUuid: '',
    note: '',
  }));
  const [tried, setTried] = useState(false);
  const deduct = form.mode === 'deduct';
  const held = cashHeld(d.method);
  const card = useRentalDeposits(d.rental.uuid, true);
  const charges = useRentalCharges(d.rental.uuid, d.capabilities.deduct);
  const resolve = useResolveDeposit(d.uuid);
  const chargeOptions = deductibleCharges(charges.data ?? []).map((c) => ({
    value: c.uuid,
    label: `${t(chargeKindKey(c.kind))} · ${formatMoney(c.amount, c.currency)}`,
  }));
  const accounts = card.data?.cash_accounts ?? [];
  const refundOptions = accounts.map((a) => ({ value: a.uuid, label: `${a.code} · ${a.name}` }));
  if (d.cash_account && !refundOptions.some((o) => o.value === d.cash_account!.uuid))
    refundOptions.unshift({
      value: d.cash_account.uuid,
      label: `${d.cash_account.code ?? ''} · ${d.cash_account.name ?? ''}`,
    });
  const bankOptions = [
    { value: '', label: t('deposits:fields.no_capture_account') },
    ...accounts.filter((a) => a.kind === 'bank').map((a) => ({ value: a.uuid, label: `${a.code} · ${a.name}` })),
  ];
  const totals = resolveTotals(d, form, parseAmount);
  const built = resolvePayload(d, form, key, parseAmount);
  const lineErrors = tried && !built.ok ? built.lines : {};
  const formError =
    tried && !built.ok && built.error !== 'lines'
      ? t(built.error === 'no_lines' ? 'deposits:validation.no_lines' : 'deposits:validation.exceeds')
      : undefined;
  const err = formErrors(resolve.error);
  const setLine = (l: DeductionLine) => setForm({ ...form, lines: form.lines.map((x) => (x.key === l.key ? l : x)) });

  return (
    <FormScreen
      footer={
        <>
          {formError || err.message ? (
            <Text variant="footnote" tone="danger">
              {formError ?? err.message}
            </Text>
          ) : null}
          <Button
            size="lg"
            icon="check"
            title={t('deposits:actions.resolve')}
            loading={resolve.isPending}
            onPress={() => {
              setTried(true);
              if (!built.ok) return;
              resolve.mutate(built.body, {
                onSuccess: () => {
                  toast.success(t('deposits:toast.resolved'));
                  router.back();
                },
              });
            }}
          />
        </>
      }>
      <Text tone="muted">
        {t('deposits:resolve.description', { reference: d.rental.code ?? '', method: t(depositMethodKey(d.method)) })}
      </Text>
      {d.capabilities.deduct ? (
        <View className="gap-1.5">
          <Text variant="footnote" tone="muted" className="font-sans-medium">
            {t('deposits:resolve.mode')}
          </Text>
          <Chips
            options={[
              { value: 'release' as const, label: t('deposits:resolve.release_full') },
              { value: 'deduct' as const, label: t('deposits:resolve.deduct') },
            ]}
            value={form.mode}
            onChange={(mode) =>
              setForm({
                ...form,
                mode,
                lines: mode === 'deduct' && !form.lines.length ? [emptyLine(randomUUID())] : form.lines,
              })
            }
          />
        </View>
      ) : (
        <Notice body={t('deposits:resolve.no_deduct')} />
      )}
      <Notice body={t(`deposits:resolve.hint_${d.method}`)} />
      {deduct ? (
        <>
          {form.lines.map((l, i) => (
            <LineEditor
              key={l.key}
              line={l}
              index={i}
              error={lineErrors[l.key]}
              charges={chargeOptions}
              currency={d.currency}
              onChange={setLine}
              onRemove={() => setForm({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}
            />
          ))}
          <Button
            variant="outline"
            icon="add"
            title={t('deposits:resolve.add_line')}
            onPress={() => setForm({ ...form, lines: [...form.lines, emptyLine(randomUUID())] })}
          />
        </>
      ) : null}
      <Card>
        <Facts
          rows={[
            { label: t('deposits:fields.amount'), value: formatMoney(d.amount, d.currency) },
            { label: t('deposits:resolve.deducted'), value: formatMoney(fromCents(totals.deducted), d.currency) },
            {
              label: t(held ? 'deposits:resolve.paid_back' : 'deposits:resolve.released'),
              value: formatMoney(fromCents(Math.max(totals.remainder, 0)), d.currency),
              tone: totals.remainder < 0 ? 'danger' : undefined,
            },
          ]}
        />
      </Card>
      {held ? (
        <Select
          label={t('deposits:fields.refund_account')}
          placeholder={t('deposits:fields.choose')}
          value={form.refundAccountUuid || null}
          options={refundOptions}
          onChange={(refundAccountUuid) => setForm({ ...form, refundAccountUuid })}
        />
      ) : null}
      {d.method === 'pos_preauth' && deduct ? (
        <View className="gap-1.5">
          <Select
            label={t('deposits:fields.capture_account')}
            value={form.captureAccountUuid}
            options={bankOptions}
            onChange={(captureAccountUuid) => setForm({ ...form, captureAccountUuid })}
          />
          <Text variant="footnote" tone="muted">
            {t('deposits:resolve.capture_account_hint')}
          </Text>
        </View>
      ) : null}
      <TextArea
        label={t('deposits:fields.resolution_note')}
        value={form.note}
        maxLength={500}
        onChangeText={(note) => setForm({ ...form, note })}
      />
    </FormScreen>
  );
}
