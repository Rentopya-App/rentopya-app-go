import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Button } from './button';
import { Icon } from './icon';
import { useRiseIn } from './motion';
import { Text } from './text';
import type { IconName } from '@/ui/icons';

/** Says what will appear here and how to add the first one. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  /** Call to action under the message (retry, add the first one). */
  action?: { title: string; onPress: () => void; icon?: IconName };
}) {
  const entering = useRiseIn();
  return (
    <Animated.View entering={entering} className="items-center gap-3 px-8 py-12">
      <View className="size-14 items-center justify-center rounded-xl bg-secondary">
        <Icon name={icon} tone="primary" size={26} />
      </View>
      <Text variant="headline" className="text-center">
        {title}
      </Text>
      {body ? (
        <Text variant="callout" tone="muted" className="text-center">
          {body}
        </Text>
      ) : null}
      {action ? <Button icon={action.icon} title={action.title} onPress={action.onPress} className="mt-2" /> : null}
    </Animated.View>
  );
}
