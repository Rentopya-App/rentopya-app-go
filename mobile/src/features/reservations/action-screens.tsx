import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Permission, useCan } from '@/core/auth/permissions';
import { displayTimeZone, formatMoney, formatShort } from '@/core/format';
import { amountText, parseAmount } from '@/core/money';
import { useBranches } from '@/core/tenant';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { DateField } from '@/ui/date-field';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';
import { toast } from '@/ui/toast';

import {
  problemOf,
  useAccept,
  useApplyChange,
  useAssign,
  useChangeQuote,
  useCollect,
  useCreateLink,
  useCustomerDrivers,
  useExtend,
  usePlate,
  usePlateCandidates,
  useQuoteSearch,
  useReject,
  useReservation,
  useTransition,
  useUpdateDrivers,
} from './api';
import { shareLink, smsLink } from './detail-screen';
import {
  COLLECT_METHODS,
  driversBody,
  endsAfterStart,
  extendsLater,
  initialDrivers,
  personName,
  pickedIso,
  timeOptions,
  toggleDriver,
  wallClock,
  type CollectMethod,
  type DriverPick,
  type Quote,
  type Reservation,
  type ReservationProblem,
} from './lib';
import { Gate, MemberSheet } from './parts';

type Uuid = { uuid: string };

/** Loads the reservation, then renders the form for it; the gate checks the action's permission. */
function WithReservation({
  title,
  perm,
  children,
}: {
  title: string;
  perm: Parameters<typeof Gate>[0]['perm'];
  children: (r: Reservation) => ReactNode;
}) {
  const { uuid } = useLocalSearchParams<Uuid>();
  const query = useReservation(uuid);
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Gate perm={perm}>
        {query.data ? (
          children(query.data)
        ) : (
          <View className="flex-1 bg-background p-4">
            <QueryState query={query}>{() => null}</QueryState>
          </View>
        )}
      </Gate>
    </>
  );
}

/** Problem box of a refused change / extension / drivers call. */
function ProblemBox({ problem, fallback }: { problem: ReservationProblem | null; fallback?: string | null }) {
  const { t } = useTranslation('reservations');
  if (!problem && !fallback) return null;
  let body = fallback ?? '';
  if (problem?.kind === 'capacity') body = t('problems.capacity');
  if (problem?.kind === 'quote_expired') body = t('problems.quote_expired');
  if (problem?.kind === 'quote_used') body = t('problems.quote_used');
  if (problem?.kind === 'price_changed') body = t('problems.price_changed');
  if (problem?.kind === 'drivers') {
    body = problem.drivers
      .filter((d) => !d.eligible)
      .map((d) => `${d.name}: ${d.reasons.map((r) => t(`driver_reasons.${r}`, { defaultValue: r })).join(', ')}`)
      .join(' · ');
  }
  return (
    <View className="gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
      <Text variant="footnote" tone="danger" className="font-sans-semibold">
        {t('problems.change_failed')}
      </Text>
      {body ? <Text variant="callout">{body}</Text> : null}
    </View>
  );
}

function back() {
  if (router.canGoBack()) router.back();
}

// ---------------------------------------------------------------- reason screens

/** "İptal et" / "Gelmedi" with the reason (`tenant.reservations.cancel`). */
export function CancelReservationScreen({ kind }: { kind: 'cancel' | 'no-show' }) {
  const { t } = useTranslation('reservations');
  const noShow = kind === 'no-show';
  return (
    <WithReservation title={noShow ? t('no_show.title') : t('cancel.title')} perm={Permission.TenantReservationsCancel}>
      {(r) => <CancelForm r={r} noShow={noShow} />}
    </WithReservation>
  );
}

function CancelForm({ r, noShow }: { r: Reservation; noShow: boolean }) {
  const { t } = useTranslation('reservations');
  const step = useTransition(r.uuid);
  return (
    <ReasonForm
      description={noShow ? t('no_show.description') : t('cancel.description', { reference: r.reference })}
      label={t('fields.cancel_reason')}
      submitTitle={noShow ? t('actions.no_show') : t('actions.cancel')}
      destructive
      pending={step.isPending}
      error={step.error}
      onSubmit={(reason) =>
        step.mutate(
          { action: noShow ? 'no-show' : 'cancel', reason },
          {
            onSuccess: () => {
              toast.success(t(noShow ? 'toast.no_show' : 'toast.cancelled'));
              back();
            },
          },
        )
      }
    />
  );
}

/** Reject a request / review with a reason (`tenant.reservations.approve`). */
export function RejectReservationScreen() {
  const { t } = useTranslation('payments');
  return (
    <WithReservation title={t('approvals.reject')} perm={Permission.TenantReservationsApprove}>
      {(r) => <RejectForm r={r} />}
    </WithReservation>
  );
}

function RejectForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('payments');
  const reject = useReject(r.uuid);
  return (
    <ReasonForm
      description={`${t('approvals.reject_title', { reference: r.reference })} ${t('approvals.reject_description')}`}
      label={t('approvals.reject_reason')}
      submitTitle={t('approvals.reject')}
      destructive
      pending={reject.isPending}
      error={reject.error}
      onSubmit={(reason) =>
        reject.mutate(reason, {
          onSuccess: () => {
            toast.success(t('toast.rejected'));
            back();
          },
        })
      }
    />
  );
}

// ---------------------------------------------------------------- accept

/**
 * Staff accept (the panel's `AcceptDialog`): capacity at the current
 * availability and price, optional payment link for the prepayment due.
 * A changed price shows the new total and is accepted explicitly.
 */
export function AcceptReservationScreen() {
  const { t } = useTranslation('payments');
  return (
    <WithReservation title={t('approvals.accept')} perm={Permission.TenantReservationsApprove}>
      {(r) => <AcceptForm r={r} />}
    </WithReservation>
  );
}

function AcceptForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('payments');
  const can = useCan();
  const canLink = can(Permission.TenantPaymentsCreateLink);
  const accept = useAccept(r.uuid);
  const [sendLink, setSendLink] = useState(canLink);
  const [note, setNote] = useState('');
  const [replacement, setReplacement] = useState<Quote | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; amount: string; expires_at: string } | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const submit = (quoteUuid?: string) => {
    setProblem(null);
    accept.mutate(
      { send_payment_link: canLink && sendLink, note: note.trim() || undefined, quote_uuid: quoteUuid },
      {
        onSuccess: (out) => {
          toast.success(t('toast.accepted'));
          if (out.payment_link || out.payment_link_error) {
            setLink(out.payment_link);
            setLinkError(out.payment_link_error ?? null);
          } else back();
        },
        onError: (e) => {
          const p = problemOf(e);
          if (p.kind === 'price_changed') setReplacement(p.replacement);
          else setProblem(apiErrorMessage(e));
        },
      },
    );
  };

  if (link || linkError) {
    return (
      <FormScreen footer={<Button size="lg" title={t('accept.done')} onPress={back} />}>
        {link ? <LinkResult reservation={r} link={{ ...link, currency: r.price.currency }} /> : null}
        {linkError ? (
          <View className="gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <Text variant="footnote" tone="danger" className="font-sans-semibold">
              {t('accept.link_failed')}
            </Text>
            <Text variant="callout">{linkError}</Text>
          </View>
        ) : null}
      </FormScreen>
    );
  }

  return (
    <FormScreen
      footer={
        <>
          {problem ? (
            <Text variant="footnote" tone="danger">
              {problem}
            </Text>
          ) : null}
          {replacement ? (
            <Button
              size="lg"
              title={t('accept.accept_new_price')}
              loading={accept.isPending}
              onPress={() => submit(replacement.uuid)}
            />
          ) : (
            <Button
              size="lg"
              icon="check"
              title={t('accept.confirm')}
              loading={accept.isPending}
              onPress={() => submit()}
            />
          )}
        </>
      }>
      <Text variant="headline">{t('accept.title', { reference: r.reference })}</Text>
      <Text tone="muted">{t('accept.description')}</Text>
      {replacement ? (
        <View className="gap-1 rounded-md border border-warning/40 bg-warning/10 p-3">
          <Text variant="footnote" className="font-sans-semibold">
            {t('accept.price_changed_title')}
          </Text>
          <Text variant="callout">
            {t('accept.price_changed_body', {
              old: formatMoney(r.price.total, r.price.currency),
              new: formatMoney(replacement.total, replacement.currency),
            })}
          </Text>
        </View>
      ) : null}
      <SwitchRow
        label={t('accept.send_link')}
        description={t(canLink ? 'accept.send_link_hint' : 'accept.send_link_forbidden')}
        value={canLink && sendLink}
        onChange={setSendLink}
        disabled={!canLink || !!replacement}
      />
      <TextArea label={t('accept.note')} value={note} onChangeText={setNote} maxLength={500} editable={!replacement} />
    </FormScreen>
  );
}

/** A ready payment link: amount, expiry, the link, and send by SMS / share. */
function LinkResult({
  reservation,
  link,
}: {
  reservation: Reservation;
  link: { url: string; amount: string; currency: string; expires_at: string };
}) {
  const { t } = useTranslation('payments');
  const text = t('reservations_app:links.message', {
    reference: reservation.reference,
    amount: formatMoney(link.amount, link.currency),
    url: link.url,
  });
  return (
    <Card title={t('links.created_title')}>
      <Text variant="callout">
        {t('links.summary', {
          amount: formatMoney(link.amount, link.currency),
          expires: formatShort(link.expires_at),
        })}
      </Text>
      <Text variant="footnote" tone="muted" selectable>
        {link.url}
      </Text>
      <Button
        size="lg"
        icon="mail"
        title={t('reservations_app:links.sms')}
        onPress={() => void smsLink(text, t('reservations_app:links.sms_failed'))}
      />
      <Button
        variant="outline"
        icon="externalLink"
        title={t('reservations_app:links.share')}
        onPress={() => void shareLink(text)}
      />
    </Card>
  );
}

// ---------------------------------------------------------------- payment link / collect

/** `POST …/payment-links` (`tenant.payments.create_link`): amount defaults to the prepayment due or the balance. */
export function PaymentLinkScreen() {
  const { t } = useTranslation('payments');
  return (
    <WithReservation title={t('links.create_title')} perm={Permission.TenantPaymentsCreateLink}>
      {(r) => <PaymentLinkForm r={r} />}
    </WithReservation>
  );
}

function PaymentLinkForm({ r }: { r: Reservation }) {
  const { t, i18n } = useTranslation('payments');
  const create = useCreateLink(r.uuid);
  const [amount, setAmount] = useState('');
  const parsed = amount.trim() ? parseAmount(amount) : null;
  const invalid = !!amount.trim() && !parsed;
  if (create.data) {
    return (
      <FormScreen footer={<Button size="lg" title={t('accept.done')} onPress={back} />}>
        <LinkResult reservation={r} link={create.data} />
      </FormScreen>
    );
  }
  return (
    <FormScreen
      footer={
        <>
          {create.error ? (
            <Text variant="footnote" tone="danger">
              {apiErrorMessage(create.error)}
            </Text>
          ) : null}
          <Button
            size="lg"
            icon="link"
            title={t('actions.create_link')}
            disabled={invalid}
            loading={create.isPending}
            onPress={() =>
              create.mutate(parsed ? { amount: parsed } : {}, {
                onSuccess: () => toast.success(t('toast.link_created')),
              })
            }
          />
        </>
      }>
      <Text tone="muted">{t('links.create_description')}</Text>
      <Input
        label={t('fields.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={amountText(
          r.status === 'awaiting_payment' ? r.price.prepayment_due : r.price.balance,
          i18n.language,
        )}
        hint={t('links.amount_hint', { balance: formatMoney(r.price.balance, r.price.currency) })}
        error={invalid ? t('validation.amount') : undefined}
      />
    </FormScreen>
  );
}

/** "Şubede tahsil et" (`tenant.payment.collect`): cash, POS or transfer; amount defaults to the balance. */
export function CollectScreen() {
  const { t } = useTranslation('payments');
  return (
    <WithReservation title={t('collect.title')} perm={Permission.TenantPaymentCollect}>
      {(r) => <CollectForm r={r} />}
    </WithReservation>
  );
}

function CollectForm({ r }: { r: Reservation }) {
  const { t, i18n } = useTranslation('payments');
  const collect = useCollect(r.uuid);
  const [method, setMethod] = useState<CollectMethod>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const parsed = amount.trim() ? parseAmount(amount) : null;
  const invalid = !!amount.trim() && !parsed;
  return (
    <FormScreen
      footer={
        <>
          {collect.error ? (
            <Text variant="footnote" tone="danger">
              {apiErrorMessage(collect.error)}
            </Text>
          ) : null}
          <Button
            size="lg"
            icon="wallet"
            title={t('actions.collect')}
            disabled={invalid}
            loading={collect.isPending}
            onPress={() =>
              collect.mutate(
                { method, ...(parsed ? { amount: parsed } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
                {
                  onSuccess: () => {
                    toast.success(t('toast.collected'));
                    back();
                  },
                },
              )
            }
          />
        </>
      }>
      <Text tone="muted">{t('collect.description')}</Text>
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {t('fields.method')}
      </Text>
      <Chips
        options={COLLECT_METHODS.map((m) => ({ value: m, label: t(`methods.${m}`) }))}
        value={method}
        onChange={setMethod}
      />
      <Input
        label={t('fields.amount')}
        value={amount}
        onChangeText={setAmount}
        keyboardType="decimal-pad"
        placeholder={amountText(r.price.balance, i18n.language)}
        error={invalid ? t('validation.amount') : undefined}
      />
      <TextArea label={t('fields.note')} value={note} onChangeText={setNote} maxLength={500} />
    </FormScreen>
  );
}

// ---------------------------------------------------------------- dates

/** Day (month sheet) and time (strip) of an instant in the organization zone. */
function DateTimeField({
  label,
  day,
  time,
  onDay,
  onTime,
  min,
  error,
}: {
  label: string;
  day: string;
  time: string;
  onDay: (d: string) => void;
  onTime: (t: string) => void;
  min?: string;
  error?: string;
}) {
  return (
    <View className="gap-2">
      <DateField label={`${label} · ${time}`} value={day} onChange={onDay} min={min} error={error} />
      <TimeStrip value={time} onChange={onTime} times={timeOptions(time)} />
    </View>
  );
}

/**
 * "Uzat" (the panel's `ExtendDialog`): a later return; a collision answers
 * EXTENSION_CONFLICT with another vehicle or an upgrade, applied through
 * `/change`, and a resolution task is opened.
 */
export function ExtendScreen() {
  const { t } = useTranslation('reservations');
  return (
    <WithReservation title={t('extend.title')} perm={Permission.TenantReservationsWrite}>
      {(r) => <ExtendForm r={r} />}
    </WithReservation>
  );
}

function ExtendForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const zone = displayTimeZone();
  const start = wallClock(r.ends_at, zone);
  const [day, setDay] = useState(start.day);
  const [time, setTime] = useState(start.time);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<ReservationProblem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const extend = useExtend(r.uuid);
  const apply = useApplyChange(r.uuid);
  const endsAt = pickedIso(day, time, zone);
  const later = extendsLater(endsAt, r.ends_at);

  const onError = (e: unknown) => {
    const p = problemOf(e);
    setProblem(p.kind === 'other' ? null : p);
    setFailed(p.kind === 'other' ? apiErrorMessage(e) : null);
  };
  const done = () => {
    toast.success(t('toast.extended'));
    back();
  };
  const applyAlternative = (quote: Quote) =>
    apply.mutate({ quote_uuid: quote.uuid, reason: t('extend.alternative_reason') }, { onSuccess: done, onError });
  const alt = problem?.kind === 'extension' ? problem.alternatives : null;

  return (
    <FormScreen
      footer={
        <Button
          size="lg"
          icon="calendar"
          title={t('actions.extend')}
          disabled={!later}
          loading={extend.isPending}
          onPress={() => {
            if (!endsAt) return;
            setProblem(null);
            setFailed(null);
            extend.mutate({ ends_at: endsAt, reason: reason.trim() || undefined }, { onSuccess: done, onError });
          }}
        />
      }>
      <Text tone="muted">{t('extend.description')}</Text>
      {problem?.kind === 'extension' ? (
        <View className="gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <Text variant="footnote" tone="danger" className="font-sans-semibold">
            {t('extend.conflict_title')}
          </Text>
          <Text variant="callout">{t('extend.conflict_description')}</Text>
          {alt && alt.vehicles.length > 0 ? (
            <>
              <Text variant="footnote" className="font-sans-semibold">
                {t('extend.other_vehicles')}
              </Text>
              {alt.vehicles.map((v) => (
                <Button
                  key={v.vehicle.uuid}
                  variant="outline"
                  title={`${v.vehicle.plate} · ${formatMoney(v.quote.total, v.quote.currency)}`}
                  disabled={apply.isPending}
                  onPress={() => applyAlternative(v.quote)}
                />
              ))}
            </>
          ) : null}
          {alt && alt.products.length > 0 ? (
            <>
              <Text variant="footnote" className="font-sans-semibold">
                {t('extend.other_products')}
              </Text>
              {alt.products.map((p) => (
                <Button
                  key={p.product.uuid}
                  variant="outline"
                  title={`${p.product.code} · +${formatMoney(p.quote.difference ?? '0', p.quote.currency)}`}
                  disabled={apply.isPending}
                  onPress={() => applyAlternative(p.quote)}
                />
              ))}
            </>
          ) : null}
          {alt && alt.vehicles.length === 0 && alt.products.length === 0 ? (
            <Text variant="callout">{t('extend.no_alternatives')}</Text>
          ) : null}
          <Text variant="footnote">{t('extend.task_opened')}</Text>
        </View>
      ) : (
        <ProblemBox problem={problem} fallback={failed} />
      )}
      <Text variant="callout">{`${t('fields.return')}: ${formatShort(r.ends_at)}`}</Text>
      <DateTimeField
        label={t('extend.new_end')}
        day={day}
        time={time}
        onDay={setDay}
        onTime={setTime}
        min={start.day}
        error={endsAt && !later ? t('validation.extend_later') : undefined}
      />
      <Input label={t('change.reason')} value={reason} onChangeText={setReason} maxLength={500} />
    </FormScreen>
  );
}

// ---------------------------------------------------------------- change

const KEEP = '__keep__';

/**
 * "Değiştir / Yükselt" (the panel's `ChangeDialog`): new dates, branches or
 * product are priced as a change quote first; the change is applied with
 * that quote (capacity, plan and price together) or refused as a whole.
 */
export function ChangeScreen() {
  const { t } = useTranslation('reservations');
  return (
    <WithReservation title={t('change.title')} perm={Permission.TenantReservationsWrite}>
      {(r) => <ChangeForm r={r} />}
    </WithReservation>
  );
}

function ChangeForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const can = useCan();
  const zone = displayTimeZone();
  const s = wallClock(r.starts_at, zone);
  const e = wallClock(r.ends_at, zone);
  const [pickup, setPickup] = useState(r.pickup_branch.uuid);
  const [ret, setRet] = useState(r.return_branch.uuid);
  const [sDay, setSDay] = useState(s.day);
  const [sTime, setSTime] = useState(s.time);
  const [eDay, setEDay] = useState(e.day);
  const [eTime, setETime] = useState(e.time);
  const [product, setProduct] = useState(KEEP);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [reason, setReason] = useState('');
  const [keepPrice, setKeepPrice] = useState(false);
  const [problem, setProblem] = useState<ReservationProblem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const branches = useBranches();
  const products = useQuoteSearch(
    {
      pickup_branch_uuid: r.pickup_branch.uuid,
      return_branch_uuid: r.return_branch.uuid,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      channel: r.channel,
    },
    can(Permission.TenantQuotesRead),
  );
  const priceQuote = useChangeQuote(r.uuid);
  const apply = useApplyChange(r.uuid);
  const startsAt = pickedIso(sDay, sTime, zone);
  const endsAt = pickedIso(eDay, eTime, zone);
  const ok = endsAfterStart(startsAt, endsAt);

  // The reservation's own branches stay choosable even without branch read.
  const branchOptions = [
    ...(branches.data?.items ?? []).map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` })),
    ...[r.pickup_branch, r.return_branch].map((b) => ({ value: b.uuid, label: `${b.code} · ${b.name}` })),
  ].filter((o, i, all) => all.findIndex((x) => x.value === o.value) === i);
  const productOptions = [
    { value: KEEP, label: t('change.keep_product', { code: r.plan.product.code }) },
    ...(products.data?.items ?? [])
      .filter((i) => i.product.uuid !== r.plan.product.uuid && i.sellable > 0)
      .map((i) => ({ value: i.product.uuid, label: `${i.product.code} · ${i.product.title} (${i.sellable})` })),
  ];
  const onError = (err: unknown) => {
    const p = problemOf(err);
    setProblem(p.kind === 'other' ? null : p);
    setFailed(p.kind === 'other' ? apiErrorMessage(err) : null);
  };

  if (quote) {
    const extension = quote.purpose === 'extension';
    return (
      <FormScreen
        footer={
          <>
            <Button
              size="lg"
              icon="check"
              title={t('change.apply')}
              loading={apply.isPending}
              onPress={() =>
                apply.mutate(
                  { quote_uuid: quote.uuid, reason: reason.trim() || undefined, keep_price: keepPrice },
                  {
                    onSuccess: () => {
                      toast.success(t('toast.changed'));
                      back();
                    },
                    onError,
                  },
                )
              }
            />
            <Button variant="ghost" title={t('common:back')} onPress={() => setQuote(null)} />
          </>
        }>
        <ProblemBox problem={problem} fallback={failed} />
        <Card>
          <View className="flex-row flex-wrap items-center gap-1.5">
            <StatusPill label={t(`quotes.purposes.${quote.purpose}`)} />
            <Text variant="callout" tone="muted">{`${quote.product.code} · ${quote.product.title}`}</Text>
          </View>
          <Text variant="footnote" tone="muted">
            {`${formatShort(quote.starts_at)} → ${formatShort(quote.ends_at)}`}
          </Text>
          <View className="flex-row justify-between">
            <Text>{extension ? t('price.extension_total') : t('price.new_total')}</Text>
            <Text className="font-sans-semibold tabular-nums">{formatMoney(quote.total, quote.currency)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text>{t('price.difference')}</Text>
            <Text className="font-sans-semibold tabular-nums">
              {formatMoney(quote.difference ?? '0', quote.currency)}
            </Text>
          </View>
          {quote.breakdown.warnings.length ? (
            <Text variant="footnote" tone="muted">
              {quote.breakdown.warnings.join(' · ')}
            </Text>
          ) : null}
        </Card>
        <Input label={t('change.reason')} value={reason} onChangeText={setReason} maxLength={500} />
        {can(Permission.TenantPriceOverride) ? (
          <SwitchRow
            label={t('change.keep_price')}
            description={t('change.keep_price_hint')}
            value={keepPrice}
            onChange={setKeepPrice}
          />
        ) : null}
      </FormScreen>
    );
  }

  return (
    <FormScreen
      footer={
        <Button
          size="lg"
          title={t('change.price')}
          disabled={!ok}
          loading={priceQuote.isPending}
          onPress={() => {
            if (!startsAt || !endsAt) return;
            setProblem(null);
            setFailed(null);
            priceQuote.mutate(
              {
                pickup_branch_uuid: pickup,
                return_branch_uuid: ret,
                starts_at: startsAt,
                ends_at: endsAt,
                product_uuid: product === KEEP ? null : product,
              },
              { onSuccess: setQuote, onError },
            );
          }}
        />
      }>
      <Text tone="muted">{t('change.description')}</Text>
      <ProblemBox problem={problem} fallback={failed} />
      <Select label={t('fields.pickup_branch')} value={pickup} options={branchOptions} onChange={setPickup} />
      <Select label={t('fields.return_branch')} value={ret} options={branchOptions} onChange={setRet} />
      <DateTimeField label={t('fields.starts_at')} day={sDay} time={sTime} onDay={setSDay} onTime={setSTime} />
      <DateTimeField
        label={t('fields.ends_at')}
        day={eDay}
        time={eTime}
        onDay={setEDay}
        onTime={setETime}
        min={sDay}
        error={!ok ? t('validation.ends_after_start') : undefined}
      />
      <Select label={t('fields.product')} value={product} options={productOptions} onChange={setProduct} searchable />
      <Text variant="footnote" tone="muted">
        {t('change.product_hint')}
      </Text>
    </FormScreen>
  );
}

// ---------------------------------------------------------------- plate

/**
 * "Plaka değiştir / ata" (the panel's `PlateDialog`): the vehicles the
 * engine can move the plan to; `fix` promises the plate to the customer.
 */
export function PlateScreen() {
  const { t } = useTranslation('reservations');
  return (
    <WithReservation title={t('plate.title')} perm={Permission.TenantReservationsWrite}>
      {(r) => <PlateForm r={r} />}
    </WithReservation>
  );
}

function PlateForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const candidates = usePlateCandidates(r.uuid);
  const plate = usePlate(r.uuid);
  const [selected, setSelected] = useState<string | null>(null);
  const [fix, setFix] = useState(r.plan.plate_fixed);
  const [reason, setReason] = useState('');
  const current = r.plan.assigned_vehicle?.plate ?? r.plan.planned_vehicle?.plate ?? '—';
  return (
    <FormScreen
      footer={
        <>
          {plate.error ? (
            <Text variant="footnote" tone="danger">
              {apiErrorMessage(plate.error)}
            </Text>
          ) : null}
          <Button
            size="lg"
            icon="car"
            title={t('actions.save')}
            disabled={!selected}
            loading={plate.isPending}
            onPress={() =>
              selected &&
              plate.mutate(
                { vehicle_uuid: selected, fix, reason: reason.trim() || undefined },
                {
                  onSuccess: (res) => {
                    toast.success(t('toast.plate_changed', { reference: res.reference }));
                    back();
                  },
                },
              )
            }
          />
        </>
      }>
      <Text tone="muted">{t('plate.description', { plate: current })}</Text>
      <QueryState query={candidates} rows={3}>
        {(data) =>
          data.items.length === 0 ? (
            <View className="gap-1 px-1">
              <Text variant="headline">{t('plate.empty')}</Text>
              <Text tone="muted">{t('plate.empty_description')}</Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-lg border border-border bg-card">
              {data.items.map((v, i) => {
                const on = v.uuid === selected;
                return (
                  <Pressable
                    key={v.uuid}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setSelected(v.uuid)}
                    className={`min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-muted ${i < data.items.length - 1 ? 'border-b border-border' : ''}`}>
                    <View className="flex-1 gap-0.5">
                      <Text className="font-sans-semibold">{v.plate}</Text>
                      {v.label ? (
                        <Text variant="footnote" tone="muted">
                          {v.label}
                        </Text>
                      ) : null}
                    </View>
                    {on ? <Icon name="check" tone="primary" size={18} /> : null}
                  </Pressable>
                );
              })}
            </View>
          )
        }
      </QueryState>
      <SwitchRow label={t('plate.fix')} description={t('plate.fix_hint')} value={fix} onChange={setFix} />
      <Input label={t('change.reason')} value={reason} onChangeText={setReason} maxLength={500} />
    </FormScreen>
  );
}

// ---------------------------------------------------------------- drivers

/**
 * Drivers of the reservation (the panel's `DriversDialog`): the customer's
 * drivers, one primary; an ineligible one needs the override permission
 * and a reason.
 */
export function DriversScreen() {
  const { t } = useTranslation('reservations');
  return (
    <WithReservation title={t('drivers.edit_title')} perm={Permission.TenantReservationsWrite}>
      {(r) => <DriversForm r={r} />}
    </WithReservation>
  );
}

function DriversForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const can = useCan();
  const drivers = useCustomerDrivers(r.customer.uuid);
  const update = useUpdateDrivers(r.uuid);
  const [pick, setPick] = useState<DriverPick>(() => initialDrivers(r.drivers));
  const [problem, setProblem] = useState<ReservationProblem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const save = (withOverride: boolean) => {
    setProblem(null);
    setFailed(null);
    update.mutate(driversBody(pick, withOverride ? override.trim() : undefined), {
      onSuccess: () => {
        toast.success(t('toast.drivers_updated'));
        back();
      },
      onError: (e) => {
        const p = problemOf(e);
        setProblem(p.kind === 'other' ? null : p);
        setFailed(p.kind === 'other' ? apiErrorMessage(e) : null);
      },
    });
  };
  const canOverride = problem?.kind === 'drivers' && can(Permission.TenantReservationsOverrideEligibility);
  return (
    <FormScreen
      footer={<Button size="lg" title={t('actions.save')} loading={update.isPending} onPress={() => save(false)} />}>
      <Text tone="muted">{t('drivers.help')}</Text>
      <ProblemBox problem={problem} fallback={failed} />
      {problem?.kind === 'drivers' && !canOverride ? (
        <Text variant="footnote" tone="muted">
          {t('problems.override_forbidden')}
        </Text>
      ) : null}
      {canOverride ? (
        <View className="gap-2">
          <Input label={t('problems.override_reason')} value={override} onChangeText={setOverride} maxLength={500} />
          <Button
            variant="destructive"
            title={t('problems.override')}
            disabled={override.trim().length < 3 || update.isPending}
            onPress={() => save(true)}
          />
        </View>
      ) : null}
      <QueryState query={drivers} rows={3}>
        {(data) =>
          data.items.length === 0 ? (
            <View className="gap-1 px-1">
              <Text variant="headline">{t('drivers.empty')}</Text>
              <Text tone="muted">{t('drivers.empty_description')}</Text>
            </View>
          ) : (
            <View className="overflow-hidden rounded-lg border border-border bg-card">
              {data.items.map((d, i) => {
                const on = pick.selected.includes(d.uuid);
                const primary = pick.primary === d.uuid;
                return (
                  <View
                    key={d.uuid}
                    className={`flex-row items-center gap-3 px-4 py-3 ${i < data.items.length - 1 ? 'border-b border-border' : ''}`}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => setPick((p) => toggleDriver(p, d.uuid))}
                      className="flex-1 flex-row items-center gap-3 active:opacity-70">
                      <View
                        className={`size-6 items-center justify-center rounded-md border ${on ? 'border-primary bg-primary' : 'border-border'}`}>
                        {on ? <Icon name="check" tone="primary-foreground" size={14} /> : null}
                      </View>
                      <View className="flex-1 gap-0.5">
                        <Text className="font-sans-semibold">
                          {d.full_name}
                          {d.is_customer_self ? ` (${t('drivers.self')})` : ''}
                        </Text>
                        <Text variant="footnote" tone={d.licence_expired ? 'danger' : 'muted'}>
                          {[
                            d.licence_class,
                            d.licence_masked,
                            d.age != null ? `${t('drivers.columns.age')} ${d.age}` : null,
                            d.licence_years != null ? `${t('drivers.columns.licence_years')} ${d.licence_years}` : null,
                            d.licence_expired ? t('drivers.licence_expired') : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                    </Pressable>
                    {on ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityState={{ selected: primary }}
                        onPress={() => setPick((p) => ({ ...p, primary: d.uuid }))}
                        className={`rounded-full border px-2.5 py-1 ${primary ? 'border-primary bg-primary' : 'border-border'}`}>
                        <Text
                          variant="footnote"
                          className={`font-sans-semibold ${primary ? 'text-primary-foreground' : 'text-foreground'}`}>
                          {t('drivers.primary_short')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </View>
          )
        }
      </QueryState>
    </FormScreen>
  );
}

// ---------------------------------------------------------------- assign

/** "Personel ata" (the panel's `AssignDialog`): a member, or nobody to clear. */
export function AssignScreen() {
  const { t } = useTranslation('reservations');
  return (
    <WithReservation title={t('assign.title')} perm={Permission.TenantReservationsWrite}>
      {(r) => <AssignForm r={r} />}
    </WithReservation>
  );
}

function AssignForm({ r }: { r: Reservation }) {
  const { t } = useTranslation('reservations');
  const assign = useAssign(r.uuid);
  const [open, setOpen] = useState(true);
  return (
    <FormScreen>
      <Text tone="muted">{t('assign.clear_hint')}</Text>
      <Card>
        <Text variant="footnote" tone="muted">
          {t('fields.assigned_user')}
        </Text>
        <Text variant="headline">{personName(r.assigned_user) || '—'}</Text>
        <Button variant="outline" icon="customer" title={t('assign.placeholder')} onPress={() => setOpen(true)} />
      </Card>
      <MemberSheet
        visible={open}
        title={t('assign.title')}
        value={r.assigned_user?.uuid ?? null}
        onClose={() => setOpen(false)}
        onPick={(user) => {
          setOpen(false);
          assign.mutate(user, {
            onSuccess: () => {
              toast.success(t('toast.assigned'));
              back();
            },
            onError: (e) => toast.error(apiErrorMessage(e)),
          });
        }}
      />
    </FormScreen>
  );
}
