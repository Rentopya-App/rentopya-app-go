import * as Haptics from 'expo-haptics';
import { Pressable, Switch, View } from 'react-native';

import { cn } from './cn';
import { Icon } from './icon';
import { Input } from './input';
import { Text } from './text';

/** Multi-line text box (notes); grows to six lines, then scrolls. */
export function TextArea(props: React.ComponentProps<typeof Input>) {
  return <Input multiline textAlignVertical="top" className="min-h-[96px] py-3" {...props} />;
}

/** Whole number with − / + (guests, quantity). */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const step = (d: number) => {
    const next = Math.min(max, Math.max(min, value + d));
    if (next !== value) {
      void Haptics.selectionAsync();
      onChange(next);
    }
  };
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 rounded-lg border border-border bg-card px-4">
      <Text className="flex-1">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} −`}
        disabled={value <= min}
        onPress={() => step(-1)}
        className={cn('size-9 items-center justify-center rounded-full bg-secondary', value <= min && 'opacity-40')}>
        <Icon name="remove" tone="primary" size={18} />
      </Pressable>
      <Text variant="headline" className="w-8 text-center tabular-nums" accessibilityLiveRegion="polite">
        {value}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} +`}
        disabled={value >= max}
        onPress={() => step(1)}
        className={cn('size-9 items-center justify-center rounded-full bg-secondary', value >= max && 'opacity-40')}>
        <Icon name="add" tone="primary" size={18} />
      </Pressable>
    </View>
  );
}

/** On / off row (consents, flags). */
export function SwitchRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View className="min-h-[52px] flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-2">
      <View className="flex-1 gap-0.5">
        <Text>{label}</Text>
        {description ? (
          <Text variant="footnote" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={label} />
    </View>
  );
}

/** Small caption above a group of fields. */
export function FieldGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      {title ? (
        <Text variant="caption" tone="muted" className="px-1">
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}
