import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { Image, Pressable, View } from 'react-native';

import { cn } from '@/ui/cn';
import { Icon } from '@/ui/icon';
import type { IconName } from '@/ui/icons';
import { Text } from '@/ui/text';

/** Checkbox row of the panel's `CheckRow`: a big target, the state as an icon and text. */
export function CheckRow({
  label,
  value,
  onChange,
  disabled,
  hint,
  hintTone = 'muted',
  missing,
}: {
  label: string;
  /** true = checked, false = answered "no" (shown crossed when `missing`), undefined = not answered. */
  value: boolean | undefined;
  onChange: () => void;
  disabled?: boolean;
  hint?: string;
  hintTone?: 'muted' | 'danger';
  /** A false value is shown as missing (equipment) rather than unchecked. */
  missing?: boolean;
}) {
  const on = value === true;
  const off = value === false && missing;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPressIn={() => void Haptics.selectionAsync()}
      onPress={onChange}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-2 active:opacity-80',
        disabled && 'opacity-60',
      )}>
      <View
        className={cn(
          'size-6 items-center justify-center rounded-md border-2',
          on ? 'border-primary bg-primary' : off ? 'border-destructive bg-destructive' : 'border-border',
        )}>
        {on ? <Icon name="check" tone="primary-foreground" size={16} /> : null}
        {off ? <Icon name="close" tone="primary-foreground" size={16} /> : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text>{label}</Text>
        {hint ? (
          <Text variant="footnote" tone={hintTone === 'danger' ? 'danger' : 'muted'}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Label / value pairs in a card (the panel's EntityDetail). */
export function Facts({ rows }: { rows: { label: string; value: ReactNode; tone?: 'danger' }[] }) {
  return (
    <View className="gap-2.5">
      {rows.map((r) => (
        <View key={r.label} className="flex-row items-start justify-between gap-3">
          <Text variant="callout" tone="muted" className="flex-1">
            {r.label}
          </Text>
          {typeof r.value === 'string' || typeof r.value === 'number' ? (
            <Text
              variant="callout"
              tone={r.tone === 'danger' ? 'danger' : 'default'}
              className="max-w-[60%] text-right font-sans-medium tabular-nums">
              {r.value}
            </Text>
          ) : (
            r.value
          )}
        </View>
      ))}
    </View>
  );
}

const NOTICE = {
  info: { box: 'border-border bg-secondary', icon: 'info' as IconName, tone: 'primary' as const },
  warning: { box: 'border-warning/40 bg-warning/10', icon: 'error' as IconName, tone: 'warning' as const },
  danger: { box: 'border-destructive/40 bg-destructive/10', icon: 'error' as IconName, tone: 'destructive' as const },
  success: { box: 'border-success/40 bg-success/10', icon: 'check' as IconName, tone: 'success' as const },
};

/** Alert box (the panel's `Alert`). */
export function Notice({
  tone = 'info',
  title,
  body,
  icon,
  children,
}: {
  tone?: keyof typeof NOTICE;
  title?: string;
  body?: string;
  icon?: IconName;
  children?: ReactNode;
}) {
  const n = NOTICE[tone];
  return (
    <View
      accessibilityRole="alert"
      className={cn('flex-row gap-3 rounded-lg border p-3', n.box)}
      style={{ borderCurve: 'continuous' }}>
      <Icon name={icon ?? n.icon} tone={n.tone} size={18} />
      <View className="flex-1 gap-1">
        {title ? <Text className="font-sans-semibold">{title}</Text> : null}
        {body ? (
          <Text variant="footnote" tone="muted">
            {body}
          </Text>
        ) : null}
        {children}
      </View>
    </View>
  );
}

/** A photo from an API media link or a local capture; a placeholder while there is none. */
export function PhotoThumb({
  uri,
  label,
  contain,
  className,
}: {
  uri: string | null | undefined;
  label: string;
  contain?: boolean;
  className?: string;
}) {
  return (
    <View
      className={cn('aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md bg-muted', className)}
      accessibilityLabel={label}>
      {uri ? (
        <Image
          source={{ uri }}
          accessibilityIgnoresInvertColors
          resizeMode={contain ? 'contain' : 'cover'}
          style={{ width: '100%', height: '100%' }}
        />
      ) : (
        <Icon name="camera" tone="muted-foreground" size={26} />
      )}
    </View>
  );
}
