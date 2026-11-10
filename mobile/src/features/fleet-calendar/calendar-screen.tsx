import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { router, Stack, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { Can, Permission, useCan } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import {
  addDays,
  displayTimeZone,
  formatCalendarDate,
  formatDay,
  formatPercent,
  formatShort,
  localDate,
} from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { VEHICLE_STATUSES } from '@/features/vehicles/forms';
import { maintenanceTypeKey, STATUS_TONE, statusKey } from '@/features/vehicles/labels';
import { PlateBadge } from '@/features/vehicles/vehicle-row';
import { Button, IconButton } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { nextOffset, PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import {
  busyShare,
  calendarWindow,
  intervalKey,
  intervalPath,
  rowEntries,
  segments,
  shiftAnchor,
  ZOOMS,
  type CalendarWindow,
  type Entry,
  type FleetCalendar,
  type FleetCalendarRow,
  type Segment,
  type Zoom,
} from './lib';

const PAGE = 50;
const ALL = '__all__';

const BAR: Record<Segment['kind'], string> = {
  block: 'bg-destructive',
  transfer: 'bg-primary',
  hold: 'bg-warning',
  reservation: 'bg-success',
};

/** `GET /v1/tenant/fleet/calendar` for a window, a page of vehicles at a time. */
function useFleetCalendar(w: CalendarWindow, f: { q: string; status: string | null; branch: string | null }) {
  const org = useSession((s) => s.organization?.slug ?? '');
  return useInfiniteQuery({
    queryKey: ['fleet-calendar', org, w.from, w.to, f],
    enabled: !!org,
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    placeholderData: keepPreviousData,
    queryFn: ({ pageParam }): Promise<FleetCalendar> =>
      unwrap(
        api.GET('/v1/tenant/fleet/calendar', {
          params: {
            header: orgHeader(),
            query: {
              from: w.from,
              to: w.to,
              limit: PAGE,
              offset: pageParam,
              ...(f.q.trim() ? { q: f.q.trim() } : {}),
              ...(f.status ? { status: f.status } : {}),
              ...(f.branch ? { current_branch: f.branch } : {}),
            },
          },
        }),
      ),
  });
}

/**
 * "Filo takvimi" (`tenant.vehicles.read`), read-only: a day or a week, each
 * vehicle with an occupancy strip and its blocks, transfers, holds,
 * reservations and maintenance days as a list. Plate search, status and the
 * menu's branch (where the vehicle is now) filter it.
 */
export function FleetCalendarScreen() {
  const { t } = useTranslation('fleet_calendar');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Can
        perm={Permission.TenantVehiclesRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <Calendar />
      </Can>
    </>
  );
}

function Calendar() {
  const { t } = useTranslation(['fleet_calendar', 'transfers_app']);
  const zone = displayTimeZone();
  const today = localDate(new Date());
  const [zoom, setZoom] = useState<Zoom>('day');
  const [anchor, setAnchor] = useState(today);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const branch = useSelectedBranch();
  const search = useDebounced(q);
  const w = useMemo(() => calendarWindow(zoom, anchor, zone), [zoom, anchor, zone]);
  const query = useFleetCalendar(w, {
    q: search,
    status: status === ALL ? null : status,
    branch: branch.branchUuid,
  });
  const filtered = !!search.trim() || status !== ALL;
  const last = w.days > 1 ? formatDay(addDays(w.first, w.days - 1)) : null;

  return (
    <PagedList<FleetCalendarRow>
      query={query}
      keyOf={(row) => row.vehicle.uuid}
      empty={filtered ? t('empty_filtered_title') : t('empty_title')}
      header={
        <>
          <Chips options={ZOOMS.map((z) => ({ value: z, label: t(`zoom.${z}`) }))} value={zoom} onChange={setZoom} />
          <View className="flex-row items-center gap-2">
            <IconButton
              icon="back"
              label={t('nav.previous')}
              onPress={() => setAnchor((a) => shiftAnchor(zoom, a, -1))}
            />
            <View className="flex-1 items-center">
              <Text variant="headline" numberOfLines={1}>
                {formatDay(w.first)}
              </Text>
              {last ? (
                <Text variant="footnote" tone="muted" numberOfLines={1}>
                  {`– ${last}`}
                </Text>
              ) : null}
            </View>
            <IconButton
              icon="forward"
              label={t('nav.next')}
              onPress={() => setAnchor((a) => shiftAnchor(zoom, a, 1))}
            />
          </View>
          {anchor !== today ? (
            <Button icon="calendar" title={t('nav.today')} variant="ghost" onPress={() => setAnchor(today)} />
          ) : null}
          <SearchField value={q} onChangeText={setQ} placeholder={t('filters.plate')} />
          <Select
            label={t('filters.status')}
            value={status}
            options={[
              { value: ALL, label: t('common:all') },
              ...VEHICLE_STATUSES.map((s) => ({ value: s, label: t(statusKey(s)) })),
            ]}
            onChange={setStatus}
          />
          {branch.branch ? (
            <Text variant="footnote" tone="muted" className="px-1">
              {t('transfers_app:calendar.branch_filter', { name: branch.branch.name })}
            </Text>
          ) : null}
          <Legend />
        </>
      }
      renderItem={(row, _i, isLast) => <VehicleRow row={row} w={w} last={isLast} />}
    />
  );
}

function Legend() {
  const { t } = useTranslation('fleet_calendar');
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1 px-1">
      {(Object.keys(BAR) as Segment['kind'][]).map((k) => (
        <View key={k} className="flex-row items-center gap-1.5">
          <View className={cn('h-2 w-4 rounded-sm', BAR[k])} />
          <Text variant="footnote" tone="muted">
            {t(k === 'block' ? 'transfers_app:calendar.block' : `bar.${k}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One vehicle: plate, status, where it is, the occupancy strip and the window's entries. */
function VehicleRow({ row, w, last }: { row: FleetCalendarRow; w: CalendarWindow; last?: boolean }) {
  const { t } = useTranslation(['fleet_calendar', 'transfers_app']);
  const v = row.vehicle;
  const bars = segments(row.intervals, w);
  const entries = rowEntries(row);
  return (
    <View className={cn('gap-2 px-4 py-3', !last && 'border-b border-border')}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${v.plate}, ${t(statusKey(v.status))}`}
        onPress={() => router.push(`/vehicle/${v.uuid}`)}
        className="gap-1 active:opacity-70">
        <View className="flex-row items-center gap-3">
          <PlateBadge plate={v.plate} />
          <View className="flex-1" />
          <StatusPill label={t(statusKey(v.status))} tone={STATUS_TONE[v.status]} />
        </View>
        <Text variant="footnote" tone="muted" numberOfLines={1}>
          {[v.label, v.current_branch.name].filter(Boolean).join(' · ')}
        </Text>
      </Pressable>
      <View
        accessibilityLabel={t('transfers_app:calendar.busy', { share: formatPercent(busyShare(row.intervals, w)) })}
        className="h-2.5 overflow-hidden rounded-full bg-muted">
        {bars.map((s) => (
          <View
            key={s.key}
            className={cn('absolute inset-y-0 rounded-full', BAR[s.kind])}
            style={{ left: `${s.start * 100}%`, width: `${Math.max(s.end - s.start, 0.01) * 100}%` }}
          />
        ))}
      </View>
      {entries.length === 0 ? (
        <Text variant="footnote" tone="muted">
          {t('free')}
        </Text>
      ) : (
        <View className="gap-1.5">
          {entries.map((e) => (
            <EntryRow key={e.key} entry={e} />
          ))}
        </View>
      )}
    </View>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const { t } = useTranslation(['fleet_calendar', 'transfers_app']);
  const can = useCan();
  if (entry.type === 'maintenance') {
    const m = entry.item;
    return (
      <View className="flex-row items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
        <Icon name="wrench" tone="warning" size={14} />
        <Text variant="footnote" className="flex-1 font-sans-medium" numberOfLines={1}>
          {t(maintenanceTypeKey(m.maintenance_type))}
        </Text>
        <Text variant="footnote" tone="muted" className="tabular-nums">
          {formatCalendarDate(m.date)}
        </Text>
      </View>
    );
  }
  const i = entry.interval;
  const path = intervalPath(i);
  const allowed =
    !!path && (i.kind === 'transfer' ? can(Permission.TenantTransfersRead) : can(Permission.TenantReservationsRead));
  const detail =
    i.transfer != null
      ? `${i.transfer.from_branch.code} → ${i.transfer.to_branch.code}`
      : (i.allocation?.reservation?.reference ?? i.block?.reason ?? '');
  const body = (
    <View className="flex-row items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
      <View className={cn('size-2 rounded-full', BAR[i.kind])} />
      <View className="flex-1">
        <Text variant="footnote" className="font-sans-medium" numberOfLines={1}>
          {[t(intervalKey(i)), detail].filter(Boolean).join(' · ')}
        </Text>
        <Text variant="footnote" tone="muted" className="tabular-nums" numberOfLines={1}>
          {`${formatShort(i.starts_at)} – ${i.ends_at ? formatShort(i.ends_at) : t('vehicle_blocks:open_ended')}`}
        </Text>
      </View>
      {allowed ? <Icon name="forward" tone="muted-foreground" size={14} /> : null}
    </View>
  );
  if (!allowed || !path) return body;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(path as Href)} className="active:opacity-70">
      {body}
    </Pressable>
  );
}
