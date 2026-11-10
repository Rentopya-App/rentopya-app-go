import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Permission } from '@/core/auth/permissions';
import { formatMoney, formatNumber } from '@/core/format';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { SearchField } from '@/ui/search-field';

import { useFinanceReport, useProfitabilityReport } from './api';
import { byAmountDesc, FINANCE_REPORTS, monthLabel, percentText, reportQuery, type FinanceReportKind } from './lib';
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

/** Araç kârlılığı (the panel's `/finance/profitability`): totals and the vehicles by contribution. */
export function ProfitabilityScreen() {
  const { t } = useTranslation('profitability');
  return (
    <Gate title={t('title')} perm={READ} forbidden={t('forbidden')}>
      <Profitability />
    </Gate>
  );
}

const BASES = ['accrual', 'cash'] as const;
type Basis = (typeof BASES)[number];

function Profitability() {
  const { t } = useTranslation('profitability');
  const lang = useLang();
  const p = usePeriod();
  const [basis, setBasis] = useState<Basis>('accrual');
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const query = useProfitabilityReport(reportQuery(p.period, p.branch, { basis, q: search.trim() || undefined }));
  return (
    <ReportBody
      query={query}
      filters={
        <>
          <PeriodChips value={p.period} onChange={p.setPeriod} />
          <Chips options={BASES.map((b) => ({ value: b, label: t(`basis.${b}`) }))} value={basis} onChange={setBasis} />
          <SearchField value={q} onChangeText={setQ} placeholder={t('reports_app:profitability_search')} />
        </>
      }>
      {(r) => {
        const cur = r.method.currency;
        const rows = byAmountDesc(r.rows, (x) => x.contribution);
        return (
          <>
            <PeriodNote from={r.from} to={r.to} branch={p.branchName} />
            <KpiGrid>
              <Kpi
                label={t('fields.gross_income')}
                value={formatMoney(r.totals.gross_income, cur)}
                hint={t('kpi.commissions', { amount: formatMoney(r.totals.commissions, cur) })}
              />
              <Kpi label={t('fields.direct_costs')} value={formatMoney(r.totals.direct_costs, cur)} />
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
            </KpiGrid>
            <RowsCard title={t('vehicles_title')} empty={!rows.length}>
              {rows.map((row, i) => (
                <FigureRow
                  key={row.vehicle.uuid}
                  label={vehicleLabel(row.vehicle)}
                  value={formatMoney(row.contribution, cur)}
                  detail={`${t('fields.gross_income')}: ${formatMoney(row.gross_income, cur)} · ${t('fields.margin')}: ${percentText(row.margin, lang)} · ${t('fields.rental_days')}: ${formatNumber(row.rental_days, 1)}`}
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

function vehicleLabel(v: { plate: string; label: string }) {
  return v.label ? `${v.plate} · ${v.label}` : v.plate;
}

/** Finans raporları (the panel's `/finance/reports`): expenses and cash flow, grouped. */
export function FinanceReportsScreen() {
  const { t } = useTranslation('finance');
  return (
    <Gate title={t('reports.title')} perm={READ} forbidden={t('forbidden')}>
      <FinanceReports />
    </Gate>
  );
}

const KINDS = Object.keys(FINANCE_REPORTS) as FinanceReportKind[];

function FinanceReports() {
  const { t } = useTranslation('finance');
  const lang = useLang();
  const p = usePeriod();
  const [kind, setKind] = useState<FinanceReportKind>('expenses');
  const [group, setGroup] = useState<string>('category');
  const spec = FINANCE_REPORTS[kind];
  const groupBy = (spec.groups as readonly string[]).includes(group) ? group : spec.groups[0];
  const query = useFinanceReport(kind, reportQuery(p.period, null, { group_by: groupBy }));
  const main = kind === 'expenses' ? 'total_amount' : 'total_in';
  return (
    <ReportBody
      query={query}
      filters={
        <>
          <PeriodChips value={p.period} onChange={p.setPeriod} />
          <Chips
            options={KINDS.map((k) => ({
              value: k,
              label: t(k === 'expenses' ? 'reports.expenses_title' : 'reports.cash_flow_title'),
            }))}
            value={kind}
            onChange={setKind}
          />
          <Chips
            options={spec.groups.map((g) => ({ value: g as string, label: t(`reports.group_${g}`) }))}
            value={groupBy}
            onChange={setGroup}
          />
        </>
      }>
      {(r) => (
        <>
          <PeriodNote from={r.from} to={r.to} />
          <KpiGrid>
            {spec.values.map((v) => (
              <Kpi key={v} label={t(`reports.${v}`)} value={formatMoney(r.totals[v] ?? '0', 'TRY')} />
            ))}
          </KpiGrid>
          <RowsCard title={t('reports.group_by')} empty={!r.rows.length}>
            {r.rows.map((row, i) => (
              <FigureRow
                key={row.key}
                label={rowLabel(row, groupBy, t, lang)}
                value={formatMoney(row.values[main] ?? '0', row.currency)}
                detail={`${t('reports.count')}: ${formatNumber(row.count)} · ${spec.values
                  .filter((v) => v !== main)
                  .map((v) => `${t(`reports.${v}`)}: ${formatMoney(row.values[v] ?? '0', row.currency)}`)
                  .join(' · ')}`}
                last={i === r.rows.length - 1}
              />
            ))}
          </RowsCard>
        </>
      )}
    </ReportBody>
  );
}

function rowLabel(row: { key: string; label: string }, group: string, t: (k: string) => string, lang: string) {
  if (group === 'month') return monthLabel(row.label || row.key, lang);
  if (row.label) return row.label;
  if (group === 'branch') return t('head_office');
  if (group === 'vehicle') return t('reports.no_vehicle');
  return '—';
}
