import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { useVehicleFacets, useVehicleList } from './api';
import { VEHICLE_STATUSES } from './forms';
import { statusKey } from './labels';
import { VehicleRow } from './vehicle-row';

const ALL = '__all__';

/**
 * "Araçlar": the panel's vehicle list for the phone. Search by plate (the
 * API ignores spaces and dashes), VIN or name; filter by status and rental
 * group; the branch filter of the menu limits it to vehicles at that branch.
 * The QR button scans a vehicle label or a plate.
 */
export function VehiclesScreen() {
  const { t } = useTranslation(['vehicles_app', 'vehicles']);
  const can = useCan();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const [status, setStatus] = useState<string>(ALL);
  const [group, setGroup] = useState<string>(ALL);
  const branch = useSelectedBranch();
  const search = useDebounced(q);

  // A plate handed over by the scanner replaces the search.
  const [seenQ, setSeenQ] = useState(params.q);
  if (params.q !== seenQ) {
    setSeenQ(params.q);
    if (params.q !== undefined) setQ(params.q);
  }

  const readable = can(Permission.TenantVehiclesRead);
  const query = useVehicleList({
    q: search,
    status: status === ALL ? null : status,
    group: group === ALL ? null : group,
    branch: branch.branchUuid,
  });
  const facets = useVehicleFacets();
  const groups = facets.data?.rental_group ?? [];
  const filtered = !!search.trim() || status !== ALL || group !== ALL;

  const header = (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder={t('search_placeholder')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...VEHICLE_STATUSES.map((s) => ({ value: s, label: t(statusKey(s)) })),
        ]}
        value={status}
        onChange={setStatus}
      />
      {groups.length > 0 ? (
        <Select
          label={t('vehicles:fields.rental_group')}
          value={group}
          searchable={groups.length > 8}
          options={[
            { value: ALL, label: t('all_groups') },
            ...groups.map((g) => ({ value: g.value, label: g.label ?? g.value, description: String(g.count) })),
          ]}
          onChange={setGroup}
        />
      ) : null}
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
          title: t('vehicles:title'),
          headerRight: () =>
            readable ? (
              <View className="flex-row gap-1">
                <HeaderButton icon="qr" label={t('scan')} onPress={() => router.push('/vehicle/scan')} />
                {can(Permission.TenantVehiclesWrite) ? (
                  <HeaderButton
                    icon="add"
                    label={t('vehicles:actions.create')}
                    onPress={() => router.push('/vehicle/new')}
                  />
                ) : null}
              </View>
            ) : null,
        }}
      />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(v) => v.uuid}
          empty={filtered ? t('vehicles:empty_filtered_title') : t('vehicles:empty_title')}
          renderItem={(v, _i, last) => (
            <VehicleRow vehicle={v} last={last} onPress={() => router.push(`/vehicle/${v.uuid}`)} />
          )}
        />
      ) : (
        <EmptyState icon="security" title={t('vehicles:forbidden')} />
      )}
    </>
  );
}
