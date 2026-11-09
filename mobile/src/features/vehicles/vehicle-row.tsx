import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { formatNumber } from '@/core/format';
import { cn } from '@/ui/cn';
import { Icon } from '@/ui/icon';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import type { Vehicle } from './api';
import { STATUS_TONE, statusKey } from './labels';

/** The plate as on the car: monospaced-looking block with the "TR" band. */
export function PlateBadge({ plate, large }: { plate: string; large?: boolean }) {
  return (
    <View className="flex-row items-stretch self-start overflow-hidden rounded-md border border-border bg-card">
      <View className="justify-center bg-primary px-1.5">
        <Text variant="caption" tone="onPrimary" className="font-sans-bold">
          TR
        </Text>
      </View>
      <Text
        variant={large ? 'title' : 'headline'}
        className="px-2 py-0.5 font-sans-bold tracking-wider tabular-nums"
        numberOfLines={1}>
        {plate}
      </Text>
    </View>
  );
}

/** One vehicle in the list: plate, make / model, status, where it is and its km. */
export function VehicleRow({ vehicle, onPress, last }: { vehicle: Vehicle; onPress: () => void; last?: boolean }) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${vehicle.plate}, ${t(statusKey(vehicle.status))}`}
      onPress={onPress}
      className={cn('gap-2 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-3">
        <PlateBadge plate={vehicle.plate} />
        <View className="flex-1" />
        <StatusPill label={t(statusKey(vehicle.status))} tone={STATUS_TONE[vehicle.status]} />
      </View>
      <Text variant="callout" numberOfLines={1}>
        {vehicle.label || [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '—'} · {vehicle.model_year}
      </Text>
      <View className="flex-row items-center gap-3">
        <View className="flex-1 flex-row items-center gap-1">
          <Icon name="location" tone="muted-foreground" size={14} />
          <Text variant="footnote" tone="muted" numberOfLines={1} className="flex-1">
            {vehicle.current_branch.name}
          </Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Icon name="gauge" tone="muted-foreground" size={14} />
          <Text variant="footnote" tone="muted" className="tabular-nums">
            {formatNumber(vehicle.odometer_km)} km
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
