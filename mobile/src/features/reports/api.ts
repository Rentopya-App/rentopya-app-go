import { useQuery } from '@tanstack/react-query';

import { api, orgHeader, unwrap } from '@/core/api/client';
import type { components } from '@/core/api/schema';
import { useSession } from '@/core/auth/session';

import type { FinanceReportKind } from './lib';

type S = components['schemas'];
export type OccupancyReport = S['ReportOccupancy'];
export type IncomeExpenseReport = S['ReportIncomeExpense'];
export type ChannelReport = S['ReportChannels'];
export type AgingReport = S['ReportAging'];
export type BranchReport = S['ReportBranches'];
export type ProfitabilityReport = S['VehicleProfitabilityReport'];
export type FinanceReport = S['FinanceReport'];

type Q = Record<string, string>;

function useOrg() {
  return useSession((s) => s.organization?.slug);
}

/** One report query (`/v1/tenant/reports/*`, `tenant.finance.reports.read`), keyed by its query. */
function useReport<T>(name: string, query: Q, fetch: (q: Q) => Promise<T>) {
  const org = useOrg();
  return useQuery({ queryKey: ['report', org, name, query], enabled: !!org, queryFn: () => fetch(query) });
}

export function useOccupancyReport(query: Q) {
  return useReport('occupancy', query, (q) =>
    unwrap(
      api.GET('/v1/tenant/reports/occupancy', {
        params: { header: orgHeader(), query: q as { group_by?: OccupancyReport['group_by'] } },
      }),
    ),
  );
}

export function useIncomeExpenseReport(query: Q) {
  return useReport('income-expense', query, (q) =>
    unwrap(
      api.GET('/v1/tenant/reports/income-expense', {
        params: { header: orgHeader(), query: q as { group_by?: IncomeExpenseReport['group_by'] } },
      }),
    ),
  );
}

export function useChannelReport(query: Q) {
  return useReport('channels', query, (q) =>
    unwrap(
      api.GET('/v1/tenant/reports/channels', {
        params: { header: orgHeader(), query: q as { date_basis?: ChannelReport['date_basis'] } },
      }),
    ),
  );
}

export function useAgingReport(query: Q) {
  return useReport('aging', query, (q) =>
    unwrap(
      api.GET('/v1/tenant/reports/aging', {
        params: { header: orgHeader(), query: q as { party?: AgingReport['party'] } },
      }),
    ),
  );
}

export function useBranchReport(query: Q) {
  return useReport('branches', query, (q) =>
    unwrap(api.GET('/v1/tenant/reports/branches', { params: { header: orgHeader(), query: q } })),
  );
}

export function useProfitabilityReport(query: Q) {
  return useReport('vehicle-profitability', query, (q) =>
    unwrap(api.GET('/v1/tenant/reports/vehicle-profitability', { params: { header: orgHeader(), query: q } })),
  );
}

/** Expense or cash-flow report of the finance module (`/v1/tenant/finance/reports/*`). */
export function useFinanceReport(kind: FinanceReportKind, query: Q) {
  return useReport(`finance-${kind}`, query, (q) =>
    kind === 'expenses'
      ? unwrap(api.GET('/v1/tenant/finance/reports/expenses', { params: { header: orgHeader(), query: q } }))
      : unwrap(api.GET('/v1/tenant/finance/reports/cash-flow', { params: { header: orgHeader(), query: q } })),
  );
}
