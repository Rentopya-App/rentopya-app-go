import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn } from './cn';
import { useRiseIn } from './motion';
import { Text } from './text';

/** Section card: optional caption title, then content. Rises in with the screen's other sections. */
export function Card({
  title,
  children,
  className,
  onPress,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  onPress?: () => void;
}) {
  const entering = useRiseIn();
  const body = (
    <Animated.View
      entering={onPress ? undefined : entering}
      className={cn('gap-3 rounded-lg border border-border bg-card p-4', className)}
      style={{ borderCurve: 'continuous' }}>
      {title ? (
        <Text variant="caption" tone="muted">
          {title}
        </Text>
      ) : null}
      {children}
    </Animated.View>
  );
  if (!onPress) return body;
  return (
    <Animated.View entering={entering}>
      <Pressable accessibilityRole="button" onPress={onPress} className="active:opacity-80">
        {body}
      </Pressable>
    </Animated.View>
  );
}

/** Label + big figure, used in rows of two or three. */
export function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'default' | 'primary' | 'success';
}) {
  return (
    <View className="min-w-0 flex-1 gap-1">
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" tone={tone} numberOfLines={1} adjustsFontSizeToFit className="tabular-nums">
        {value}
      </Text>
    </View>
  );
}
