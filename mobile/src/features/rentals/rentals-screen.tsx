import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Can, Permission } from '@/core/auth/permissions';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';

import { useRentalFacets, useRentals } from './api';
import { RENTAL_FILTERS, RENTAL_SORTS, rentalListQuery, type RentalFilter, type RentalSort } from './lib';
import { RentalRow } from './parts';

const ALL = '__all__';

/**
 * "Kiralamalar" tab (the panel's `/t/{slug}/rentals`): search, status and
 * overdue filter, product and sort, the branch filter of the menu; links to
 * the operation tasks and the handover / return forms.
 */
export function RentalsScreen() {
  const { t } = useTranslation('rentals');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Can
        perm={Permission.TenantRentalsRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <RentalsList />
      </Can>
    </>
  );
}

function RentalsList() {
  const { t } = useTranslation('rentals');
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const [filter, setFilter] = useState<RentalFilter>('all');
  const [sort, setSort] = useState<RentalSort>('-created_at');
  const [product, setProduct] = useState<string | null>(null);
  const facets = useRentalFacets();
  const query = useRentals(
    useMemo(
      () => rentalListQuery({ q: search, filter, sort, branch: branch.branchUuid, product }),
      [search, filter, sort, branch.branchUuid, product],
    ),
  );
  const filtered = !!search.trim() || filter !== 'all' || !!product;
  const products = facets.data?.product ?? [];
  return (
    <PagedList
      query={query}
      keyOf={(r) => r.uuid}
      empty={filtered ? t('empty_filtered_title') : t('empty_title')}
      header={
        <>
          <List>
            <ListRow
              icon="check"
              title={t('tasks.title')}
              subtitle={t('rentals_app:tasks_hint')}
              onPress={() => router.push('/operation-tasks')}
            />
            <ListRow
              icon="car"
              title={t('inspections_web:list.title')}
              subtitle={t('rentals_app:inspections_hint')}
              onPress={() => router.push('/inspections')}
              last
            />
          </List>
          <SearchField value={q} onChangeText={setQ} placeholder={t('rentals_app:search')} />
          <Chips
            options={RENTAL_FILTERS.map((f) => ({
              value: f,
              label: f === 'all' ? t('common:all') : f === 'overdue' ? t('overdue_badge') : t(`statuses.${f}`),
            }))}
            value={filter}
            onChange={setFilter}
          />
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Select
                label={t('rentals_app:sort')}
                value={sort}
                options={RENTAL_SORTS.map((s) => ({ value: s, label: t(`rentals_app:sorts.${s}`) }))}
                onChange={setSort}
              />
            </View>
            {products.length > 1 ? (
              <View className="flex-1">
                <Select
                  label={t('facets.product')}
                  value={product ?? ALL}
                  options={[
                    { value: ALL, label: t('common:all') },
                    ...products.map((p) => ({ value: p.value, label: p.label || p.value })),
                  ]}
                  onChange={(v) => setProduct(v === ALL ? null : v)}
                />
              </View>
            ) : null}
          </View>
        </>
      }
      renderItem={(rental) => <RentalRow rental={rental} />}
    />
  );
}
