import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatNumber, formatPercent, formatShort } from '@/core/format';
import { Chips } from '@/ui/chips';
import { ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';

import { useVehicleActivity, useVehicleEvents, type FleetActivityEntry, type VehicleEvent } from './api';
import { statusKey } from './labels';

type Tab = 'events' | 'activity';

const actorName = (a: { name: string; surname: string; email: string } | null | undefined) =>
  a ? `${a.name} ${a.surname}`.trim() || a.email : null;

/** Status history (who, when, from → to, km, fuel, note) and the vehicle's activity, paged. */
export function VehicleHistoryScreen({ uuid }: { uuid: string }) {
  const { t, i18n } = useTranslation(['vehicles', 'vehicles_app']);
  const [tab, setTab] = useState<Tab>('events');
  const events = useVehicleEvents(uuid);
  const activity = useVehicleActivity(uuid);
  const tabs = (
    <Chips<Tab>
      options={[
        { value: 'events', label: t('tabs.history') },
        { value: 'activity', label: t('tabs.activity') },
      ]}
      value={tab}
      onChange={setTab}
    />
  );
  // The panel's activity labels; an unknown action shows as it is.
  const describe = (action: string) => {
    const key = `activity:actions.${action}`;
    return i18n.exists(key) ? t(key) : action;
  };

  return (
    <>
      <Stack.Screen options={{ title: t('vehicles_app:history_title') }} />
      {tab === 'events' ? (
        <PagedList<VehicleEvent>
          key="events"
          query={events}
          header={tabs}
          keyOf={(e) => e.uuid}
          empty={t('events.empty_title')}
          renderItem={(e, _i, last) => (
            <ListRow
              icon="history"
              title={
                e.event_type === 'created'
                  ? t('events.created')
                  : `${e.from_status ? `${t(statusKey(e.from_status))} → ` : ''}${t(statusKey(e.to_status))}`
              }
              subtitle={[
                formatShort(e.created_at),
                actorName(e.actor) ?? t('events.system_actor'),
                e.odometer_km != null ? `${formatNumber(e.odometer_km)} km` : null,
                e.fuel_level != null ? formatPercent(e.fuel_level / 100) : null,
                e.note,
              ]
                .filter(Boolean)
                .join(' · ')}
              last={last}
            />
          )}
        />
      ) : (
        <PagedList<FleetActivityEntry>
          key="activity"
          query={activity}
          header={tabs}
          keyOf={(e) => e.uuid}
          empty={t('activity.empty')}
          renderItem={(e, _i, last) => (
            <ListRow
              icon="info"
              title={describe(e.action)}
              subtitle={`${formatShort(e.created_at)} · ${actorName(e.actor) ?? t('events.system_actor')}`}
              last={last}
            />
          )}
        />
      )}
    </>
  );
}
