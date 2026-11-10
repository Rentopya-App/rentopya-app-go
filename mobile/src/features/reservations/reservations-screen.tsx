import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan, useCanAll } from '@/core/auth/permissions';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { useOverviewBadges } from '@/features/today/use-today';
import { Chips } from '@/ui/chips';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { useReservations } from './api';
import { LIST_SORTS, PAYMENT_STATUSES, RESERVATION_STATUSES, type ListFilters } from './lib';
import { Gate, ReservationRow } from './parts';

/** Shortcuts to the reservation work lists, each behind the panel page's permission. */
function Hub() {
  const { t } = useTranslation('reservations_app');
  const can = useCan();
  const canAll = useCanAll();
  const badges = useOverviewBadges().data;
  const rows = [
    canAll(Permission.TenantReservationsRead, Permission.TenantReservationsApprove) && {
      key: 'approvals',
      icon: 'check' as const,
      title: t('payments:approvals.title'),
      count: badges?.approvals?.pending,
      onPress: () => router.push('/reservations/approvals'),
    },
    can(Permission.TenantReservationsRead) && {
      key: 'requests',
      icon: 'inbox' as const,
      title: t('customer_portal:staff.title'),
      onPress: () => router.push('/reservations/requests'),
    },
    can(Permission.TenantQuotesRead) && {
      key: 'quotes',
      icon: 'wallet' as const,
      title: t('reservations:quotes.title'),
      onPress: () => router.push('/reservations/quotes'),
    },
    can(Permission.TenantResolutionTasksRead) && {
      key: 'tasks',
      icon: 'error' as const,
      title: t('reservations:tasks.title'),
      count: badges?.resolution_tasks?.open,
      onPress: () => router.push('/reservations/tasks'),
    },
  ].filter((r) => !!r);
  if (!rows.length) return null;
  return (
    <List>
      {rows.map((r, i) => (
        <ListRow
          key={r.key}
          icon={r.icon}
          title={r.title}
          onPress={r.onPress}
          last={i === rows.length - 1}
          trailing={
            r.count ? (
              <View className="min-w-6 items-center rounded-full bg-primary px-2 py-0.5">
                <Text variant="footnote" className="font-sans-semibold text-primary-foreground tabular-nums">
                  {String(r.count)}
                </Text>
              </View>
            ) : undefined
          }
        />
      ))}
    </List>
  );
}

/**
 * "Rezervasyonlar" (the panel's `/reservations`): search (reference,
 * channel number, customer, plate), status / payment filters, the branch
 * filter of the menu, newest or by pick-up; plus the work lists.
 */
export function ReservationsScreen() {
  const { t } = useTranslation('reservations');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Gate perm={Permission.TenantReservationsRead} body={t('forbidden')}>
        <ReservationsList />
      </Gate>
    </>
  );
}

function ReservationsList() {
  const { t } = useTranslation('reservations_app');
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ListFilters['status']>('all');
  const [payment, setPayment] = useState<ListFilters['payment']>('all');
  const [sort, setSort] = useState<ListFilters['sort']>('-created_at');
  const search = useDebounced(q);
  const filters = useMemo<ListFilters>(
    () => ({ q: search, status, payment, sort, branch: branch.branchUuid }),
    [search, status, payment, sort, branch.branchUuid],
  );
  const query = useReservations(filters);
  const filtered = !!search.trim() || status !== 'all' || payment !== 'all';
  return (
    <PagedList
      query={query}
      keyOf={(r) => r.uuid}
      empty={filtered ? t('reservations:empty_filtered_title') : t('reservations:empty_title')}
      header={
        <>
          <Hub />
          <SearchField value={q} onChangeText={setQ} placeholder={t('search')} />
          <Chips
            options={[
              { value: 'all' as const, label: t('common:all') },
              ...RESERVATION_STATUSES.map((s) => ({ value: s, label: t(`reservations:statuses.${s}`) })),
            ]}
            value={status}
            onChange={setStatus}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Select
                label={t('payment_filter')}
                value={payment}
                options={[
                  { value: 'all' as const, label: t('common:all') },
                  ...PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`reservations:payment_statuses.${s}`) })),
                ]}
                onChange={setPayment}
              />
            </View>
            <View className="flex-1">
              <Select
                label={t('sort')}
                value={sort}
                options={LIST_SORTS.map((s) => ({ value: s, label: t(`sorts.${s}`) }))}
                onChange={setSort}
              />
            </View>
          </View>
          {branch.branch ? (
            <Text variant="footnote" tone="muted" className="px-1">
              {t('branch_filtered', { branch: branch.branch.name })}
            </Text>
          ) : null}
        </>
      }
      renderItem={(r) => <ReservationRow item={r} />}
    />
  );
}
