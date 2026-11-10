import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, View } from 'react-native';

import { Permission, useCan, type PermissionSlug } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatNumber } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import type { IconName } from '@/ui/icons';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { StatusPill, type StatusTone } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { FigureRow, Gate, Kpi, KpiGrid } from '../reports/parts';
import {
  useCashAccount,
  useCashAccounts,
  useFinanceAccount,
  useFinanceAccounts,
  useInvoice,
  useInvoices,
  useMovements,
  usePayablesSummary,
  useStatement,
  useSupplier,
  useSupplierInvoices,
  useSupplierPayments,
  useSuppliers,
  type CashMovement,
  type SupplierInvoice,
  type SupplierPayment,
} from './api';
import {
  ACCOUNT_FILTERS,
  BALANCE_TONES,
  DIRECTION_FILTERS,
  INVOICE_FILTERS,
  INVOICE_TONES,
  listQuery,
  PARTY_FILTERS,
  signed,
  SUPPLIER_DUE_TONES,
  SUPPLIER_FILTERS,
  SUPPLIER_INVOICE_FILTERS,
  SUPPLIER_INVOICE_TONES,
} from './lib';

const P = Permission;

/** One list row: title + amount on the first line, subtitle and a status pill under it. */
function Row({
  title,
  amount,
  subtitle,
  pill,
  onPress,
  last,
}: {
  title: string;
  amount: string;
  subtitle?: string;
  pill?: { label: string; tone: StatusTone };
  onPress?: () => void;
  last?: boolean;
}) {
  const body = (
    <View className={last ? 'gap-1 px-4 py-3' : 'gap-1 border-b border-border px-4 py-3'}>
      <View className="flex-row items-center gap-3">
        <Text variant="body" numberOfLines={1} className="flex-1">
          {title}
        </Text>
        <Text variant="callout" className="font-sans-semibold tabular-nums">
          {amount}
        </Text>
      </View>
      {subtitle ? (
        <Text variant="footnote" tone="muted" numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
      {pill ? <StatusPill label={pill.label} tone={pill.tone} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:bg-muted">
      {body}
    </Pressable>
  );
}

/** Search + one chip filter: the list header state of every accounting list. */
function useListState<F extends string>(initial: F) {
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const [filter, setFilter] = useState<F>(initial);
  return { q, setQ, search, filter, setFilter };
}

function ListHeader<F extends string>({
  state,
  filters,
  label,
  placeholder,
}: {
  state: ReturnType<typeof useListState<F>>;
  filters: readonly F[];
  label: (f: F) => string;
  placeholder: string;
}) {
  return (
    <>
      <SearchField value={state.q} onChangeText={state.setQ} placeholder={placeholder} />
      <Chips
        options={filters.map((f) => ({ value: f, label: label(f) }))}
        value={state.filter}
        onChange={state.setFilter}
      />
    </>
  );
}

// ---------------------------------------------------------------- hub

const HUB: { key: string; icon: IconName; href: string; perm: PermissionSlug; ns: string; title: string }[] = [
  {
    key: 'accounts',
    icon: 'customers',
    href: '/accounting/accounts',
    perm: P.TenantFinanceAccountsRead,
    ns: 'finance',
    title: 'accounts.title',
  },
  {
    key: 'invoices',
    icon: 'document',
    href: '/accounting/invoices',
    perm: P.TenantInvoicesRead,
    ns: 'invoices',
    title: 'title',
  },
  {
    key: 'cash',
    icon: 'wallet',
    href: '/accounting/cash',
    perm: P.TenantFinanceCashRead,
    ns: 'finance',
    title: 'cash.title',
  },
  {
    key: 'movements',
    icon: 'history',
    href: '/accounting/movements',
    perm: P.TenantFinanceCashRead,
    ns: 'finance',
    title: 'movements.title',
  },
  {
    key: 'suppliers',
    icon: 'building',
    href: '/accounting/suppliers',
    perm: P.TenantSuppliersRead,
    ns: 'suppliers',
    title: 'title',
  },
  {
    key: 'supplier_invoices',
    icon: 'document',
    href: '/accounting/supplier-invoices',
    perm: P.TenantFinanceExpensesRead,
    ns: 'suppliers',
    title: 'invoices.title',
  },
  {
    key: 'supplier_payments',
    icon: 'card',
    href: '/accounting/supplier-payments',
    perm: P.TenantFinanceCashRead,
    ns: 'suppliers',
    title: 'payments.title',
  },
  {
    key: 'payables',
    icon: 'calendar',
    href: '/accounting/payables',
    perm: P.TenantFinanceExpensesRead,
    ns: 'suppliers',
    title: 'payables.title',
  },
  {
    key: 'finance_reports',
    icon: 'gauge',
    href: '/accounting/reports',
    perm: P.TenantFinanceReportsRead,
    ns: 'finance',
    title: 'reports.title',
  },
  {
    key: 'profitability',
    icon: 'car',
    href: '/accounting/profitability',
    perm: P.TenantFinanceReportsRead,
    ns: 'profitability',
    title: 'title',
  },
];

/** Entries of the accounting hub the member may open (same slugs as the panel pages). */
export function useAccountingEntries() {
  const can = useCan();
  return HUB.filter((e) => can(e.perm));
}

/** Muhasebe: cari, invoices, cash, suppliers, payables, finance reports and profitability. */
export function AccountingHubScreen() {
  const { t } = useTranslation('reports_app');
  const entries = useAccountingEntries();
  return (
    <Gate title={t('accounting_title')} perm={HUB.map((e) => e.perm)} forbidden={t('accounting_forbidden')}>
      <Screen>
        <List>
          {entries.map((e, i) => (
            <ListRow
              key={e.key}
              icon={e.icon}
              title={t(`${e.ns}:${e.title}`)}
              subtitle={t(`hub.${e.key}`)}
              onPress={() => router.push(e.href as Href)}
              last={i === entries.length - 1}
            />
          ))}
        </List>
      </Screen>
    </Gate>
  );
}

// ---------------------------------------------------------------- cari

export function AccountsScreen() {
  const { t } = useTranslation('finance');
  return (
    <Gate title={t('accounts.title')} perm={P.TenantFinanceAccountsRead} forbidden={t('forbidden')}>
      <Accounts />
    </Gate>
  );
}

function Accounts() {
  const { t } = useTranslation('finance');
  const { branchUuid } = useSelectedBranch();
  const [party, setParty] = useState<(typeof PARTY_FILTERS)[number]>('customer');
  const s = useListState<(typeof ACCOUNT_FILTERS)[number]>('all');
  const query = useFinanceAccounts(
    useMemo(
      () => ({ ...listQuery(s.search, 'balance_status', s.filter, branchUuid), party_kind: party, sort: '-balance' }),
      [s.search, s.filter, branchUuid, party],
    ),
  );
  return (
    <PagedList
      query={query}
      keyOf={(a) => a.uuid}
      empty={t('accounts.empty')}
      header={
        <>
          <Chips
            options={PARTY_FILTERS.map((p) => ({ value: p, label: t(`reports:party.${p}`) }))}
            value={party}
            onChange={setParty}
          />
          <ListHeader
            state={s}
            filters={ACCOUNT_FILTERS}
            label={(f) => (f === 'all' ? t('reports_app:all') : t(`balance_status.${f}`))}
            placeholder={t('reports_app:search_accounts')}
          />
        </>
      }
      renderItem={(a, _, last) => (
        <Row
          title={`${a.code} · ${a.name}`}
          amount={formatMoney(a.balance.balance, a.currency)}
          subtitle={
            num(a.balance.overdue) > 0
              ? `${t('columns.overdue')}: ${formatMoney(a.balance.overdue, a.currency)}`
              : (a.branch?.name ?? undefined)
          }
          pill={{ label: t(`balance_status.${a.balance.status}`), tone: BALANCE_TONES[a.balance.status] ?? 'neutral' }}
          onPress={() => router.push(`/accounting/accounts/${a.uuid}` as Href)}
          last={last}
        />
      )}
    />
  );
}

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function AccountScreen() {
  const { t } = useTranslation('finance');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <Gate title={t('statement.title')} perm={P.TenantFinanceAccountsRead} forbidden={t('forbidden')}>
      <AccountStatement uuid={uuid} />
    </Gate>
  );
}

function AccountStatement({ uuid }: { uuid: string }) {
  const { t } = useTranslation('finance');
  const account = useFinanceAccount(uuid);
  const statement = useStatement(uuid);
  return (
    <PagedList
      query={statement}
      keyOf={(e) => e.uuid}
      empty={t('statement.empty')}
      header={
        <QueryState query={account} rows={2}>
          {(a) => (
            <>
              <View className="gap-2 px-1">
                <Text variant="title" numberOfLines={2}>
                  {a.name}
                </Text>
                <Text variant="footnote" tone="muted">
                  {[a.code, a.branch?.name, `${t('columns.payment_term_days')}: ${a.payment_term_days}`]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                <StatusPill
                  label={t(`balance_status.${a.balance.status}`)}
                  tone={BALANCE_TONES[a.balance.status] ?? 'neutral'}
                />
              </View>
              <KpiGrid>
                <Kpi label={t('columns.balance')} value={formatMoney(a.balance.balance, a.currency)} />
                <Kpi label={t('columns.overdue')} value={formatMoney(a.balance.overdue, a.currency)} />
                <Kpi label={t('columns.due_soon')} value={formatMoney(a.balance.due_soon, a.currency)} />
                <Kpi label={t('columns.deposit_held')} value={formatMoney(a.balance.deposit_held, a.currency)} />
              </KpiGrid>
              <Text variant="headline">{t('statement.title')}</Text>
            </>
          )}
        </QueryState>
      }
      renderItem={(e, _, last) => (
        <Row
          title={e.description || t(`kind.${e.kind}`)}
          amount={formatMoney(signed(e.amount, e.direction === 'credit'), e.currency)}
          subtitle={`${formatCalendarDate(e.entry_date)} · ${t(`kind.${e.kind}`)} · ${t('columns.running_balance')}: ${formatMoney(e.running_balance, e.currency)}`}
          last={last}
        />
      )}
    />
  );
}

// ---------------------------------------------------------------- e-invoices

export function InvoicesScreen() {
  const { t } = useTranslation('invoices');
  return (
    <Gate title={t('title')} perm={P.TenantInvoicesRead} forbidden={t('forbidden')}>
      <Invoices />
    </Gate>
  );
}

function Invoices() {
  const { t } = useTranslation('invoices');
  const { branchUuid } = useSelectedBranch();
  const s = useListState<(typeof INVOICE_FILTERS)[number]>('all');
  const query = useInvoices(
    useMemo(() => listQuery(s.search, 'status', s.filter, branchUuid), [s.search, s.filter, branchUuid]),
  );
  return (
    <PagedList
      query={query}
      keyOf={(i) => i.uuid}
      empty={t('empty')}
      header={
        <ListHeader
          state={s}
          filters={INVOICE_FILTERS}
          label={(f) =>
            f === 'all' ? t('reports_app:all') : f === 'needs_action' ? t('filters.needs_action') : t(`status.${f}`)
          }
          placeholder={t('reports_app:search_invoices')}
        />
      }
      renderItem={(i, _, last) => (
        <Row
          title={`${i.number ?? t('draft_number')} · ${i.receiver_name}`}
          amount={formatMoney(i.payable_amount, i.currency)}
          subtitle={`${formatCalendarDate(i.issue_date)} · ${t(`profile.${i.profile.toLowerCase()}`)}${i.rental ? ` · ${i.rental.reference}` : ''}`}
          pill={{ label: t(`status.${i.status}`), tone: INVOICE_TONES[i.status] ?? 'neutral' }}
          onPress={() => router.push(`/accounting/invoices/${i.uuid}` as Href)}
          last={last}
        />
      )}
    />
  );
}

export function InvoiceScreen() {
  const { t } = useTranslation('invoices');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <Gate title={t('detail.title')} perm={P.TenantInvoicesRead} forbidden={t('forbidden')}>
      <InvoiceBody uuid={uuid} />
    </Gate>
  );
}

function InvoiceBody({ uuid }: { uuid: string }) {
  const { t } = useTranslation('invoices');
  const query = useInvoice(uuid);
  return (
    <Screen refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <QueryState query={query} rows={5}>
        {(inv) => (
          <>
            <View className="gap-2 px-1">
              <Text variant="title" numberOfLines={2}>
                {inv.number ?? t('draft_number')}
              </Text>
              <Text variant="footnote" tone="muted">
                {[formatCalendarDate(inv.issue_date), t(`profile.${inv.profile.toLowerCase()}`), inv.branch.name].join(
                  ' · ',
                )}
              </Text>
              <StatusPill label={t(`status.${inv.status}`)} tone={INVOICE_TONES[inv.status] ?? 'neutral'} />
              <Text variant="footnote" tone="muted">
                {t(`status_hint.${inv.status}`)}
              </Text>
            </View>
            {inv.last_error ? (
              <View className="rounded-md border border-destructive/40 bg-destructive/10 p-3">
                <Text variant="footnote" tone="danger">
                  {inv.last_error}
                </Text>
              </View>
            ) : null}
            <Card title={t('sections.receiver')}>
              <Text variant="body">{inv.receiver_name}</Text>
              <Text variant="footnote" tone="muted">
                {[t(`receiver_type.${inv.receiver_type}`), inv.receiver_identity_hint].filter(Boolean).join(' · ')}
              </Text>
              {inv.rental ? (
                <Text variant="footnote" tone="muted">
                  {`${t('columns.rental')}: ${inv.rental.reference}`}
                </Text>
              ) : null}
            </Card>
            <Card title={t('sections.lines')} className="gap-0">
              {inv.lines.length ? (
                inv.lines.map((l, i) => (
                  <FigureRow
                    key={l.uuid}
                    label={l.name}
                    value={formatMoney(l.total_amount, inv.currency)}
                    detail={`${t(`line_kind.${l.kind}`)} · ${t('columns.net_amount')}: ${formatMoney(l.net_amount, inv.currency)} · ${t('columns.vat_rate')}: %${formatNumber(l.vat_rate, 2)}`}
                    last={i === inv.lines.length - 1}
                  />
                ))
              ) : (
                <Text variant="footnote" tone="muted">
                  {t('lines_empty')}
                </Text>
              )}
            </Card>
            <KpiGrid>
              <Kpi label={t('totals.net')} value={formatMoney(inv.line_extension_amount, inv.currency)} />
              <Kpi label={t('totals.vat')} value={formatMoney(inv.tax_amount, inv.currency)} />
              <Kpi label={t('totals.payable')} value={formatMoney(inv.payable_amount, inv.currency)} />
            </KpiGrid>
            <Text variant="footnote" tone="muted">
              {t('reports_app:panel_actions')}
            </Text>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

// ---------------------------------------------------------------- cash and bank

export function CashAccountsScreen() {
  const { t } = useTranslation('finance');
  return (
    <Gate title={t('cash.title')} perm={P.TenantFinanceCashRead} forbidden={t('forbidden')}>
      <CashAccounts />
    </Gate>
  );
}

const CASH_KINDS = ['all', 'cash', 'bank', 'clearing'] as const;

function CashAccounts() {
  const { t } = useTranslation('finance');
  const { branchUuid } = useSelectedBranch();
  const s = useListState<(typeof CASH_KINDS)[number]>('all');
  const query = useCashAccounts(
    useMemo(
      () => ({ ...listQuery(s.search, 'kind', s.filter, branchUuid), status: 'active' }),
      [s.search, s.filter, branchUuid],
    ),
  );
  return (
    <PagedList
      query={query}
      keyOf={(a) => a.uuid}
      empty={t('cash.empty')}
      header={
        <ListHeader
          state={s}
          filters={CASH_KINDS}
          label={(f) => (f === 'all' ? t('reports_app:all') : t(`cash_kind.${f}`))}
          placeholder={t('reports_app:search_cash')}
        />
      }
      renderItem={(a, _, last) => (
        <Row
          title={`${a.code} · ${a.name}`}
          amount={formatMoney(a.balance, a.currency)}
          subtitle={[t(`cash_kind.${a.kind}`), a.branch?.name ?? t('head_office'), a.bank_name]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => router.push(`/accounting/cash/${a.uuid}` as Href)}
          last={last}
        />
      )}
    />
  );
}

export function CashAccountScreen() {
  const { t } = useTranslation('finance');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <Gate title={t('cash.title')} perm={P.TenantFinanceCashRead} forbidden={t('forbidden')}>
      <CashAccountBody uuid={uuid} />
    </Gate>
  );
}

function CashAccountBody({ uuid }: { uuid: string }) {
  const { t } = useTranslation('finance');
  const account = useCashAccount(uuid);
  const movements = useMovements(useMemo(() => ({ account: uuid }), [uuid]));
  return (
    <PagedList
      query={movements}
      keyOf={(m) => m.uuid}
      empty={t('movements.empty')}
      header={
        <QueryState query={account} rows={2}>
          {(a) => (
            <>
              <View className="gap-1 px-1">
                <Text variant="title" numberOfLines={2}>
                  {a.name}
                </Text>
                <Text variant="footnote" tone="muted">
                  {[a.code, t(`cash_kind.${a.kind}`), a.branch?.name ?? t('head_office'), a.iban]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <KpiGrid>
                <Kpi label={t('columns.balance')} value={formatMoney(a.balance, a.currency)} />
                <Kpi label={t('columns.total_in')} value={formatMoney(a.total_in, a.currency)} />
                <Kpi label={t('columns.total_out')} value={formatMoney(a.total_out, a.currency)} />
                <Kpi label={t('columns.opening_balance')} value={formatMoney(a.opening_balance, a.currency)} />
              </KpiGrid>
              <Text variant="headline">{t('movements.title')}</Text>
            </>
          )}
        </QueryState>
      }
      renderItem={(m, _, last) => <MovementRow m={m} last={last} withBalance />}
    />
  );
}

function MovementRow({ m, last, withBalance }: { m: CashMovement; last: boolean; withBalance?: boolean }) {
  const { t } = useTranslation('finance');
  const parts = [formatCalendarDate(m.movement_date), t(`movement_kind.${m.kind}`)];
  if (!withBalance) parts.push(m.account.name ?? m.account.code ?? '');
  else parts.push(`${t('columns.running_balance')}: ${formatMoney(m.running_balance, m.currency)}`);
  return (
    <Row
      title={m.description || m.category?.name || t(`movement_kind.${m.kind}`)}
      amount={formatMoney(signed(m.amount, m.direction === 'out'), m.currency)}
      subtitle={parts.filter(Boolean).join(' · ')}
      last={last}
    />
  );
}

export function MovementsScreen() {
  const { t } = useTranslation('finance');
  return (
    <Gate title={t('movements.title')} perm={P.TenantFinanceCashRead} forbidden={t('forbidden')}>
      <Movements />
    </Gate>
  );
}

function Movements() {
  const { t } = useTranslation('finance');
  const { branchUuid } = useSelectedBranch();
  const s = useListState<(typeof DIRECTION_FILTERS)[number]>('all');
  const query = useMovements(
    useMemo(() => listQuery(s.search, 'direction', s.filter, branchUuid), [s.search, s.filter, branchUuid]),
  );
  return (
    <PagedList
      query={query}
      keyOf={(m) => m.uuid}
      empty={t('movements.empty')}
      header={
        <ListHeader
          state={s}
          filters={DIRECTION_FILTERS}
          label={(f) => (f === 'all' ? t('reports_app:all') : t(`direction.${f}`))}
          placeholder={t('reports_app:search_movements')}
        />
      }
      renderItem={(m, _, last) => <MovementRow m={m} last={last} />}
    />
  );
}

// ---------------------------------------------------------------- suppliers

export function SuppliersScreen() {
  const { t } = useTranslation('suppliers');
  return (
    <Gate title={t('title')} perm={P.TenantSuppliersRead} forbidden={t('forbidden')}>
      <Suppliers />
    </Gate>
  );
}

function Suppliers() {
  const { t } = useTranslation('suppliers');
  const s = useListState<(typeof SUPPLIER_FILTERS)[number]>('all');
  const query = useSuppliers(
    useMemo(() => ({ ...listQuery(s.search, 'due_state', s.filter), status: 'active' }), [s.search, s.filter]),
  );
  return (
    <PagedList
      query={query}
      keyOf={(x) => x.uuid}
      empty={t('empty')}
      header={
        <ListHeader
          state={s}
          filters={SUPPLIER_FILTERS}
          label={(f) => (f === 'all' ? t('reports_app:all') : t(`due_state.${f}`))}
          placeholder={t('reports_app:search_suppliers')}
        />
      }
      renderItem={(x, _, last) => (
        <Row
          title={`${x.code} · ${x.title}`}
          amount={formatMoney(x.open_amount)}
          subtitle={[
            t(`type.${x.supplier_type}`),
            x.city,
            x.next_due_date ? `${t('columns.next_due_date')}: ${formatCalendarDate(x.next_due_date)}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          pill={{ label: t(`due_state.${x.due_state}`), tone: SUPPLIER_DUE_TONES[x.due_state] ?? 'neutral' }}
          onPress={() => router.push(`/accounting/suppliers/${x.uuid}` as Href)}
          last={last}
        />
      )}
    />
  );
}

export function SupplierScreen() {
  const { t } = useTranslation('suppliers');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <Gate title={t('detail_title')} perm={P.TenantSuppliersRead} forbidden={t('forbidden')}>
      <SupplierBody uuid={uuid} />
    </Gate>
  );
}

function SupplierBody({ uuid }: { uuid: string }) {
  const { t } = useTranslation('suppliers');
  const can = useCan();
  const query = useSupplier(uuid);
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const canInvoices = can(P.TenantFinanceExpensesRead);
  const canPayments = can(P.TenantFinanceCashRead);
  const invoices = useSupplierInvoices(
    useMemo(() => ({ supplier: uuid }), [uuid]),
    canInvoices && tab === 'invoices',
  );
  const payments = useSupplierPayments(
    useMemo(() => ({ supplier: uuid }), [uuid]),
    canPayments && tab === 'payments',
  );
  const tabs = [
    ...(canInvoices ? [{ value: 'invoices' as const, label: t('tabs.invoices') }] : []),
    ...(canPayments ? [{ value: 'payments' as const, label: t('tabs.payments') }] : []),
  ];
  const header = (
    <QueryState query={query} rows={2}>
      {(x) => (
        <>
          <View className="gap-1 px-1">
            <Text variant="title" numberOfLines={2}>
              {x.title}
            </Text>
            <Text variant="footnote" tone="muted">
              {[x.code, t(`type.${x.supplier_type}`), x.tax_number, x.phone, x.city].filter(Boolean).join(' · ')}
            </Text>
            <StatusPill label={t(`due_state.${x.due_state}`)} tone={SUPPLIER_DUE_TONES[x.due_state] ?? 'neutral'} />
          </View>
          <KpiGrid>
            <Kpi label={t('columns.open_amount')} value={formatMoney(x.open_amount)} />
            <Kpi label={t('columns.overdue_amount')} value={formatMoney(x.overdue_amount)} />
            <Kpi label={t('columns.due_soon_amount')} value={formatMoney(x.due_soon_amount)} />
            <Kpi label={t('columns.open_invoices')} value={formatNumber(x.open_invoices)} />
          </KpiGrid>
          {tabs.length ? <Chips options={tabs} value={tab} onChange={setTab} /> : null}
        </>
      )}
    </QueryState>
  );
  if (tab === 'payments' && canPayments)
    return (
      <PagedList
        query={payments}
        keyOf={(p) => p.uuid}
        empty={t('payments.empty')}
        header={header}
        renderItem={(p, _, last) => <PaymentRow p={p} last={last} />}
      />
    );
  if (canInvoices)
    return (
      <PagedList
        query={invoices}
        keyOf={(i) => i.uuid}
        empty={t('invoices.empty')}
        header={header}
        renderItem={(i, _, last) => <SupplierInvoiceRow i={i} last={last} />}
      />
    );
  return <Screen>{header}</Screen>;
}

function SupplierInvoiceRow({ i, last }: { i: SupplierInvoice; last: boolean }) {
  const { t } = useTranslation('suppliers');
  const pill =
    i.status === 'void' || i.status === 'paid'
      ? { label: t(`invoice_status.${i.status}`), tone: SUPPLIER_INVOICE_TONES[i.status] ?? 'neutral' }
      : { label: t(`invoice_due.${i.due_state}`), tone: SUPPLIER_DUE_TONES[i.due_state] ?? 'neutral' };
  return (
    <Row
      title={`${i.invoice_no} · ${i.supplier.name ?? ''}`}
      amount={formatMoney(i.open_amount, i.currency)}
      subtitle={`${formatCalendarDate(i.invoice_date)} → ${formatCalendarDate(i.due_date)} · ${t('columns.total_amount')}: ${formatMoney(i.total_amount, i.currency)}${i.category.name ? ` · ${i.category.name}` : ''}`}
      pill={pill}
      last={last}
    />
  );
}

function PaymentRow({ p, last }: { p: SupplierPayment; last: boolean }) {
  const { t } = useTranslation('suppliers');
  return (
    <Row
      title={`${p.supplier.name ?? ''}${p.reference ? ` · ${p.reference}` : ''}`}
      amount={formatMoney(p.amount, p.currency)}
      subtitle={`${formatCalendarDate(p.payment_date)} · ${t(`method.${p.method}`)} · ${p.cash_account.name ?? ''}`}
      pill={p.status === 'void' ? { label: t('payment_status.void'), tone: 'neutral' } : undefined}
      last={last}
    />
  );
}

export function SupplierInvoicesScreen() {
  const { t } = useTranslation('suppliers');
  return (
    <Gate title={t('invoices.title')} perm={P.TenantFinanceExpensesRead} forbidden={t('invoices.forbidden')}>
      <SupplierInvoices />
    </Gate>
  );
}

function SupplierInvoices() {
  const { t } = useTranslation('suppliers');
  const { branchUuid } = useSelectedBranch();
  const s = useListState<(typeof SUPPLIER_INVOICE_FILTERS)[number]>('all');
  const query = useSupplierInvoices(
    useMemo(() => listQuery(s.search, 'due_state', s.filter, branchUuid), [s.search, s.filter, branchUuid]),
  );
  return (
    <PagedList
      query={query}
      keyOf={(i) => i.uuid}
      empty={t('invoices.empty')}
      header={
        <ListHeader
          state={s}
          filters={SUPPLIER_INVOICE_FILTERS}
          label={(f) => (f === 'all' ? t('reports_app:all') : t(`invoice_due.${f}`))}
          placeholder={t('reports_app:search_supplier_invoices')}
        />
      }
      renderItem={(i, _, last) => <SupplierInvoiceRow i={i} last={last} />}
    />
  );
}

const PAYMENT_FILTERS = ['all', 'posted', 'void'] as const;

export function SupplierPaymentsScreen() {
  const { t } = useTranslation('suppliers');
  return (
    <Gate title={t('payments.title')} perm={P.TenantFinanceCashRead} forbidden={t('payments.forbidden')}>
      <SupplierPayments />
    </Gate>
  );
}

function SupplierPayments() {
  const { t } = useTranslation('suppliers');
  const s = useListState<(typeof PAYMENT_FILTERS)[number]>('all');
  const query = useSupplierPayments(useMemo(() => listQuery(s.search, 'status', s.filter), [s.search, s.filter]));
  return (
    <PagedList
      query={query}
      keyOf={(p) => p.uuid}
      empty={t('payments.empty')}
      header={
        <ListHeader
          state={s}
          filters={PAYMENT_FILTERS}
          label={(f) => (f === 'all' ? t('reports_app:all') : t(`payment_status.${f}`))}
          placeholder={t('reports_app:search_supplier_payments')}
        />
      }
      renderItem={(p, _, last) => <PaymentRow p={p} last={last} />}
    />
  );
}

// ---------------------------------------------------------------- payables

export function PayablesScreen() {
  const { t } = useTranslation('suppliers');
  return (
    <Gate title={t('payables.title')} perm={P.TenantFinanceExpensesRead} forbidden={t('invoices.forbidden')}>
      <Payables />
    </Gate>
  );
}

/** Borçlar: the payables summary, then the open supplier invoices by due date. */
function Payables() {
  const { t } = useTranslation('suppliers');
  const summary = usePayablesSummary();
  const invoices = useSupplierInvoices(useMemo(() => ({ due_state: 'overdue,due_soon', sort: 'due_date' }), []));
  const header: ReactElement = (
    <QueryState query={summary} rows={2}>
      {(s) => (
        <>
          <KpiGrid>
            <Kpi
              label={t('payables.overdue')}
              value={formatMoney(s.overdue_amount, s.currency)}
              hint={t('payables.invoices', { count: s.overdue_count })}
            />
            <Kpi
              label={t('payables.due_soon', { days: s.window_days })}
              value={formatMoney(s.due_soon_amount, s.currency)}
              hint={t('payables.invoices', { count: s.due_soon_count })}
            />
            <Kpi
              label={t('payables.open')}
              value={formatMoney(s.open_amount, s.currency)}
              hint={t('payables.invoices', { count: s.open_count })}
            />
          </KpiGrid>
        </>
      )}
    </QueryState>
  );
  return (
    <PagedList
      query={invoices}
      keyOf={(i) => i.uuid}
      empty={t('payables.empty')}
      header={header}
      renderItem={(i, _, last) => <SupplierInvoiceRow i={i} last={last} />}
    />
  );
}
