import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { formatMoney } from '@/core/format';
import { Card, Stat } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';

import { useDepositTotals } from './api';

/**
 * "Finans" hub of the menu: the panel's collections, payment links,
 * unmatched payments and deposits, each shown with its own permission.
 * Taking a payment or sending a link starts from the reservation.
 */
export function FinanceScreen() {
  const { t } = useTranslation(['finance_app', 'finance', 'payments', 'deposits']);
  const can = useCan();
  const collections = can(Permission.TenantFinanceAccountsRead);
  const payments = can(Permission.TenantPaymentsRead);
  const deposits = can(Permission.TenantFinanceDepositsRead);
  const totals = useDepositTotals(null, deposits);
  const sums = totals.data;

  const rows = [
    collections && {
      key: 'collections',
      icon: 'wallet' as const,
      title: t('finance:collections.title'),
      subtitle: t('hub_collections'),
      href: '/finance/collections' as const,
    },
    payments && {
      key: 'links',
      icon: 'link' as const,
      title: t('payments:links.title'),
      subtitle: t('hub_links'),
      href: '/finance/payment-links' as const,
    },
    payments && {
      key: 'orphans',
      icon: 'error' as const,
      title: t('payments:orphans.title'),
      subtitle: t('hub_orphans'),
      href: '/finance/payment-orphans' as const,
    },
    deposits && {
      key: 'deposits',
      icon: 'security' as const,
      title: t('deposits:title'),
      subtitle: t('hub_deposits'),
      href: '/finance/deposits' as const,
    },
  ].filter((r) => !!r);

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {rows.length === 0 ? (
        <EmptyState icon="security" title={t('forbidden_title')} body={t('finance:forbidden')} />
      ) : (
        <Screen
          refreshControl={
            deposits ? (
              <RefreshControl refreshing={totals.isRefetching} onRefresh={() => void totals.refetch()} />
            ) : undefined
          }>
          {deposits && sums ? (
            <Card title={t('deposits:totals.held')} onPress={() => router.push('/finance/deposits')}>
              <View className="flex-row gap-4">
                <Stat
                  label={t('deposits:totals.count', { count: sums.held_count })}
                  value={formatMoney(sums.held_amount, sums.currency)}
                />
                <Stat
                  label={t('deposits:totals.held_over', { days: sums.held_over_days })}
                  value={String(sums.held_over)}
                />
              </View>
            </Card>
          ) : null}
          <View>
            <SectionHeader title={t('section')} />
            <List>
              {rows.map((r, i) => (
                <ListRow
                  key={r.key}
                  icon={r.icon}
                  title={r.title}
                  subtitle={r.subtitle}
                  onPress={() => router.push(r.href)}
                  last={i === rows.length - 1}
                />
              ))}
            </List>
          </View>
        </Screen>
      )}
    </>
  );
}
