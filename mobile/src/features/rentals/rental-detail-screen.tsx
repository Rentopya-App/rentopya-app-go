import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatNumber, formatShort } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useInspections, useOperationTasks, useRental, useRentalEvents } from './api';
import {
  chargeDecisions,
  eventActionKey,
  eventReasonKey,
  inspectionListQuery,
  listedCharges,
  personName,
  placeName,
  RENTAL_TONES,
  rentalActions,
  taskListQuery,
  type Rental,
  type RentalCharge,
  type RentalEvent,
  type RentalPlace,
} from './lib';
import { Field, Fields, InspectionRow, TaskRow } from './parts';

function at(place: RentalPlace, iso: string | null) {
  return [placeName(place), iso ? formatShort(iso) : null].filter(Boolean).join(' · ');
}

/**
 * Rental page (the panel's `/t/{slug}/rentals/{uuid}`): planned vs actual,
 * the field handover / return forms, extend, vehicle swap, cancel; drivers,
 * vehicle legs, charges with approve / waive, operation tasks, the handover
 * / return forms and the timeline. Every action has the panel's gate; the
 * API checks each one again.
 */
export function RentalDetailScreen() {
  const { t } = useTranslation('rentals');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('detail_title') }} />
      <Can
        perm={Permission.TenantRentalsRead}
        fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
        <Detail uuid={uuid} />
      </Can>
    </>
  );
}

function Detail({ uuid }: { uuid: string }) {
  const query = useRental(uuid);
  const events = useRentalEvents(uuid);
  const tasks = useOperationTasks(useMemo(() => taskListQuery({ filter: 'all', rental: uuid }), [uuid]));
  const inspections = useInspections(useMemo(() => inspectionListQuery({ filter: 'all', rental: uuid }), [uuid]));
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void events.refetch();
            void tasks.refetch();
            void inspections.refetch();
          }}
        />
      }>
      <QueryState query={query} rows={6}>
        {(rental) => (
          <>
            <Stack.Screen options={{ title: rental.reference }} />
            <Header rental={rental} />
            <Actions rental={rental} />
            <Overview rental={rental} />
            <Charges rental={rental} />
            <Drivers rental={rental} />
            <Legs rental={rental} />
            <Related title="rentals:tasks.title" empty="rentals:tasks.empty_title" query={tasks}>
              {(task) => <TaskRow key={task.uuid} task={task} showRental={false} />}
            </Related>
            <Related
              title="rentals:detail.open_inspections"
              empty="inspections_web:list.empty_title"
              query={inspections}>
              {(item) => <InspectionRow key={item.uuid} item={item} showRental={false} />}
            </Related>
            <Timeline events={events} />
            <Policy rental={rental} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

/** A sub-list of the rental (its tasks, its forms): rows edge to edge in a card. */
function Related<T>({
  title,
  empty,
  query,
  children,
}: {
  title: string;
  empty: string;
  query: { data?: { pages: { items: T[] }[] }; isError: boolean };
  children: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card title={t(title)}>
      {items.length ? (
        <View className="-mx-4 -mb-4 border-t border-border">{items.map(children)}</View>
      ) : (
        <Text variant="callout" tone="muted">
          {query.data ? t(empty) : query.isError ? t('common:load_failed') : t('common:loading')}
        </Text>
      )}
    </Card>
  );
}

function Header({ rental: r }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const contractPending = r.contract.required && !r.contract.approved;
  return (
    <View className="gap-2 px-1">
      <Text variant="title" numberOfLines={2}>
        {r.customer.display_name}
      </Text>
      <Text variant="callout" tone="muted">
        {[r.vehicle.plate, r.vehicle.label].filter(Boolean).join(' · ')}
      </Text>
      <Text variant="footnote" tone="muted" className="tabular-nums">
        {`${formatShort(r.actual_pickup_at ?? r.planned_pickup_at)} → ${formatShort(
          r.actual_return_at ?? r.planned_return_at,
        )}`}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        <StatusPill label={t(`statuses.${r.status}`)} tone={RENTAL_TONES[r.status]} />
        {r.overdue_at ? <StatusPill label={t('overdue_badge')} tone="problem" /> : null}
        {contractPending ? (
          <StatusPill label={r.contract_waiver ? t('contract.waived') : t('contract.pending')} tone="progress" />
        ) : null}
      </View>
    </View>
  );
}

/** "Teslim et" / "İade al" open the field forms; extend, swap and cancel their own screens. */
function Actions({ rental: r }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const a = rentalActions(r.status, {
    write: can(Permission.TenantRentalsWrite),
    close: can(Permission.TenantRentalsClose),
  });
  if (!Object.values(a).some(Boolean)) return null;
  const base = `/rentals/${r.uuid}`;
  return (
    <View className="gap-2">
      {a.handover ? (
        <Button
          size="lg"
          icon="car"
          title={t('actions.handover')}
          onPress={() => router.push({ pathname: '/field/handover/[rentalUuid]', params: { rentalUuid: r.uuid } })}
        />
      ) : null}
      {a.return ? (
        <Button
          size="lg"
          icon="check"
          title={t('actions.return')}
          onPress={() => router.push({ pathname: '/field/return/[rentalUuid]', params: { rentalUuid: r.uuid } })}
        />
      ) : null}
      {a.extend || a.swap ? (
        <View className="flex-row gap-2">
          {a.extend ? (
            <Button
              className="flex-1"
              variant="outline"
              icon="calendar"
              title={t('actions.extend')}
              onPress={() => router.push(`${base}/extend` as Href)}
            />
          ) : null}
          {a.swap ? (
            <Button
              className="flex-1"
              variant="outline"
              icon="refresh"
              title={t('actions.swap')}
              onPress={() => router.push(`${base}/swap` as Href)}
            />
          ) : null}
        </View>
      ) : null}
      {a.cancel ? (
        <Button
          variant="ghost"
          icon="cancel"
          title={t('actions.cancel')}
          onPress={() => router.push(`${base}/cancel` as Href)}
        />
      ) : null}
    </View>
  );
}

function Overview({ rental: r }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const money = (v: string) => formatMoney(v, r.reservation.currency || 'TRY');
  const contract = !r.contract.required
    ? t('contract.not_required')
    : r.contract.approved
      ? t('contract.approved')
      : r.contract_waiver
        ? t('contract.waived')
        : t('contract.pending');
  return (
    <>
      <Card title={t('detail.rental')}>
        <Fields
          rows={[
            { label: t('fields.customer'), value: r.customer.display_name },
            {
              label: t('fields.vehicle'),
              value: [r.vehicle.plate, r.vehicle.label].filter(Boolean).join(' · '),
              onPress: can(Permission.TenantVehiclesRead)
                ? () => router.push({ pathname: '/vehicle/[uuid]', params: { uuid: r.vehicle.uuid } })
                : undefined,
            },
            { label: t('fields.product'), value: [r.product.code, r.product.name].filter(Boolean).join(' · ') },
            {
              label: t('fields.reservation'),
              value: r.reservation.reference,
              onPress: can(Permission.TenantReservationsRead)
                ? () => router.push({ pathname: '/reservations/[uuid]', params: { uuid: r.reservation.uuid } })
                : undefined,
            },
            {
              label: t('fields.total'),
              value: `${money(r.reservation.total_amount)} (${t('fields.paid')}: ${money(r.reservation.paid_amount)})`,
            },
            { label: t('fields.contract'), value: contract },
            {
              label: t('fields.created'),
              value: [formatShort(r.created_at), personName(r.created_by)].filter(Boolean).join(' · '),
            },
            { label: t('fields.checked_at'), value: r.checked_at ? formatShort(r.checked_at) : null },
            { label: t('fields.cancel_reason'), value: r.cancel_reason },
            { label: t('fields.note'), value: r.note },
            { label: t('fields.return_note'), value: r.return_note },
            { label: t('fields.damage_note'), value: r.damage_note },
          ]}
        />
      </Card>
      <Card title={t('detail.planned')}>
        <Fields
          rows={[
            { label: t('fields.pickup'), value: at(r.planned_pickup, r.planned_pickup_at) },
            { label: t('fields.return'), value: at(r.planned_return, r.planned_return_at) },
          ]}
        />
      </Card>
      {r.actual_pickup_at || r.allocation_ends_at ? (
        <Card title={t('detail.actual')}>
          <Fields
            rows={[
              {
                label: t('fields.pickup'),
                value: r.actual_pickup_at
                  ? [at(r.actual_pickup, r.actual_pickup_at), personName(r.delivered_by)].filter(Boolean).join(' · ')
                  : null,
              },
              {
                label: t('fields.return'),
                value: r.actual_return_at
                  ? [at(r.actual_return, r.actual_return_at), personName(r.returned_by)].filter(Boolean).join(' · ')
                  : null,
              },
              {
                label: t('fields.late'),
                value: r.late_minutes > 0 ? t('late_minutes', { count: r.late_minutes }) : null,
              },
              {
                label: t('fields.allocation_ends_at'),
                value: r.allocation_ends_at ? formatShort(r.allocation_ends_at) : null,
              },
            ]}
          />
        </Card>
      ) : null}
    </>
  );
}

function ChargeRow({ rental, charge, last }: { rental: Rental; charge: RentalCharge; last: boolean }) {
  const { t } = useTranslation('rentals');
  const can = useCan();
  const d = chargeDecisions(charge, {
    close: can(Permission.TenantRentalsClose),
    damage: can(Permission.TenantDamageApprove),
  });
  const tone = charge.status === 'approved' ? 'done' : charge.status === 'waived' ? 'neutral' : 'progress';
  const open = (decision: 'approve' | 'waive') =>
    router.push(`/rentals/${rental.uuid}/charges/${charge.uuid}?decision=${decision}` as Href);
  return (
    <View className={last ? 'gap-1.5 py-3' : 'gap-1.5 border-b border-border py-3'}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text variant="callout" className="flex-1 font-sans-semibold">
          {t(`charges.kinds.${charge.kind}`)}
        </Text>
        <Text variant="callout" className="font-sans-semibold tabular-nums">
          {formatMoney(charge.amount, charge.currency || 'TRY')}
        </Text>
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <StatusPill label={t(`charges.statuses.${charge.status}`)} tone={tone} />
        {charge.source === 'policy' ? (
          <StatusPill label={t('charges.policy_badge', { version: charge.settings_version })} />
        ) : null}
        {charge.disputed ? <StatusPill label={t('charges.disputed_badge')} tone="problem" /> : null}
        {charge.original_amount ? <StatusPill label={t('charges.overridden_badge')} /> : null}
      </View>
      {charge.original_amount ? (
        <Text variant="footnote" tone="muted">
          {t('charges.original_amount', { amount: formatMoney(charge.original_amount, charge.currency || 'TRY') })}
        </Text>
      ) : null}
      {charge.reason ? <Text variant="footnote">{charge.reason}</Text> : null}
      <Text variant="footnote" tone="muted">
        {[formatShort(charge.created_at), charge.created_by ? personName(charge.created_by) : t('system')].join(' · ')}
      </Text>
      {charge.decided_at ? (
        <Text variant="footnote" tone="muted">
          {[
            `${t('charges.columns.decided')}: ${formatShort(charge.decided_at)}`,
            personName(charge.decided_by),
            charge.decision_note,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {d.approve || d.waive ? (
        <View className="flex-row gap-2 pt-1">
          {d.approve ? (
            <Button
              className="flex-1"
              icon="check"
              title={t('charges.actions.approve')}
              onPress={() => open('approve')}
            />
          ) : null}
          {d.waive ? (
            <Button
              className="flex-1"
              variant="outline"
              icon="cancel"
              title={t('charges.actions.waive')}
              onPress={() => open('waive')}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Charges({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const charges = listedCharges(rental.charges);
  return (
    <Card title={t('charges.title')}>
      {charges.length ? (
        <View>
          {charges.map((c, i) => (
            <ChargeRow key={c.uuid} rental={rental} charge={c} last={i === charges.length - 1} />
          ))}
        </View>
      ) : (
        <View className="gap-1">
          <Text variant="callout" tone="muted">
            {t('charges.empty')}
          </Text>
          <Text variant="footnote" tone="muted">
            {t('charges.empty_description')}
          </Text>
        </View>
      )}
    </Card>
  );
}

function Drivers({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  return (
    <Card title={t('drivers.title')}>
      {rental.drivers.length ? (
        <View>
          {rental.drivers.map((d, i) => (
            <Field
              key={d.uuid ?? `driver-${i}`}
              label={d.role === 'primary' ? t('drivers.primary') : t('rentals_app:drivers.additional')}
              last={i === rental.drivers.length - 1}>
              {[d.name, d.licence_hint].filter(Boolean).join(' · ')}
            </Field>
          ))}
        </View>
      ) : (
        <Text variant="callout" tone="muted">
          {t('drivers.empty')}
        </Text>
      )}
    </Card>
  );
}

function reading(km: number | null, fuel: number | null) {
  return km !== null ? `${formatNumber(km)} km · %${fuel ?? '—'}` : '';
}

function Legs({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  return (
    <Card title={t('legs.title')}>
      {rental.legs.length ? (
        <View>
          {rental.legs.map((leg, i) => (
            <View
              key={leg.uuid}
              className={i === rental.legs.length - 1 ? 'gap-1 py-2' : 'gap-1 border-b border-border py-2'}>
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Text variant="callout" className="font-sans-semibold">
                  {leg.vehicle.plate}
                </Text>
                <StatusPill label={t(`legs.reasons.${leg.reason}`)} />
              </View>
              <Text variant="footnote" tone="muted">
                {leg.vehicle.label}
              </Text>
              <Text variant="footnote" className="tabular-nums">
                {`${t('rentals_app:legs.out')}: ${[
                  leg.out_at ? formatShort(leg.out_at) : '—',
                  leg.out_branch?.code ?? leg.out_branch?.name,
                  reading(leg.out_km, leg.out_fuel),
                ]
                  .filter(Boolean)
                  .join(' · ')}`}
              </Text>
              {leg.in_at ? (
                <Text variant="footnote" className="tabular-nums">
                  {`${t('rentals_app:legs.in')}: ${[
                    formatShort(leg.in_at),
                    leg.in_branch?.code ?? leg.in_branch?.name,
                    reading(leg.in_km, leg.in_fuel),
                  ]
                    .filter(Boolean)
                    .join(' · ')}`}
                </Text>
              ) : null}
              {leg.driven_km !== null ? (
                <Text variant="footnote" tone="muted">
                  {t('rentals_app:legs.driven', { km: formatNumber(leg.driven_km) })}
                </Text>
              ) : null}
              {leg.note ? <Text variant="footnote">{leg.note}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <View className="gap-1">
          <Text variant="callout" tone="muted">
            {t('legs.empty')}
          </Text>
          <Text variant="footnote" tone="muted">
            {t('legs.empty_description')}
          </Text>
        </View>
      )}
    </Card>
  );
}

function statusLabel(t: (k: string) => string, s: string | null) {
  if (!s) return '—';
  const known = ['preparation', 'active', 'return_check', 'returned', 'cancelled'];
  return known.includes(s) ? t(`statuses.${s}`) : s;
}

function EventItem({ e, last }: { e: RentalEvent; last: boolean }) {
  const { t } = useTranslation('rentals');
  const key = eventActionKey(e.action);
  const reasonKey = eventReasonKey(e.reason);
  return (
    <View className="flex-row gap-3">
      <View className="items-center">
        <View className="mt-1.5 size-2 rounded-full bg-primary" />
        {!last ? <View className="w-px flex-1 bg-border" /> : null}
      </View>
      <View className="flex-1 gap-0.5 pb-3">
        <Text variant="callout" className="font-sans-medium">
          {key ? t(key) : e.action}
        </Text>
        {e.to_status ? (
          <Text variant="footnote">{`${statusLabel(t, e.from_status)} → ${statusLabel(t, e.to_status)}`}</Text>
        ) : null}
        {e.reason ? <Text variant="footnote">{reasonKey ? t(reasonKey) : e.reason}</Text> : null}
        <Text variant="footnote" tone="muted">
          {[formatShort(e.created_at), e.actor ? personName(e.actor) : t('system')].join(' · ')}
        </Text>
      </View>
    </View>
  );
}

function Timeline({ events }: { events: ReturnType<typeof useRentalEvents> }) {
  const { t } = useTranslation('rentals');
  const items = events.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <Card title={t('events.title')}>
      {events.data ? (
        items.length ? (
          <View>
            {items.map((e, i) => (
              <EventItem key={e.uuid} e={e} last={i === items.length - 1} />
            ))}
            {events.hasNextPage ? (
              <Button
                variant="ghost"
                title={t('common:more')}
                loading={events.isFetchingNextPage}
                onPress={() => void events.fetchNextPage()}
              />
            ) : null}
          </View>
        ) : (
          <Text variant="callout" tone="muted">
            {t('events.empty')}
          </Text>
        )
      ) : (
        <Text variant="callout" tone="muted">
          {events.isError ? t('common:load_failed') : t('common:loading')}
        </Text>
      )}
    </Card>
  );
}

function Policy({ rental }: { rental: Rental }) {
  const { t } = useTranslation('rentals');
  const p = rental.policy;
  return (
    <Card title={t('policy.title')}>
      <Text variant="footnote" tone="muted">
        {t('policy.description', { version: p.settings_version })}
      </Text>
      <Fields
        rows={[
          {
            label: t('policy.grace'),
            value:
              p.late_return_grace_minutes !== null ? t('policy.minutes', { count: p.late_return_grace_minutes }) : null,
          },
          { label: t('policy.extra_hour_fee'), value: p.extra_hour_fee },
          { label: t('policy.fuel_fee_per_percent'), value: p.fuel_fee_per_percent },
          { label: t('policy.early_return'), value: p.early_return },
          { label: t('policy.extension'), value: p.extension },
          { label: t('policy.fuel'), value: p.fuel },
          { label: t('policy.mileage'), value: p.mileage },
        ]}
      />
    </Card>
  );
}
