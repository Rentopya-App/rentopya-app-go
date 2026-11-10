import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, appLocale, formatDay } from '@/core/format';

import { Button } from './button';
import { cn } from './cn';
import { Icon } from './icon';
import type { IconName } from './icons';
import { Text } from './text';

/** `YYYY-MM` of a `YYYY-MM-DD` day. */
function monthOf(day: string) {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/** Days of a month grid, Monday first; nulls pad the first week. */
function monthGrid(month: string) {
  const first = `${month}-01`;
  const weekday = (new Date(`${first}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: weekday }, () => null);
  for (let day = first; monthOf(day) === month; day = addDays(day, 1)) cells.push(day);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * Any calendar day (past or future), never a native picker: a row with the
 * chosen day that opens a month sheet. `min` / `max` grey out days the API
 * would refuse; `onClear` adds an "empty" choice for optional dates.
 */
export function DateField({
  label,
  value,
  onChange,
  onClear,
  min,
  max,
  placeholder,
  icon = 'calendar',
  error,
  hint,
  disabled,
}: {
  label: string;
  value: string | null | undefined;
  onChange: (day: string) => void;
  onClear?: () => void;
  min?: string;
  max?: string;
  placeholder?: string;
  icon?: IconName;
  error?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthOf(value ?? max ?? new Date().toISOString().slice(0, 10)));
  const locale = appLocale();
  const monthTitle = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 1 + i, 12)),
    ),
  );
  const cells = monthGrid(month);
  const out = (day: string) => (min && day < min) || (max && day > max);

  return (
    <View className="gap-1.5">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} tone="muted-foreground" size={14} weight="medium" />
        <Text variant="footnote" tone="muted" className="font-sans-medium">
          {label}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityValue={{ text: value ? formatDay(value) : undefined }}
        disabled={disabled}
        onPress={() => {
          setMonth(monthOf(value ?? max ?? new Date().toISOString().slice(0, 10)));
          setOpen(true);
        }}
        className={cn(
          'min-h-[52px] flex-row items-center gap-2 rounded-lg border bg-card px-4 active:opacity-80',
          error ? 'border-destructive' : 'border-border',
          disabled && 'opacity-50',
        )}>
        <Text className="flex-1" numberOfLines={1} tone={value ? 'default' : 'muted'}>
          {value ? formatDay(value) : (placeholder ?? '')}
        </Text>
        <Icon name="chevronDown" tone="muted-foreground" size={18} />
      </Pressable>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="footnote" tone="muted">
          {hint}
        </Text>
      ) : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <View className="flex-1 gap-4 bg-background px-4" style={{ paddingBottom: insets.bottom + 12 }}>
          <View className="flex-row items-center gap-3 border-b border-border py-3">
            <Text variant="headline" className="flex-1" numberOfLines={1}>
              {label}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={() => setOpen(false)}>
              <Icon name="close" tone="muted-foreground" size={22} />
            </Pressable>
          </View>
          <View className="flex-row items-center">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('back')}
              hitSlop={10}
              onPress={() => setMonth((m) => shiftMonth(m, -1))}
              className="size-11 items-center justify-center">
              <Icon name="back" tone="primary" size={22} />
            </Pressable>
            <Text variant="headline" className="flex-1 text-center">
              {monthTitle}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('next')}
              hitSlop={10}
              onPress={() => setMonth((m) => shiftMonth(m, 1))}
              className="size-11 items-center justify-center">
              <Icon name="forward" tone="primary" size={22} />
            </Pressable>
          </View>
          <View className="flex-row">
            {weekdays.map((w, i) => (
              <Text key={i} variant="footnote" tone="muted" className="flex-1 text-center">
                {w}
              </Text>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {cells.map((day, i) => {
              if (!day) return <View key={`pad-${i}`} className="aspect-square w-[14.28%]" />;
              const on = day === value;
              const blocked = !!out(day);
              return (
                <View key={day} className="aspect-square w-[14.28%] p-0.5">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={formatDay(day)}
                    accessibilityState={{ selected: on, disabled: blocked }}
                    disabled={blocked}
                    onPress={() => {
                      onChange(day);
                      setOpen(false);
                    }}
                    className={cn(
                      'flex-1 items-center justify-center rounded-full',
                      on ? 'bg-primary' : 'active:bg-muted',
                      blocked && 'opacity-30',
                    )}>
                    <Text tone={on ? 'onPrimary' : 'default'} className={on ? 'font-sans-semibold' : undefined}>
                      {Number(day.slice(8))}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <View className="mt-auto gap-2">
            {onClear && value ? (
              <Button
                icon="close"
                title={t('clear_date')}
                variant="outline"
                onPress={() => {
                  onClear();
                  setOpen(false);
                }}
              />
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}
