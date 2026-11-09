import type { IconName } from '@/ui/icons';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { cn } from './cn';
import { Icon } from './icon';
import { useRiseIn } from './motion';
import { Text } from './text';

/** Grouped list container (inset, rounded, hairline separators). */
export function List({ children, className }: { children: React.ReactNode; className?: string }) {
  const entering = useRiseIn();
  return (
    <Animated.View
      entering={entering}
      className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      {children}
    </Animated.View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  /** Concept icon shown at the leading side when no `leading` is passed. */
  icon?: IconName;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Last row has no separator. */
  last?: boolean;
  tone?: 'default' | 'danger';
};

export function ListRow({ title, subtitle, leading, icon, trailing, onPress, last, tone = 'default' }: RowProps) {
  const body = (
    <View className={cn('min-h-12 flex-row items-center gap-3 px-4 py-3', !last && 'border-b border-border')}>
      {leading ?? (icon ? <Icon name={icon} tone={tone === 'danger' ? 'destructive' : 'primary'} size={20} /> : null)}
      <View className="flex-1 gap-0.5">
        <Text variant="body" tone={tone === 'danger' ? 'danger' : 'default'} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="footnote" tone="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {onPress && !trailing ? <Icon name="forward" tone="muted-foreground" size={18} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} className="active:bg-muted">
      {body}
    </Pressable>
  );
}

export function SectionHeader({ title }: { title: string }) {
  return (
    <Text variant="caption" tone="muted" className="px-4 pb-1.5 pt-5">
      {title}
    </Text>
  );
}
