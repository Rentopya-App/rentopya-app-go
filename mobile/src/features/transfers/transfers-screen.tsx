import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { PlateBadge } from '@/features/vehicles/vehicle-row';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useTransferList } from './api';
import {
  DIRECTIONS,
  personName,
  STATUS_FILTERS,
  STATUS_TONES,
  transferQuery,
  type Direction,
  type StatusFilter,
  type Transfer,
} from './lib';

/** One transfer: plate and status, the route, the planned (or actual) times and who drives. */
export function TransferRow({ transfer, last }: { transfer: Transfer; last?: boolean }) {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const departure = transfer.actual_departure ?? transfer.planned_departure;
  const arrival = transfer.actual_arrival ?? transfer.planned_arrival;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transfer.vehicle.plate}, ${transfer.from_branch.code} → ${transfer.to_branch.code}, ${t(`status.${transfer.status}`)}`}
      onPress={() => router.push(`/transfers/${transfer.uuid}`)}
      className={cn('gap-2 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-3">
        <PlateBadge plate={transfer.vehicle.plate} />
        <View className="flex-1" />
        <StatusPill label={t(`status.${transfer.status}`)} tone={STATUS_TONES[transfer.status]} />
      </View>
      <View className="flex-row items-center gap-2">
        <Text variant="callout" className="font-sans-semibold" numberOfLines={1}>
          {transfer.from_branch.name}
        </Text>
        <Icon name="forward" tone="muted-foreground" size={14} />
        <Text variant="callout" className="flex-1 font-sans-semibold" numberOfLines={1}>
          {transfer.to_branch.name}
        </Text>
      </View>
      <Text variant="footnote" tone="muted" className="tabular-nums" numberOfLines={1}>
        {`${formatShort(departure)} → ${formatShort(arrival)}`}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[transfer.vehicle.label, personName(transfer.responsible) || t('transfers_app:no_responsible')]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

/**
 * "Transferler": the panel's `/fleet/transfers` for the phone. Search
 * (plate, note, branch names), status chips (open ones first) and, with a
 * branch picked in the menu, transfers leaving or arriving at it.
 */
export function TransfersScreen() {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const can = useCan();
  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () =>
            can(Permission.TenantTransfersWrite) ? (
              <HeaderButton icon="add" label={t('actions.create')} onPress={() => router.push('/transfers/new')} />
            ) : null,
        }}
      />
      <Can
        perm={Permission.TenantTransfersRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <TransferList />
      </Can>
    </>
  );
}

function TransferList() {
  const { t } = useTranslation(['transfers', 'transfers_app']);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [direction, setDirection] = useState<Direction>('from');
  const branch = useSelectedBranch();
  const search = useDebounced(q);
  const params = useMemo(
    () => transferQuery({ q: search, status, branch: branch.branchUuid, direction }),
    [search, status, branch.branchUuid, direction],
  );
  const query = useTransferList(params);
  const filtered = !!search.trim() || status !== 'all' || (!!branch.branchUuid && direction !== 'any');

  return (
    <PagedList
      query={query}
      keyOf={(x) => x.uuid}
      empty={filtered ? t('empty_filtered_title') : t('empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('transfers_app:search_placeholder')} />
          <Chips
            options={STATUS_FILTERS.map((s) => ({
              value: s,
              label: s === 'open' || s === 'all' ? t(`transfers_app:filter.${s}`) : t(`status.${s}`),
            }))}
            value={status}
            onChange={setStatus}
          />
          {branch.branch ? (
            <Chips
              options={DIRECTIONS.map((d) => ({
                value: d,
                label: t(`transfers_app:direction.${d}`, { branch: branch.branch?.code ?? '' }),
              }))}
              value={direction}
              onChange={setDirection}
            />
          ) : null}
        </>
      }
      renderItem={(x, _i, last) => <TransferRow transfer={x} last={last} />}
    />
  );
}
