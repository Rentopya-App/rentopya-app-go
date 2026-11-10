import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Permission, useCan } from '@/core/auth/permissions';
import { displayTimeZone, formatMoney, formatShort, formatTime } from '@/core/format';
import { useDebounced } from '@/core/use-debounced';
import { useCustomerDrivers } from '@/features/reservations/api';
import { toggleDriver, type DriverPick } from '@/features/reservations/lib';
import { Gate } from '@/features/reservations/parts';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { OptionSheet } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { createProblemOf, useCreateQuote, useCreateReservation, useCustomerSearch, useProductSearch } from './api';
import { initialForm } from './availability-screen';
import {
  capacityReasonKey,
  createBody,
  discountBlocked,
  modes,
  NO_DISCOUNT,
  pickable,
  quoteBody,
  reachable,
  searchError,
  searchRequest,
  STEPS,
  type CreateProblem,
  type Discount,
  type Mode,
  type Quote,
  type QuoteSearchItem,
  type SearchForm,
  type SearchRequest,
  type Step,
} from './lib';
import { ProblemBox, SearchFields } from './parts';

const STEP_KEYS: Record<Step, string> = {
  search: 'reservations:wizard.steps.search',
  product: 'reservations:wizard.steps.product',
  customer: 'reservations:wizard.steps.customer',
  discount: 'quick_reservation:steps.discount',
  summary: 'reservations:wizard.steps.summary',
};

/**
 * "Yeni rezervasyon" (the panel's `/reservations/create`): search → product
 * → customer and drivers → coupon / discount → summary. The quote is priced
 * on the server and re-checked when the reservation is created; the created
 * reservation's detail opens afterwards.
 */
export function QuickReservationScreen() {
  const { t } = useTranslation('reservations');
  return (
    <>
      <Stack.Screen options={{ title: t('wizard.title') }} />
      <Gate perm={Permission.TenantReservationsWrite} body={t('forbidden')}>
        <Wizard />
      </Gate>
    </>
  );
}

type Customer = { uuid: string; name: string };

function Wizard() {
  const { t } = useTranslation('reservations');
  const zone = displayTimeZone();
  const can = useCan();
  const [step, setStep] = useState<Step>('search');
  const [form, setForm] = useState<SearchForm>(() => initialForm(zone));
  const [tried, setTried] = useState(false);
  const [search, setSearch] = useState<SearchRequest | null>(null);
  const [product, setProduct] = useState<QuoteSearchItem | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [drivers, setDrivers] = useState<DriverPick>({ selected: [], primary: '' });
  const [discount, setDiscount] = useState<Discount>(NO_DISCOUNT);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('standard');
  const [note, setNote] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [problem, setProblem] = useState<CreateProblem | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [override, setOverride] = useState('');
  const products = useProductSearch(step === 'search' ? null : search);
  const createQuote = useCreateQuote();
  const create = useCreateReservation();

  const state = { search: !!search, product: !!product, customer: !!customer, quote: !!quote };
  const go = (s: Step) => reachable(s, state) && setStep(s);
  const dropQuote = () => {
    setQuote(null);
    setProblem(null);
    setFailed(null);
  };

  const makeQuote = () => {
    if (!search || !product || !customer) return;
    setQuoteError(null);
    setCouponError(null);
    dropQuote();
    createQuote.mutate(quoteBody(search, product.product.uuid, customer.uuid, discount, can), {
      onSuccess: (q) => {
        setQuote(q);
        setStep('summary');
      },
      onError: (e) => {
        const p = createProblemOf(e);
        if (p.kind === 'coupon') {
          setCouponError(p.message);
          setStep('discount');
        } else setQuoteError(apiErrorMessage(e));
      },
    });
  };

  const submit = (withOverride?: string) => {
    if (!quote || !customer) return;
    setProblem(null);
    setFailed(null);
    create.mutate(
      createBody({
        quoteUuid: quote.uuid,
        customerUuid: customer.uuid,
        drivers,
        mode,
        note,
        externalReference: externalRef,
        override: withOverride,
      }),
      {
        onSuccess: (r) => {
          toast.success(t('toast.created', { reference: r.reference }));
          router.replace({ pathname: '/reservations/[uuid]', params: { uuid: r.uuid } });
        },
        onError: (e) => {
          const p = createProblemOf(e);
          setProblem(p.kind === 'other' ? null : p);
          setFailed(p.kind === 'other' ? apiErrorMessage(e) : null);
        },
      },
    );
  };

  const index = STEPS.indexOf(step);
  const header = (
    <View className="gap-2">
      <Chips
        options={STEPS.filter((s) => reachable(s, state)).map((s) => ({
          value: s,
          label: `${STEPS.indexOf(s) + 1}. ${t(STEP_KEYS[s])}`,
        }))}
        value={step}
        onChange={go}
      />
      {search ? (
        <Text variant="footnote" tone="muted">
          {[
            `${formatShort(search.starts_at)} → ${formatShort(search.ends_at)}`,
            product ? product.product.code : null,
            customer?.name,
            drivers.selected.length ? t('wizard.drivers_count', { count: drivers.selected.length }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </View>
  );

  if (step === 'search') {
    const err = tried ? searchError(form, zone) : null;
    return (
      <FormScreen
        footer={
          <Button
            size="lg"
            icon="search"
            title={t('availability:actions.search')}
            onPress={() => {
              setTried(true);
              const next = searchRequest(form, zone);
              if (!next) return;
              setSearch(next);
              setProduct(null);
              dropQuote();
              setStep('product');
            }}
          />
        }>
        {header}
        <Text tone="muted">{t('quick_reservation:search_hint', { zone })}</Text>
        <SearchFields form={form} onChange={setForm} error={err} />
      </FormScreen>
    );
  }

  if (step === 'product') {
    return (
      <FormScreen>
        {header}
        <Gate perm={Permission.TenantQuotesRead}>
          <QueryState query={products} rows={3}>
            {(data) => (
              <View className="gap-3">
                {data.warnings.length ? (
                  <Text variant="footnote" tone="muted">
                    {data.warnings.map((w) => t(`warnings.${w}`, { defaultValue: w })).join(' · ')}
                  </Text>
                ) : null}
                {data.items.length === 0 ? (
                  <View className="gap-1 px-1">
                    <Text variant="headline">{t('wizard.results_empty_title')}</Text>
                    <Text tone="muted">{t('wizard.results_empty_description')}</Text>
                  </View>
                ) : null}
                {data.items.map((item) => (
                  <ProductRow
                    key={item.product.uuid}
                    item={item}
                    selected={product?.product.uuid === item.product.uuid}
                    onPick={() => {
                      setProduct(item);
                      dropQuote();
                      setStep('customer');
                    }}
                  />
                ))}
              </View>
            )}
          </QueryState>
        </Gate>
      </FormScreen>
    );
  }

  if (step === 'customer') {
    return (
      <FormScreen
        footer={<Button size="lg" title={t('wizard.next')} disabled={!customer} onPress={() => setStep('discount')} />}>
        {header}
        <CustomerPicker
          value={customer}
          onChange={(c) => {
            setCustomer(c);
            setDrivers({ selected: [], primary: '' });
            dropQuote();
          }}
        />
        {customer ? <DriverPicker customerUuid={customer.uuid} pick={drivers} onChange={setDrivers} /> : null}
      </FormScreen>
    );
  }

  if (step === 'discount') {
    const blocked = discountBlocked(discount, can);
    const canQuote = can(Permission.TenantQuotesWrite);
    return (
      <FormScreen
        footer={
          <>
            {!canQuote ? (
              <Text variant="footnote" tone="muted">
                {t('quick_reservation:quote_forbidden')}
              </Text>
            ) : null}
            <Button
              size="lg"
              icon="wallet"
              title={t('wizard.make_quote')}
              disabled={!canQuote || blocked}
              loading={createQuote.isPending}
              onPress={makeQuote}
            />
          </>
        }>
        {header}
        {quoteError ? <ProblemBox title={t('problems.quote_failed')} body={quoteError} /> : null}
        <DiscountFields
          value={discount}
          onChange={(d) => {
            setDiscount(d);
            setCouponError(null);
            dropQuote();
          }}
          couponError={couponError}
        />
      </FormScreen>
    );
  }

  // summary
  if (!quote) return null;
  const canOverride = problem?.kind === 'drivers' && can(Permission.TenantReservationsOverrideEligibility);
  return (
    <FormScreen
      footer={
        <>
          <Button
            size="lg"
            icon="check"
            title={t('wizard.create')}
            loading={create.isPending}
            onPress={() => submit()}
          />
          <Button variant="ghost" title={t('wizard.back')} onPress={() => setStep(STEPS[index - 1])} />
        </>
      }>
      {header}
      {problem ? (
        <CreateProblemBox
          problem={problem}
          onReplacement={(q) => {
            setQuote(q);
            setProblem(null);
          }}
          onRequote={makeQuote}
          onStep={go}
        />
      ) : failed ? (
        <ProblemBox title={t('problems.generic')} body={failed} />
      ) : null}
      {canOverride ? (
        <View className="gap-2">
          <Input label={t('problems.override_reason')} value={override} onChangeText={setOverride} maxLength={500} />
          <Button
            variant="destructive"
            title={t('problems.override')}
            disabled={override.trim().length < 3 || create.isPending}
            onPress={() => submit(override.trim())}
          />
        </View>
      ) : problem?.kind === 'drivers' ? (
        <Text variant="footnote" tone="muted">
          {t('problems.override_forbidden')}
        </Text>
      ) : null}
      <QuoteCard quote={quote} />
      <Button
        variant="outline"
        icon="refresh"
        title={t('problems.requote')}
        loading={createQuote.isPending}
        onPress={makeQuote}
      />
      <View className="gap-2">
        <Text variant="caption" tone="muted">
          {t('wizard.mode.label')}
        </Text>
        <Chips
          options={modes(can).map((m) => ({ value: m, label: t(`wizard.mode.${m}`) }))}
          value={mode}
          onChange={setMode}
        />
        <Text variant="footnote" tone="muted">
          {t(`wizard.mode.${mode}_hint`)}
        </Text>
      </View>
      <Input
        label={t('fields.external_reference')}
        hint={t('fields.external_reference_hint')}
        value={externalRef}
        onChangeText={setExternalRef}
        maxLength={64}
      />
      <TextArea label={t('fields.note')} value={note} onChangeText={setNote} maxLength={2000} />
    </FormScreen>
  );
}

function ProductRow({ item, selected, onPick }: { item: QuoteSearchItem; selected: boolean; onPick: () => void }) {
  const { t } = useTranslation('reservations');
  const ok = pickable(item);
  return (
    <Card onPress={ok ? onPick : undefined} className={selected ? 'border-primary' : undefined}>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-sans-semibold" numberOfLines={2}>
          {`${item.product.code} · ${item.product.title}`}
        </Text>
        <StatusPill
          label={`${t('wizard.columns.sellable')} ${item.sellable}`}
          tone={item.sellable > 0 ? 'done' : 'problem'}
        />
      </View>
      {item.price ? (
        <View className="flex-row items-end justify-between">
          <Text variant="footnote" tone="muted">
            {`${t('wizard.columns.billing_days')} ${item.price.billing_days} · ${t('wizard.columns.daily_average')} ${formatMoney(item.price.daily_average, item.price.currency)}`}
          </Text>
          <Text variant="headline" className="tabular-nums">
            {formatMoney(item.price.total, item.price.currency)}
          </Text>
        </View>
      ) : (
        <Text variant="footnote" tone="danger">
          {item.price_error?.message ?? t('wizard.price_unavailable')}
        </Text>
      )}
      {item.reasons.map((r) => (
        <Text key={r} variant="footnote" tone="danger">
          {t(`availability:reason.${r}`, { defaultValue: r })}
        </Text>
      ))}
    </Card>
  );
}

function CustomerPicker({ value, onChange }: { value: Customer | null; onChange: (c: Customer) => void }) {
  const { t } = useTranslation('reservations');
  const can = useCan();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const debounced = useDebounced(q);
  const allowed = can(Permission.TenantCustomersRead);
  const customers = useCustomerSearch(debounced.trim(), open && allowed);
  const items = customers.data?.items ?? [];
  return (
    <View className="gap-1.5">
      <Text variant="caption" tone="muted">
        {t('quick_reservation:customer')}
      </Text>
      <Pressable
        accessibilityRole="button"
        disabled={!allowed}
        onPress={() => setOpen(true)}
        className="min-h-[52px] flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 active:bg-muted">
        <Icon name="customer" tone="muted-foreground" size={20} />
        <Text className="flex-1" tone={value ? undefined : 'muted'}>
          {value?.name ?? t('wizard.customer_placeholder')}
        </Text>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {!allowed ? (
        <Text variant="footnote" tone="muted">
          {t('quick_reservation:customers_forbidden')}
        </Text>
      ) : null}
      <OptionSheet
        visible={open}
        title={t('wizard.customer_search')}
        options={items.map((c) => ({
          value: c.uuid,
          label: c.display_name,
          description: [c.phone_masked, c.identity_masked].filter(Boolean).join(' · '),
        }))}
        value={value?.uuid}
        onSearch={setQ}
        loading={customers.isFetching}
        onClose={() => setOpen(false)}
        onPick={(uuid) => {
          const c = items.find((x) => x.uuid === uuid);
          if (c) onChange({ uuid: c.uuid, name: c.display_name });
          setOpen(false);
        }}
      />
    </View>
  );
}

function DriverPicker({
  customerUuid,
  pick,
  onChange,
}: {
  customerUuid: string;
  pick: DriverPick;
  onChange: (p: DriverPick) => void;
}) {
  const { t } = useTranslation('reservations');
  const drivers = useCustomerDrivers(customerUuid);
  return (
    <View className="gap-2">
      <Text variant="caption" tone="muted">
        {t('drivers.title')}
      </Text>
      <QueryState query={drivers} rows={2}>
        {(data) =>
          data.items.length === 0 ? (
            <Text tone="muted">{t('drivers.empty_description')}</Text>
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
                      onPress={() => onChange(toggleDriver(pick, d.uuid))}
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
                            d.age != null ? `${t('drivers.columns.age')} ${d.age}` : null,
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
                        onPress={() => onChange({ ...pick, primary: d.uuid })}
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
    </View>
  );
}

/** Coupon for everyone; the manual discount only with `tenant.discount.apply` (the panel's extras step). */
function DiscountFields({
  value,
  onChange,
  couponError,
}: {
  value: Discount;
  onChange: (d: Discount) => void;
  couponError: string | null;
}) {
  const { t } = useTranslation('reservations');
  const can = useCan();
  const withCoupon = value.coupon.trim() !== '';
  return (
    <View className="gap-4">
      <Input
        label={t('discount.coupon_code')}
        placeholder={t('discount.coupon_placeholder')}
        hint={couponError ? undefined : t('discount.coupon_hint')}
        error={couponError ?? undefined}
        autoCapitalize="characters"
        value={value.coupon}
        onChangeText={(coupon) => onChange({ ...value, coupon: coupon.toUpperCase() })}
      />
      {can(Permission.TenantDiscountApply) ? (
        <Card title={t('discount.manual_title')}>
          <Chips
            options={[
              { value: 'percent' as const, label: t('discount.percent') },
              { value: 'amount' as const, label: t('discount.amount') },
            ]}
            value={value.kind}
            onChange={(kind) => !withCoupon && onChange({ ...value, kind })}
          />
          <Input
            label={t('discount.value')}
            keyboardType="decimal-pad"
            editable={!withCoupon}
            value={value.value}
            onChangeText={(v) => onChange({ ...value, value: v })}
          />
          <Input
            label={t('discount.reason')}
            editable={!withCoupon}
            value={value.reason}
            onChangeText={(reason) => onChange({ ...value, reason })}
            maxLength={500}
          />
          <Text variant="footnote" tone="muted">
            {t('discount.manual_hint')}
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

function CreateProblemBox({
  problem,
  onReplacement,
  onRequote,
  onStep,
}: {
  problem: CreateProblem;
  onReplacement: (q: Quote) => void;
  onRequote: () => void;
  onStep: (s: Step) => void;
}) {
  const { t } = useTranslation('reservations');
  switch (problem.kind) {
    case 'price_changed':
      return (
        <ProblemBox
          title={t('problems.price_changed')}
          body={
            problem.replacement
              ? t('problems.price_changed_detail', {
                  total: formatMoney(problem.replacement.total, problem.replacement.currency),
                })
              : undefined
          }>
          {problem.replacement ? (
            <Button
              variant="outline"
              title={t('problems.use_new_price')}
              onPress={() => onReplacement(problem.replacement!)}
            />
          ) : null}
        </ProblemBox>
      );
    case 'quote_expired':
    case 'quote_used':
      return (
        <ProblemBox title={t(`problems.${problem.kind}`)}>
          <Button variant="outline" icon="refresh" title={t('problems.requote')} onPress={onRequote} />
        </ProblemBox>
      );
    case 'capacity':
      return (
        <ProblemBox title={t('problems.capacity')} body={t(capacityReasonKey(problem.reason))}>
          <Button variant="outline" title={t('problems.pick_other_product')} onPress={() => onStep('product')} />
        </ProblemBox>
      );
    case 'drivers':
      return (
        <ProblemBox
          title={t('problems.drivers')}
          body={problem.drivers
            .filter((d) => !d.eligible)
            .map((d) => `${d.name}: ${d.reasons.map((r) => t(`driver_reasons.${r}`, { defaultValue: r })).join(', ')}`)
            .join(' · ')}>
          <Button variant="outline" title={t('problems.change_drivers')} onPress={() => onStep('customer')} />
        </ProblemBox>
      );
    case 'equipment':
      return <ProblemBox title={t('problems.equipment')} />;
    case 'credit_limit':
      return <ProblemBox title={t('problems.credit_limit')} />;
    default:
      return <ProblemBox title={t('problems.generic')} />;
  }
}

/** Quote totals (the panel's `QuoteSummary`, without the line table). */
function QuoteCard({ quote }: { quote: Quote }) {
  const { t } = useTranslation('reservations');
  const money = (v: string) => formatMoney(v, quote.currency);
  const rows: { key: string; label: string; value: string | null; strong?: boolean }[] = [
    { key: 'rental', label: t('price.rental_subtotal'), value: money(quote.rental_subtotal) },
    {
      key: 'discount',
      label: t('price.discount'),
      value: Number(quote.discount_total) > 0 ? `−${money(quote.discount_total)}` : null,
    },
    {
      key: 'extras',
      label: t('price.extras_total'),
      value: Number(quote.extras_total) > 0 ? money(quote.extras_total) : null,
    },
    {
      key: 'one_way',
      label: t('price.one_way_fee'),
      value: Number(quote.one_way_fee) > 0 ? money(quote.one_way_fee) : null,
    },
    {
      key: 'delivery',
      label: t('price.delivery_fee'),
      value: Number(quote.delivery_fee) > 0 ? money(quote.delivery_fee) : null,
    },
    { key: 'base', label: t('price.base_total'), value: money(quote.base_total) },
    { key: 'vat', label: t('price.vat_total'), value: money(quote.vat_total) },
    { key: 'total', label: t('price.total'), value: money(quote.total), strong: true },
    { key: 'prepayment', label: t('price.prepayment'), value: money(quote.prepayment) },
  ];
  return (
    <Card title={t('wizard.quote_title')}>
      <Text className="font-sans-semibold">{`${quote.product.code} · ${quote.product.title}`}</Text>
      <Text variant="footnote" tone="muted">
        {`${formatShort(quote.starts_at)} → ${formatShort(quote.ends_at)} · ${t('wizard.columns.billing_days')} ${quote.billing_days}`}
      </Text>
      {rows.map((r) =>
        r.value === null ? null : (
          <View key={r.key} className="flex-row justify-between">
            <Text className={r.strong ? 'font-sans-semibold' : undefined}>{r.label}</Text>
            <Text className={`tabular-nums ${r.strong ? 'font-sans-semibold' : ''}`}>{r.value}</Text>
          </View>
        ),
      )}
      {quote.breakdown.warnings.length ? (
        <Text variant="footnote" tone="muted">
          {quote.breakdown.warnings.map((w) => t(`warnings.${w}`, { defaultValue: w })).join(' · ')}
        </Text>
      ) : null}
      <Text variant="footnote" tone="muted">
        {t('wizard.quote_valid_until', { time: formatTime(quote.valid_until) })}
      </Text>
    </Card>
  );
}
