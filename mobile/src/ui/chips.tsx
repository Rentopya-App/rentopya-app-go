import { Pressable, ScrollView } from 'react-native';

import { cn } from './cn';
import { Text } from './text';

/** Single-choice filter chips in a horizontal row. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            className={cn(
              'rounded-full border px-3.5 py-1.5',
              on ? 'border-primary bg-primary' : 'border-border bg-card',
            )}>
            <Text
              variant="footnote"
              className={cn('font-sans-semibold', on ? 'text-primary-foreground' : 'text-foreground')}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
