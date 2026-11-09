import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { addDays, formatDay, localDate } from '@/core/format';

import { Button, IconButton } from './button';
import { Text } from './text';

/** Previous / next day around a day heading, with a jump back to today. */
export function DayNav({ day, onChange, max }: { day: string; onChange: (d: string) => void; max?: string }) {
  const { t } = useTranslation();
  const today = localDate(new Date());
  const label =
    day === today
      ? t('today')
      : day === addDays(today, 1)
        ? t('tomorrow')
        : day === addDays(today, -1)
          ? t('yesterday')
          : null;
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <IconButton icon="back" label={t('common:previous_day')} onPress={() => onChange(addDays(day, -1))} />
        <View className="flex-1 items-center">
          <Text variant="headline">{formatDay(day)}</Text>
          {label ? (
            <Text variant="footnote" tone="muted">
              {label}
            </Text>
          ) : null}
        </View>
        {max && day >= max ? (
          <View className="size-11" />
        ) : (
          <IconButton icon="forward" label={t('common:next_day')} onPress={() => onChange(addDays(day, 1))} />
        )}
      </View>
      {day !== today ? (
        <Button icon="calendar" title={t('today')} variant="ghost" onPress={() => onChange(today)} />
      ) : null}
    </View>
  );
}
