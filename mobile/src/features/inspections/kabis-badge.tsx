import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { StatusPill, type StatusTone } from '@/ui/status-pill';

import { useRentalKabis, type KabisNotification } from './api';

const OFFICIAL: KabisNotification['status'][] = ['succeeded', 'reported_manually', 'reconciled'];

function toneOf(n: KabisNotification): StatusTone {
  if (OFFICIAL.includes(n.status)) return 'done';
  if (n.needs_action) return 'problem';
  return 'progress';
}

/**
 * KABİS state of the rental (the panel's rental chip): the start (its latest
 * correction when there is one) and the end. Nothing before the handover, and
 * nothing without `tenant.kabis.read`.
 */
export function KabisBadge({ rentalUuid }: { rentalUuid: string }) {
  const { t } = useTranslation('inspections');
  const query = useRentalKabis(rentalUuid);
  const items = query.data?.items ?? [];
  if (!items.length) return null;
  const start = [...items]
    .filter((n) => n.event !== 'rental_end')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .pop();
  const end = items.find((n) => n.event === 'rental_end');
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {start ? (
        <StatusPill label={t('kabis.start', { status: t(`kabis.status_${start.status}`) })} tone={toneOf(start)} />
      ) : null}
      {end ? <StatusPill label={t('kabis.end', { status: t(`kabis.status_${end.status}`) })} tone={toneOf(end)} /> : null}
    </View>
  );
}
