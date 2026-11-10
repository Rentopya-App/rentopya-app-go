import { Stack, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { Can, Permission } from '@/core/auth/permissions';
import { DEFAULT_TIME_ZONE, formatMoney, formatShort } from '@/core/format';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { reservationTone } from './today-model';
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

function Note() {
  const { t } = useTranslation('today');
  return (
    <Text variant="footnote" tone="muted" className="px-1">
      {t('detail.summary_note')}
    </Text>
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
