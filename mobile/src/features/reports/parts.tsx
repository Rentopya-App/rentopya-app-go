import type { UseQueryResult } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, type PermissionSlug } from '@/core/auth/permissions';
import { formatCalendarDate } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

import { PERIODS, type Period } from './lib';

/** Forbidden state with the panel's own wording. */
export function Forbidden({ body }: { body: string }) {
  const { t } = useTranslation();
  return <EmptyState icon="security" title={t('common:forbidden')} body={body} />;
}

/** Permission gate + title, like the panel's `EntityPage permission=…`. */
export function Gate({
  title,
  perm,
  forbidden,
  children,
}: {
  title: string;
  perm: PermissionSlug | PermissionSlug[];
  forbidden: string;
  children: ReactNode;
}) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Can perm={perm} fallback={<Forbidden body={forbidden} />}>
        {children}
      </Can>
    </>
  );
}

/** Period chips (the panel's presets) + the menu's branch filter. */
export function usePeriod(initial: Period = 'this_month') {
  const [period, setPeriod] = useState<Period>(initial);
  const { branchUuid, branch } = useSelectedBranch();
  return { period, setPeriod, branch: branchUuid, branchName: branch?.name ?? null };
}

export function PeriodChips({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation('profitability');
  return (
    <Chips options={PERIODS.map((p) => ({ value: p, label: t(`period.${p}`) }))} value={value} onChange={onChange} />
  );
}

/** Scrollable report body: filters, then the loaded report with pull-to-refresh. */
export function ReportBody<T>({
  query,
  filters,
  children,
}: {
  query: UseQueryResult<T>;
  filters: ReactNode;
  children: (data: T) => ReactNode;
}) {
  return (
    <Screen refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <View className="gap-2">{filters}</View>
      <QueryState query={query} rows={5}>
        {children}
      </QueryState>
    </Screen>
  );
}

/** "1 Mart 2026 – 15 Mart 2026 · Şube: Merkez". */
export function PeriodNote({ from, to, branch }: { from: string; to?: string; branch?: string | null }) {
  const { t } = useTranslation('reports_app');
  const range = to ? `${formatCalendarDate(from)} – ${formatCalendarDate(to)}` : formatCalendarDate(from);
  return (
    <Text variant="footnote" tone="muted">
      {branch ? `${range} · ${t('branch_filtered', { branch })}` : range}
    </Text>
  );
}

/** KPI card: label, figure and an optional hint line. Laid out two per row. */
export function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View className="min-w-[46%] flex-1 gap-1 rounded-lg border border-border bg-card p-3">
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="headline" numberOfLines={1} adjustsFontSizeToFit className="tabular-nums">
        {value}
      </Text>
      {hint ? (
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}

/** One row of a report list: label, main figure, a detail line and a share bar (0–1). */
export function FigureRow({
  label,
  value,
  detail,
  bar,
  last,
}: {
  label: string;
  value: string;
  detail?: string;
  bar?: number;
  last?: boolean;
}) {
  return (
    <View className={last ? 'gap-1.5 py-3' : 'gap-1.5 border-b border-border py-3'}>
      <View className="flex-row items-center gap-3">
        <Text variant="callout" numberOfLines={1} className="flex-1">
          {label}
        </Text>
        <Text variant="callout" className="font-sans-semibold tabular-nums">
          {value}
        </Text>
      </View>
      {detail ? (
        <Text variant="footnote" tone="muted" numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
      {bar != null ? (
        <View className="h-1.5 overflow-hidden rounded-full bg-muted">
          <View className="h-full rounded-full bg-primary" style={{ width: `${Math.round(bar * 100)}%` }} />
        </View>
      ) : null}
    </View>
  );
}

/** Card of figure rows with an empty line when the report has none. */
export function RowsCard({ title, empty, children }: { title: string; empty?: boolean; children: ReactNode }) {
  const { t } = useTranslation('reports');
  return (
    <Card title={title} className="gap-0">
      {empty ? (
        <View className="gap-1 py-3">
          <Text variant="callout">{t('empty')}</Text>
          <Text variant="footnote" tone="muted">
            {t('empty_description')}
          </Text>
        </View>
      ) : (
        children
      )}
    </Card>
  );
}

/** "Tutarlar TRY ve KDV dahildir …" under a report. */
export function AmountsNote({ extra }: { extra?: string }) {
  const { t } = useTranslation('reports');
  return (
    <Text variant="footnote" tone="muted">
      {extra ? `${t('notes.amounts')} ${extra}` : t('notes.amounts')}
    </Text>
  );
}
