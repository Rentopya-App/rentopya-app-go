import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { DEFAULT_TIME_ZONE, formatDuration, formatMoney, formatShort } from '@/core/format';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { rentalActions, rentalTone, reservationTone } from './today-model';
import { useRentalSummary, useReservationSummary } from './use-today';

const ZONE = DEFAULT_TIME_ZONE;

type Line = { label: string; value: string | null | undefined; trailing?: ReactNode; onPress?: () => void };

/** Label / value rows; empty values are left out. */
function Lines({ title, lines }: { title: string; lines: Line[] }) {
  const shown = lines.filter((l) => l.value || l.trailing);
  if (!shown.length) return null;
  return (
    <View>
      <SectionHeader title={title} />
      <List>
        {shown.map((l, i) => (
          <ListRow
            key={l.label}
            title={l.value ?? ''}
            subtitle={l.label}
            trailing={l.trailing}
            onPress={l.onPress}
            last={i === shown.length - 1}
          />
        ))}
      </List>
    </View>
  );
}

function place(p: { branch: { name: string } | null; point: { name: string } | null }, at: string | null) {
  return [p.point?.name ?? p.branch?.name, at ? formatShort(at, ZONE) : null].filter(Boolean).join(' · ');
}

function Note() {
  const { t } = useTranslation('today');
  return (
    <Text variant="footnote" tone="muted" className="px-1">
      {t('detail.summary_note')}
    </Text>
  );
}

/**
 * Read-only rental summary (`GET /v1/tenant/rentals/{uuid}`) opened from the
 * board, with the field actions the panel offers in the same state:
 * "Teslim et" in preparation, "İade al" while active (`tenant.rentals.write`).
 * The full rental module is a later screen.
 */
export function RentalSummaryScreen() {
  const { t } = useTranslation('today');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const can = useCan();
  const query = useRentalSummary(uuid);
  const r = query.data;
  const actions = rentalActions(r?.status, can(Permission.TenantRentalsWrite));
  return (
    <>
      <Stack.Screen options={{ title: r?.reference ?? t('detail.rental') }} />
      <Can perm={Permission.TenantRentalsRead} fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>
            {(rental) => (
              <>
                <View className="flex-row items-center justify-between gap-3 px-1">
                  <Text variant="title" numberOfLines={1} className="flex-1">
                    {rental.customer.display_name}
                  </Text>
                  <StatusPill label={t(`rental_status.${rental.status}`)} tone={rentalTone(rental.status)} />
                </View>
                {actions.handover || actions.return ? (
                  <View className="gap-2">
                    {actions.handover ? (
                      <Button
                        size="lg"
                        icon="car"
                        title={t('action.handover')}
                        onPress={() =>
                          router.push({ pathname: '/field/handover/[rentalUuid]', params: { rentalUuid: rental.uuid } })
                        }
                      />
                    ) : null}
                    {actions.return ? (
                      <Button
                        size="lg"
                        icon="check"
                        title={t('action.return')}
                        onPress={() =>
                          router.push({ pathname: '/field/return/[rentalUuid]', params: { rentalUuid: rental.uuid } })
                        }
                      />
                    ) : null}
                  </View>
                ) : null}
                <Lines
                  title={t('detail.section_plan')}
                  lines={[
                    {
                      label: t('detail.vehicle'),
                      value: rental.vehicle?.plate
                        ? [rental.vehicle.plate, rental.vehicle.label].filter(Boolean).join(' · ')
                        : t('detail.no_vehicle'),
                    },
                    { label: t('detail.product'), value: rental.product?.name },
                    { label: t('detail.pickup'), value: place(rental.planned_pickup, rental.planned_pickup_at) },
                    { label: t('detail.return'), value: place(rental.planned_return, rental.planned_return_at) },
                    {
                      label: t('detail.actual_pickup'),
                      value: rental.actual_pickup_at ? place(rental.actual_pickup, rental.actual_pickup_at) : null,
                    },
                    {
                      label: t('detail.actual_return'),
                      value: rental.actual_return_at ? place(rental.actual_return, rental.actual_return_at) : null,
                    },
                    {
                      label: t('detail.late'),
                      value: rental.late_minutes > 0 ? formatDuration(rental.late_minutes) : null,
                    },
                  ]}
                />
                <Lines
                  title={t('detail.section_payment')}
                  lines={[
                    {
                      label: t('detail.total'),
                      value: formatMoney(rental.reservation.total_amount, rental.reservation.currency),
                    },
                    {
                      label: t('detail.paid'),
                      value: formatMoney(rental.reservation.paid_amount, rental.reservation.currency),
                    },
                    {
                      label: t('detail.reservation_ref'),
                      value: rental.reservation.reference,
                      onPress: can(Permission.TenantReservationsRead)
                        ? () =>
                            router.push({ pathname: '/reservations/[uuid]', params: { uuid: rental.reservation.uuid } })
                        : undefined,
                    },
                  ]}
                />
                <Note />
              </>
            )}
          </QueryState>
        </Screen>
      </Can>
    </>
  );
}

/** Read-only reservation summary (`GET /v1/tenant/reservations/{uuid}`); the reservations module is a later screen. */
export function ReservationSummaryScreen() {
  const { t } = useTranslation('today');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const query = useReservationSummary(uuid);
  const r = query.data;
  return (
    <>
      <Stack.Screen options={{ title: r?.reference ?? t('detail.reservation') }} />
      <Can
        perm={Permission.TenantReservationsRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query}>
            {(res) => {
              const vehicle = res.plan.assigned_vehicle ?? res.plan.planned_vehicle;
              return (
                <>
                  <View className="flex-row items-center justify-between gap-3 px-1">
                    <Text variant="title" numberOfLines={1} className="flex-1">
                      {res.customer.display_name}
                    </Text>
                    <StatusPill label={t(`reservation_status.${res.status}`)} tone={reservationTone(res.status)} />
                  </View>
                  <Lines
                    title={t('detail.section_plan')}
                    lines={[
                      {
                        label: t('detail.vehicle'),
                        value: vehicle
                          ? [vehicle.plate, vehicle.label].filter(Boolean).join(' · ')
                          : t('detail.no_vehicle'),
                      },
                      { label: t('detail.product'), value: res.plan.product?.title },
                      {
                        label: t('detail.pickup'),
                        value: [res.pickup_point?.name ?? res.pickup_branch.name, formatShort(res.starts_at, ZONE)]
                          .filter(Boolean)
                          .join(' · '),
                      },
                      {
                        label: t('detail.return'),
                        value: [res.return_point?.name ?? res.return_branch.name, formatShort(res.ends_at, ZONE)]
                          .filter(Boolean)
                          .join(' · '),
                      },
                    ]}
                  />
                  <Lines
                    title={t('detail.section_payment')}
                    lines={[
                      { label: t('detail.total'), value: formatMoney(res.price.total, res.price.currency) },
                      { label: t('detail.paid'), value: formatMoney(res.price.paid, res.price.currency) },
                      { label: t('detail.balance'), value: formatMoney(res.price.balance, res.price.currency) },
                    ]}
                  />
                  <Note />
                </>
              );
            }}
          </QueryState>
        </Screen>
      </Can>
    </>
  );
}

/**
 * Placeholder of the mobile handover / return flows (TEC-1145 / TEC-1146),
 * behind the same permission as the panel's field pages (`tenant.rentals.write`).
 */
export function FieldStubScreen({ kind }: { kind: 'handover' | 'return' }) {
  const { t } = useTranslation('today');
  const { rentalUuid } = useLocalSearchParams<{ rentalUuid: string }>();
  const rental = useRentalSummary(rentalUuid);
  return (
    <>
      <Stack.Screen options={{ title: t(kind === 'handover' ? 'field.handover_title' : 'field.return_title') }} />
      <Can perm={Permission.TenantRentalsWrite} fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
        <Screen>
          {rental.data ? (
            <Text variant="callout" tone="muted" className="px-1">
              {[rental.data.reference, rental.data.vehicle?.plate, rental.data.customer.display_name]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <EmptyState icon="clock" title={t('field.soon_title')} body={t('field.soon_body')} />
        </Screen>
      </Can>
    </>
  );
}
