import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, View } from 'react-native';

import { formatMoney, formatNumber } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { cn } from '@/ui/cn';
import { Icon } from '@/ui/icon';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { OptionSheet } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { countdown, countdownText, type KpiChip } from './today-model';

const ALL = '__all__';

/**
 * The branch filter chip at the top of the board: the device-wide branch
 * choice (`useSelectedBranch`), shared with the menu and every list. Hidden
 * when the member has one branch or cannot read branches.
 */
export function BranchChip({ scope }: { scope: 'all' | 'selected' | undefined }) {
  const { t } = useTranslation('today');
  const branch = useSelectedBranch();
  const [open, setOpen] = useState(false);
  if (!branch.available) return null;
  const allLabel = scope === 'selected' ? t('my_branches') : t('branch_all');
  const label = branch.branch ? branch.branch.name : allLabel;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('branch_filter')}
        accessibilityValue={{ text: label }}
        onPress={() => setOpen(true)}
        className={cn(
          'flex-row items-center gap-1.5 self-start rounded-full border px-3.5 py-1.5 active:opacity-80',
          branch.branch ? 'border-primary bg-primary' : 'border-border bg-card',
        )}>
        <Icon name="building" size={14} tone={branch.branch ? 'primary-foreground' : 'primary'} />
        <Text
          variant="footnote"
          numberOfLines={1}
          className={cn('font-sans-semibold', branch.branch ? 'text-primary-foreground' : 'text-foreground')}>
          {label}
        </Text>
        <Icon name="chevronDown" size={14} tone={branch.branch ? 'primary-foreground' : 'muted-foreground'} />
      </Pressable>
      <OptionSheet
        visible={open}
        title={t('branch_filter')}
        value={branch.branchUuid ?? ALL}
        searchable={branch.branches.length > 8}
        options={[
          { value: ALL, label: allLabel },
          ...branch.branches.map((b) => ({ value: b.uuid, label: b.name, description: b.code })),
        ]}
        onClose={() => setOpen(false)}
        onPick={(v) => {
          setOpen(false);
          branch.setBranch(v === ALL ? null : v);
        }}
      />
    </>
  );
}

function Kpi({ label, value, hint, alert }: { label: string; value: string; hint?: string; alert?: boolean }) {
  return (
    <View className="min-w-[132px] gap-0.5 rounded-lg border border-border bg-card px-3.5 py-2.5">
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="headline" className="tabular-nums" numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text variant="footnote" tone={alert ? 'danger' : 'muted'} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/** KPI chips in a horizontal row; only those the API computed for the member's roles. */
export function KpiChips({ chips }: { chips: KpiChip[] }) {
  const { t } = useTranslation('today');
  if (!chips.length) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-4"
      contentContainerClassName="gap-2 px-4">
      {chips.map((c) => {
        switch (c.key) {
          case 'occupancy':
            return (
              <Kpi
                key={c.key}
                label={t('kpi.occupancy')}
                value={`%${formatNumber(c.rate, 1)}`}
                hint={t('kpi.occupancy_hint', { rented: c.rented, rentable: c.rentable })}
              />
            );
          case 'active':
            return (
              <Kpi
                key={c.key}
                label={t('kpi.active')}
                value={formatNumber(c.active)}
                hint={c.overdue > 0 ? t('kpi.active_overdue', { count: c.overdue }) : t('kpi.active_none_overdue')}
                alert={c.overdue > 0}
              />
            );
          case 'collections':
            return (
              <Kpi
                key={c.key}
                label={t('kpi.collections')}
                value={formatMoney(c.net, c.currency)}
                hint={t('kpi.collections_hint', { count: c.count })}
              />
            );
          case 'approvals':
            return (
              <Kpi
                key={c.key}
                label={t('kpi.approvals')}
                value={formatNumber(c.pending)}
                hint={c.overdue > 0 ? t('kpi.approvals_overdue', { count: c.overdue }) : undefined}
                alert={c.overdue > 0}
              />
            );
          case 'resolution':
            return (
              <Kpi
                key={c.key}
                label={t('kpi.resolution')}
                value={formatNumber(c.open)}
                hint={t('kpi.open')}
                alert={c.open > 0}
              />
            );
          case 'jobs':
            return <Kpi key={c.key} label={t('kpi.jobs')} value={formatNumber(c.total)} alert={c.total > 0} />;
        }
      })}
    </ScrollView>
  );
}

/** Titled group of rows with its count; an empty group says so instead of disappearing. */
export function BoardSection({
  title,
  count,
  note,
  empty,
  more,
  children,
}: {
  title: string;
  count: number;
  note?: ReactNode;
  empty: string;
  /** Rows the API counted but did not send (compact sections send 5). */
  more?: number;
  children: ReactNode;
}) {
  const { t } = useTranslation('today');
  return (
    <View>
      <View className="flex-row items-center justify-between pr-4">
        <SectionHeader title={`${title} · ${count}`} />
        {note}
      </View>
      <List>
        {count === 0 ? (
          <View className="px-4 py-5">
            <Text variant="callout" tone="muted" className="text-center">
              {empty}
            </Text>
          </View>
        ) : (
          children
        )}
      </List>
      {more && more > 0 ? (
        <Text variant="footnote" tone="muted" className="px-4 pt-1.5">
          {t('more', { count: more })}
        </Text>
      ) : null}
    </View>
  );
}

/** "40 dk gecikti" / "2 sa 15 dk kaldı" for a deadline, as a pill. */
export function Countdown({ deadline, now }: { deadline: string | null | undefined; now: number }) {
  const { t } = useTranslation('today');
  const c = countdown(deadline, now);
  if (!c) return null;
  const text = countdownText(c);
  return <StatusPill label={t(text.key, text.params)} tone={c.late ? 'problem' : c.soon ? 'progress' : 'neutral'} />;
}

/** A board row: time on the leading side, customer, then plate · branch · reference, a status pill. */
export function BoardRow({
  time,
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  time?: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <ListRow
      leading={
        time ? (
          <Text variant="headline" className="w-14 tabular-nums">
            {time}
          </Text>
        ) : undefined
      }
      title={title}
      subtitle={subtitle}
      trailing={trailing}
      onPress={onPress}
      last={last}
    />
  );
}

export function joinMeta(parts: (string | null | undefined)[]) {
  return parts.filter(Boolean).join(' · ');
}
