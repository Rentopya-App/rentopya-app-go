import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';

import { addDays, appLocale } from '@/core/format';

import { cn } from './cn';
import { Text } from './text';

/** Next `days` calendar days as tappable cards (pick-up day, report day). */
export function DateStrip({
  value,
  onChange,
  start,
  days = 30,
}: {
  value: string;
  onChange: (day: string) => void;
  /** First day shown (`YYYY-MM-DD`). */
  start: string;
  days?: number;
}) {
  useTranslation(); // re-render on a language change
  const locale = appLocale();
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  const list = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1">
      {list.map((day) => {
        const d = new Date(`${day}T12:00:00Z`);
        const on = day === value;
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(day)}
            className={cn(
              'w-16 items-center gap-0.5 rounded-lg border py-2',
              on ? 'border-primary bg-primary' : 'border-border bg-card',
            )}>
            <Text variant="footnote" className={on ? 'text-primary-foreground' : 'text-muted-foreground'}>
              {weekday.format(d)}
            </Text>
            <Text variant="headline" className={cn('tabular-nums', on ? 'text-primary-foreground' : 'text-foreground')}>
              {d.getUTCDate()}
            </Text>
            <Text variant="footnote" className={on ? 'text-primary-foreground' : 'text-muted-foreground'}>
              {month.format(d)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Free starts as a wrap of time buttons. */
export function SlotGrid({
  slots,
  value,
  onChange,
  label,
}: {
  slots: { key: string; label: string; hint?: string }[];
  value: string | null;
  onChange: (key: string) => void;
  label: (s: { label: string; hint?: string }) => string;
}) {
  return (
    <ScrollView scrollEnabled={false} contentContainerClassName="flex-row flex-wrap gap-2">
      {slots.map((s) => {
        const on = s.key === value;
        return (
          <Pressable
            key={s.key}
            accessibilityRole="button"
            accessibilityLabel={label(s)}
            accessibilityState={{ selected: on }}
            onPress={() => onChange(s.key)}
            className={cn(
              'min-w-[76px] items-center rounded-md border px-3 py-2.5',
              on ? 'border-primary bg-primary' : 'border-border bg-card',
            )}>
            <Text
              variant="callout"
              className={cn('font-sans-semibold tabular-nums', on ? 'text-primary-foreground' : 'text-foreground')}>
              {s.label}
            </Text>
            {s.hint ? (
              <Text
                variant="caption"
                numberOfLines={1}
                className={on ? 'text-primary-foreground' : 'text-muted-foreground'}>
                {s.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
