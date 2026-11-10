import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatMoney, formatShort } from '@/core/format';
import { Icon } from '@/ui/icon';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import {
  KABIS_OFFICIAL,
  KABIS_TONES,
  kabisEventText,
  stationText,
  TOLL_TONES,
  type KabisNotification,
  type KabisStatus,
  type TollPass,
  type TollStatus,
} from './lib';

export function KabisStatusChip({ status }: { status: KabisStatus }) {
  const { t } = useTranslation('kabis');
  return <StatusPill label={t(`statuses.${status}`)} tone={KABIS_TONES[status]} />;
}

/** "Resmi bildirim" / "Resmi bildirim değil": a local record never reads as reported. */
export function OfficialChip({ status }: { status: KabisStatus }) {
  const { t } = useTranslation('kabis');
  const official = KABIS_OFFICIAL.includes(status);
  return <StatusPill label={official ? t('official') : t('not_official')} tone={official ? 'done' : 'neutral'} />;
}

export function TollStatusChip({ status }: { status: TollStatus }) {
  const { t } = useTranslation('tolls');
  return <StatusPill label={t(`statuses.${status}`)} tone={TOLL_TONES[status]} />;
}

/** Count bubble at the end of a menu / hub row. */
export function CountBadge({ count }: { count?: number }) {
  if (!count) return null;
  return (
    <View className="min-w-6 items-center rounded-full bg-primary px-2 py-0.5">
      <Text variant="footnote" className="font-sans-semibold text-primary-foreground tabular-nums">
        {String(count)}
      </Text>
    </View>
  );
}

function Row({ onPress, children }: { onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <View className="flex-1 gap-1">{children}</View>
      <Icon name="forward" tone="muted-foreground" size={18} />
    </Pressable>
  );
}

/** One notification: event and rental, state, plate · branch · event time, the last error. */
export function KabisRow({ item }: { item: KabisNotification }) {
  const { t } = useTranslation('kabis');
  return (
    <Row onPress={() => router.push({ pathname: '/kabis/[uuid]', params: { uuid: item.uuid } })}>
      <Text variant="callout" className="font-sans-semibold" numberOfLines={1}>
        {`${kabisEventText(t, item.event, item.sequence)} · ${item.rental.reference ?? ''}`}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        <KabisStatusChip status={item.status} />
      </View>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[formatShort(item.occurred_at), item.plate, item.branch.name].filter(Boolean).join(' · ')}
      </Text>
      {item.last_error ? (
        <Text variant="footnote" tone="danger" numberOfLines={2}>
          {item.last_error}
        </Text>
      ) : null}
    </Row>
  );
}

/** One pass: station and amount, state and review reason, time · plate · rental. */
export function TollRow({ item }: { item: TollPass }) {
  const { t } = useTranslation('tolls');
  return (
    <Row onPress={() => router.push({ pathname: '/tolls/[uuid]', params: { uuid: item.uuid } })}>
      <View className="flex-row items-center gap-2">
        <Text variant="callout" className="flex-1 font-sans-semibold" numberOfLines={1}>
          {stationText(item) || item.external_id}
        </Text>
        <Text variant="callout" className="font-sans-semibold tabular-nums">
          {formatMoney(item.amount, item.currency || 'TRY')}
        </Text>
      </View>
      <View className="flex-row flex-wrap gap-1.5">
        <TollStatusChip status={item.status} />
        {item.review_reason ? <StatusPill label={t(`review_reasons.${item.review_reason}`)} /> : null}
      </View>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[formatShort(item.passed_at), item.plate || item.tag_number, item.rental?.reference ?? t('no_rental_yet')]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Row>
  );
}
