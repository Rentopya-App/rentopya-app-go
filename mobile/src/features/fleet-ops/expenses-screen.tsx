import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useExpenseCategories, useExpenses, type Expense } from './api';
import { EXPENSE_STATUSES } from './model';

const ALL = '__all__';

/**
 * "Giderler" (the panel's `/finance/expenses`): newest first, search,
 * status, category and a date range; the menu's branch filter narrows it
 * to that branch. Bulk actions and import / export stay on the panel.
 */
export function ExpensesScreen() {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const can = useCan();
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const [category, setCategory] = useState<string>(ALL);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const search = useDebounced(q);
  const readable = can(Permission.TenantFinanceExpensesRead);
  const categories = useExpenseCategories(false);
  const query = useExpenses({
    q: search,
    status: status === ALL ? null : status,
    category: category === ALL ? null : category,
    branch: branch.branchUuid,
    from,
    to,
  });
  const filtered = !!search.trim() || status !== ALL || category !== ALL || !!from || !!to;

  const header = (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder={t('expense_search')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...EXPENSE_STATUSES.map((s) => ({ value: s, label: t(`finance:expense_status.${s}`) })),
        ]}
        value={status}
        onChange={setStatus}
      />
      <Select
        label={t('finance:fields.category')}
        value={category}
        searchable
        options={[
          { value: ALL, label: t('all_categories') },
          ...(categories.data?.items ?? []).map((c) => ({ value: c.uuid, label: c.name })),
        ]}
        onChange={setCategory}
      />
      <View className="flex-row gap-3">
        <View className="flex-1">
          <DateField
            label={t('finance:filters.from')}
            value={from || null}
            max={to || undefined}
            placeholder={t('any_date')}
            onChange={setFrom}
            onClear={() => setFrom('')}
          />
        </View>
        <View className="flex-1">
          <DateField
            label={t('finance:filters.to')}
            value={to || null}
            min={from || undefined}
            placeholder={t('any_date')}
            onChange={setTo}
            onClear={() => setTo('')}
          />
        </View>
      </View>
      {branch.branch ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('branch_filter', { name: branch.branch.name })}
        </Text>
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('finance:expenses.title'),
          headerRight: () =>
            can(Permission.TenantFinanceExpensesWrite) ? (
              <View className="flex-row gap-1">
                <HeaderButton
                  icon="settings"
                  label={t('finance:categories.title')}
                  onPress={() => router.push('/finance/expense-categories')}
                />
                <HeaderButton
                  icon="add"
                  label={t('finance:expenses.create')}
                  onPress={() => router.push('/finance/expenses/new')}
                />
              </View>
            ) : readable ? (
              <HeaderButton
                icon="settings"
                label={t('finance:categories.title')}
                onPress={() => router.push('/finance/expense-categories')}
              />
            ) : null,
        }}
      />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(e) => e.uuid}
          empty={filtered ? t('finance:expenses.empty_filtered') : t('finance:expenses.empty')}
          renderItem={(e, _i, last) => <ExpenseRow expense={e} last={last} />}
        />
      ) : (
        <EmptyState icon="security" title={t('finance:forbidden')} />
      )}
    </>
  );
}

export function ExpenseRow({ expense: e, last }: { expense: Expense; last?: boolean }) {
  const { t } = useTranslation(['fleet_ops_app', 'finance']);
  const voided = e.status === 'void';
  const where = [e.branch?.name ?? t('finance:head_office'), e.vehicle?.code].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${e.category.name ?? ''}, ${formatMoney(e.total_amount, e.currency)}`}
      onPress={() => router.push(`/finance/expenses/${e.uuid}`)}
      className={cn('gap-1.5 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-3">
        <Text variant="callout" className="flex-1 font-sans-semibold" numberOfLines={1}>
          {e.category.name}
        </Text>
        <Text
          variant="callout"
          tone={voided ? 'muted' : 'default'}
          className={cn('font-sans-bold tabular-nums', voided && 'line-through')}>
          {formatMoney(e.total_amount, e.currency)}
        </Text>
      </View>
      {e.description || e.supplier_name || e.document_no ? (
        <Text variant="footnote" numberOfLines={1}>
          {[e.description, e.supplier_name, e.document_no].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      <View className="flex-row items-center gap-2">
        <Icon name="calendar" tone="muted-foreground" size={14} />
        <Text variant="footnote" tone="muted" className="flex-1" numberOfLines={1}>
          {formatCalendarDate(e.expense_date)} · {where}
        </Text>
        {e.attachment ? <Icon name="document" tone="muted-foreground" size={14} /> : null}
        {voided ? <StatusPill label={t('finance:expense_status.void')} tone="problem" /> : null}
      </View>
    </Pressable>
  );
}
