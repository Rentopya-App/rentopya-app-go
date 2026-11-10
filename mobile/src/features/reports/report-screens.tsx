import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatNumber } from '@/core/format';
import type { IconName } from '@/ui/icons';
import { Chips } from '@/ui/chips';
import { List, ListRow } from '@/ui/list';
import { Screen } from '@/ui/screen';

import {
  useAgingReport,
  useBranchReport,
  useChannelReport,
  useIncomeExpenseReport,
  useOccupancyReport,
  type IncomeExpenseReport,
  type OccupancyReport,
} from './api';
import {
  AGING_BUCKETS,
  byAmountDesc,
  channelKey,
  incomeCategoryKey,
  monthLabel,
  percentText,
  reportQuery,
  share,
} from './lib';
import {
  AmountsNote,
  FigureRow,
  Gate,
  Kpi,
  KpiGrid,
  PeriodChips,
  PeriodNote,
  ReportBody,
  RowsCard,
  usePeriod,
} from './parts';

const READ = Permission.TenantFinanceReportsRead;

function useLang() {
  return useTranslation().i18n.language === 'en' ? 'en' : 'tr';
}

function useGate() {
  const { t } = useTranslation('reports');
  return { perm: READ, forbidden: t('forbidden') };
}

const HUB: { key: string; icon: IconName; href: string }[] = [
  { key: 'occupancy', icon: 'gauge', href: '/reports/occupancy' },
  { key: 'income_expense', icon: 'wallet', href: '/reports/income-expense' },
  { key: 'channels', icon: 'link', href: '/reports/channels' },
  { key: 'aging', icon: 'history', href: '/reports/aging' },
  { key: 'branches', icon: 'building', href: '/reports/branches' },
  { key: 'vehicles', icon: 'car', href: '/accounting/profitability' },
];

/** Raporlar (the panel's `/t/{slug}/reports`): the report center. */
export function ReportsHubScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('title')} {...useGate()}>
      <Screen>
        <List>
          {HUB.map((e, i) => (
            <ListRow
              key={e.key}
              icon={e.icon}
              title={t(`hub.${e.key}.title`)}
              subtitle={t(`hub.${e.key}.description`)}
              onPress={() => router.push(e.href as Href)}
              last={i === HUB.length - 1}
            />
          ))}
        </List>
      </Screen>
    </Gate>
  );
}

// ---------------------------------------------------------------- occupancy

const OCCUPANCY_GROUPS = ['rental_group', 'branch', 'month'] as const;
type OccupancyGroup = (typeof OCCUPANCY_GROUPS)[number];

function occupancyLabel(
  row: OccupancyReport['rows'][number],
  report: OccupancyReport,
  t: (k: string) => string,
  lang: string,
) {
  if (row.key === 'ungrouped') return t('reports:occupancy.ungrouped');
  if (report.group_by === 'month') return monthLabel(row.key, lang);
  if (report.group_by === 'branch' && row.group.code) return `${row.group.code} · ${row.group.name}`;
  return row.group.name;
}

export function OccupancyReportScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('occupancy.title')} {...useGate()}>
      <Occupancy />
    </Gate>
  );
}

function Occupancy() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const p = usePeriod();
  const [group, setGroup] = useState<OccupancyGroup>('rental_group');
  const query = useOccupancyReport(reportQuery(p.period, p.branch, { group_by: group }));
  return (
    <ReportBody
      query={query}
      filters={
        <>
          <PeriodChips value={p.period} onChange={p.setPeriod} />
          <Chips
            options={OCCUPANCY_GROUPS.map((g) => ({ value: g, label: t(`group.${g}`) }))}
            value={group}
            onChange={setGroup}
          />
        </>
      }>
      {(r) => (
        <>
          <PeriodNote from={r.from} to={r.to} branch={p.branchName} />
          <KpiGrid>
            <Kpi label={t('fields.occupancy')} value={percentText(r.totals.occupancy, lang)} />
            <Kpi
              label={t('fields.rental_days')}
              value={formatNumber(r.totals.rental_days, 1)}
              hint={t('kpi.rentals', { count: r.totals.rental_count })}
            />
            <Kpi label={t('fields.vehicles')} value={formatNumber(r.totals.vehicles)} />
            <Kpi
              label={t('fields.income_per_available_day')}
              value={
                r.totals.income_per_available_day
                  ? formatMoney(r.totals.income_per_available_day, r.method.currency)
                  : '—'
              }
              hint={t('kpi.gross_income', { amount: formatMoney(r.totals.gross_income, r.method.currency) })}
            />
          </KpiGrid>
          <RowsCard title={t('occupancy.table_title')} empty={!r.rows.length}>
            {r.rows.map((row, i) => (
              <FigureRow
                key={row.key}
                label={occupancyLabel(row, r, t, lang)}
                value={percentText(row.occupancy, lang)}
                detail={`${t('fields.vehicles')}: ${formatNumber(row.vehicles)} · ${t('fields.rental_days')}: ${formatNumber(row.rental_days, 1)} / ${formatNumber(row.available_days, 1)} · ${formatMoney(row.gross_income, r.method.currency)}`}
                bar={(row.occupancy ?? 0) / 100}
                last={i === r.rows.length - 1}
              />
            ))}
          </RowsCard>
          <AmountsNote extra={r.multi_group_vehicles ? t('notes.multi_group') : undefined} />
        </>
      )}
    </ReportBody>
  );
}

// ---------------------------------------------------------------- income / expense

const IE_GROUPS = ['category', 'branch', 'month'] as const;
type IeGroup = (typeof IE_GROUPS)[number];

function ieLabel(row: IncomeExpenseReport['rows'][number], groupBy: IeGroup, t: (k: string) => string, lang: string) {
  if (row.kind === 'income' || row.kind === 'pass_through') {
    const key = incomeCategoryKey(row.code);
    return key ? t(key) : row.name || row.code;
  }
  if (row.key === 'head_office') return t('reports:income_expense.head_office');
  if (groupBy === 'month') return monthLabel(row.key, lang);
  return row.name || row.code;
}

export function IncomeExpenseReportScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('income_expense.title')} {...useGate()}>
      <IncomeExpense />
    </Gate>
  );
}

function IncomeExpense() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const p = usePeriod();
  const [group, setGroup] = useState<IeGroup>('category');
  const query = useIncomeExpenseReport(reportQuery(p.period, p.branch, { group_by: group }));
  return (
    <ReportBody
      query={query}
      filters={
        <>
          <PeriodChips value={p.period} onChange={p.setPeriod} />
          <Chips
            options={IE_GROUPS.map((g) => ({ value: g, label: t(`group.${g}`) }))}
            value={group}
            onChange={setGroup}
          />
        </>
      }>
      {(r) => {
        const cur = r.method.currency;
        return (
          <>
            <PeriodNote from={r.from} to={r.to} branch={p.branchName} />
            <KpiGrid>
              <Kpi label={t('fields.income')} value={formatMoney(r.totals.income, cur)} />
              <Kpi label={t('fields.expense')} value={formatMoney(r.totals.expense, cur)} />
              <Kpi
                label={t('fields.net')}
                value={formatMoney(r.totals.net, cur)}
                hint={t('kpi.margin', { value: percentText(r.totals.margin, lang) })}
              />
              <Kpi label={t('fields.pass_through')} value={formatMoney(r.totals.pass_through, cur)} />
            </KpiGrid>
            <RowsCard title={t('income_expense.table_title')} empty={!r.rows.length}>
              {r.rows.map((row, i) => {
                const money = row.kind === 'group' ? row.net : rowAmount(row);
                return (
                  <FigureRow
                    key={row.key}
                    label={ieLabel(row, group, t, lang)}
                    value={formatMoney(money, cur)}
                    detail={
                      row.kind === 'group'
                        ? `${t('fields.income')}: ${formatMoney(row.income, cur)} · ${t('fields.expense')}: ${formatMoney(row.expense, cur)}`
                        : `${t(`kind.${row.kind}`)}${row.share != null ? ` · ${percentText(row.share, lang)}` : ''}`
                    }
                    last={i === r.rows.length - 1}
                  />
                );
              })}
            </RowsCard>
            <AmountsNote extra={t('notes.kept_apart')} />
          </>
        );
      }}
    </ReportBody>
  );
}

/** The figure a category row stands for: its income, expense, pass-through or capex column. */
function rowAmount(row: IncomeExpenseReport['rows'][number]) {
  switch (row.kind) {
    case 'income':
      return row.income;
    case 'pass_through':
      return row.pass_through;
    case 'capex':
      return row.capex;
    default:
      return row.expense;
  }
}

// ---------------------------------------------------------------- channels

const BASES = ['booking', 'pickup'] as const;
type Basis = (typeof BASES)[number];

export function ChannelsReportScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('channels.title')} {...useGate()}>
      <Channels />
    </Gate>
  );
}

function Channels() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const p = usePeriod();
  const [basis, setBasis] = useState<Basis>('booking');
  const query = useChannelReport(reportQuery(p.period, p.branch, { date_basis: basis }));
  return (
    <ReportBody
      query={query}
      filters={
        <>
          <PeriodChips value={p.period} onChange={p.setPeriod} />
          <Chips
            options={BASES.map((b) => ({ value: b, label: t(`date_basis.${b}`) }))}
            value={basis}
            onChange={setBasis}
          />
        </>
      }>
      {(r) => {
        const cur = r.method.currency;
        const rows = byAmountDesc(r.rows, (x) => x.revenue);
        return (
          <>
            <PeriodNote from={r.from} to={r.to} branch={p.branchName} />
            <KpiGrid>
              <Kpi
                label={t('fields.reservations')}
                value={formatNumber(r.totals.reservations)}
                hint={t('kpi.confirmed', { count: r.totals.confirmed })}
              />
              <Kpi
                label={t('fields.cancellation_rate')}
                value={percentText(r.totals.cancellation_rate, lang)}
                hint={t('kpi.cancelled', { count: r.totals.cancelled })}
              />
              <Kpi label={t('fields.revenue')} value={formatMoney(r.totals.revenue, cur)} />
              <Kpi
                label={t('fields.net_revenue')}
                value={formatMoney(r.totals.net_revenue, cur)}
                hint={`${t('fields.commission')}: ${formatMoney(r.totals.commission, cur)}`}
              />
            </KpiGrid>
            <RowsCard title={t('channels.table_title')} empty={!rows.length}>
              {rows.map((row, i) => {
                const key = channelKey(row.channel);
                return (
                  <FigureRow
                    key={row.channel}
                    label={key ? t(key) : row.channel}
                    value={formatMoney(row.revenue, cur)}
                    detail={`${t('fields.reservations')}: ${formatNumber(row.reservations)} · ${t('fields.confirmed')}: ${formatNumber(row.confirmed)} · ${t('fields.cancellation_rate')}: ${percentText(row.cancellation_rate, lang)}`}
                    bar={share(row.revenue, r.totals.revenue)}
                    last={i === rows.length - 1}
                  />
                );
              })}
            </RowsCard>
            <AmountsNote />
          </>
        );
      }}
    </ReportBody>
  );
}

// ---------------------------------------------------------------- aging

const PARTIES = ['customer', 'supplier'] as const;
type Party = (typeof PARTIES)[number];

export function AgingReportScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('aging.title')} {...useGate()}>
      <Aging />
    </Gate>
  );
}

function Aging() {
  const { t } = useTranslation('reports');
  const can = useCan();
  const p = usePeriod();
  const [party, setParty] = useState<Party>('customer');
  // As of today (the endpoint's default `as_of`): no period here, like the panel's default.
  const query = useAgingReport(p.branch ? { party, branch: p.branch } : { party });
  return (
    <ReportBody
      query={query}
      filters={
        <Chips options={PARTIES.map((v) => ({ value: v, label: t(`party.${v}`) }))} value={party} onChange={setParty} />
      }>
      {(r) => {
        const cur = r.method.currency;
        const rows = byAmountDesc(r.rows, (x) => x.open);
        return (
          <>
            <PeriodNote from={r.as_of} branch={p.branchName} />
            <KpiGrid>
              <Kpi
                label={t('fields.open')}
                value={formatMoney(r.totals.open, cur)}
                hint={t('kpi.accounts', { count: r.rows.length })}
              />
              <Kpi label={t('fields.overdue')} value={formatMoney(r.totals.overdue, cur)} />
            </KpiGrid>
            <RowsCard title={t('aging.chart_title')}>
              {AGING_BUCKETS.map((b, i) => (
                <FigureRow
                  key={b}
                  label={t(`aging.bucket.${b}`)}
                  value={formatMoney(r.totals[b], cur)}
                  bar={share(r.totals[b], r.totals.open)}
                  last={i === AGING_BUCKETS.length - 1}
                />
              ))}
            </RowsCard>
            <RowsCard title={t('aging.table_title')} empty={!rows.length}>
              {rows.map((row, i) => (
                <ListRowLike
                  key={row.uuid}
                  label={`${row.code} · ${row.name}`}
                  value={formatMoney(row.open, cur)}
                  detail={`${t('fields.overdue')}: ${formatMoney(row.overdue, cur)} · ${t('fields.payment_term_days')}: ${row.payment_term_days}`}
                  onPress={
                    can(Permission.TenantFinanceAccountsRead)
                      ? () => router.push(`/accounting/accounts/${row.uuid}` as Href)
                      : undefined
                  }
                  last={i === rows.length - 1}
                />
              ))}
            </RowsCard>
            <AmountsNote />
          </>
        );
      }}
    </ReportBody>
  );
}

function ListRowLike(props: { label: string; value: string; detail: string; onPress?: () => void; last: boolean }) {
  const row = <FigureRow label={props.label} value={props.value} detail={props.detail} last={props.last} />;
  if (!props.onPress) return row;
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} className="active:opacity-70">
      {row}
    </Pressable>
  );
}

// ---------------------------------------------------------------- branches

export function BranchesReportScreen() {
  const { t } = useTranslation('reports');
  return (
    <Gate title={t('branches.title')} {...useGate()}>
      <Branches />
    </Gate>
  );
}

function Branches() {
  const { t } = useTranslation('reports');
  const lang = useLang();
  const p = usePeriod();
  const query = useBranchReport(reportQuery(p.period, p.branch));
  return (
    <ReportBody query={query} filters={<PeriodChips value={p.period} onChange={p.setPeriod} />}>
      {(r) => {
        const cur = r.method.currency;
        const rows = byAmountDesc(r.rows, (x) => x.contribution);
        return (
          <>
            <PeriodNote from={r.from} to={r.to} branch={p.branchName} />
            <KpiGrid>
              <Kpi label={t('fields.gross_income')} value={formatMoney(r.totals.gross_income, cur)} />
              <Kpi
                label={t('fields.contribution')}
                value={formatMoney(r.totals.contribution, cur)}
                hint={t('kpi.margin', { value: percentText(r.totals.margin, lang) })}
              />
              <Kpi
                label={t('fields.occupancy')}
                value={percentText(r.totals.occupancy, lang)}
                hint={t('kpi.rentals', { count: r.totals.rental_count })}
              />
              <Kpi label={t('fields.vehicles')} value={formatNumber(r.totals.vehicles)} />
            </KpiGrid>
            <RowsCard title={t('branches.table_title')} empty={!rows.length}>
              {rows.map((row, i) => (
                <FigureRow
                  key={row.branch.uuid ?? row.branch.code}
                  label={row.branch.name}
                  value={formatMoney(row.contribution, cur)}
                  detail={`${t('fields.gross_income')}: ${formatMoney(row.gross_income, cur)} · ${t('fields.margin')}: ${percentText(row.margin, lang)} · ${t('fields.occupancy')}: ${percentText(row.occupancy, lang)}`}
                  bar={(row.contribution_share ?? 0) / 100}
                  last={i === rows.length - 1}
                />
              ))}
            </RowsCard>
            <AmountsNote extra={t('notes.branches')} />
          </>
        );
      }}
    </ReportBody>
  );
}
