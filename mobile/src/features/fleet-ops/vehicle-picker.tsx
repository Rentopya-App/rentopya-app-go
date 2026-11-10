import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { useDebounced } from '@/core/use-debounced';
import { cn } from '@/ui/cn';
import { Icon } from '@/ui/icon';
import { OptionSheet } from '@/ui/select';
import { Text } from '@/ui/text';

import { useVehicleBrief, useVehicleOptions } from './api';

const NONE = '__none__';

/**
 * A vehicle by plate, searched on the server (`/v1/tenant/vehicles?q=`,
 * the member's branch scope). `noneLabel` adds an empty choice ("Araç yok").
 */
export function VehiclePicker({
  label,
  value,
  onChange,
  noneLabel,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (uuid: string) => void;
  noneLabel?: string;
  error?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('fleet_ops_app');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const options = useVehicleOptions(search, open);
  const current = useVehicleBrief(value || undefined);
  const items = options.data?.items ?? [];
  const shownLabel = value ? (current.data?.plate ?? '…') : (noneLabel ?? t('vehicle_pick'));
  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Icon name="car" tone="muted-foreground" size={14} weight="medium" />
        <Text variant="footnote" tone="muted" className="font-sans-medium">
          {label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: shownLabel }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
          disabled && 'opacity-50',
        )}>
        <View className="flex-1">
          <Text numberOfLines={1} tone={value ? 'default' : 'muted'}>
            {shownLabel}
          </Text>
          {value && current.data?.label ? (
            <Text variant="footnote" tone="muted" numberOfLines={1}>
              {current.data.label}
            </Text>
          ) : null}
        </View>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}
      <OptionSheet
        visible={open}
        title={label}
        value={value || (noneLabel ? NONE : null)}
        loading={options.isFetching}
        onSearch={setQ}
        options={[
          ...(noneLabel && !search.trim() ? [{ value: NONE, label: noneLabel }] : []),
          ...items.map((v) => ({
            value: v.uuid,
            label: v.plate,
            description: [v.label, v.current_branch.name].filter(Boolean).join(' · '),
          })),
        ]}
        onClose={() => setOpen(false)}
        onPick={(v) => {
          setOpen(false);
          setQ('');
          onChange(v === NONE ? '' : v);
        }}
      />
    </View>
  );
}
