import { Pressable, ScrollView } from 'react-native';

import { dayTimes } from '@/core/zoned';

import { cn } from './cn';
import { Text } from './text';

/** Times of day in a horizontal row (no native time picker). */
export function TimeStrip({
  value,
  onChange,
  times = dayTimes(),
}: {
  value: string;
  onChange: (t: string) => void;
  times?: string[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-1">
      {times.map((t) => {
        const on = t === value;
        return (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(t)}
            className={cn(
              'rounded-md border px-3.5 py-2.5',
              on ? 'border-primary bg-primary' : 'border-border bg-card',
            )}>
            <Text
              variant="callout"
              className={cn('font-sans-semibold tabular-nums', on ? 'text-primary-foreground' : 'text-foreground')}>
              {t}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
