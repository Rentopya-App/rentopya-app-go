import * as Haptics from 'expo-haptics';
import { Pressable } from 'react-native';

import { Icon } from './icon';
import type { IconName } from './icons';

/** Icon action in a native header (`headerRight`): 44 pt target, read by screen readers. */
export function HeaderButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPressIn={() => void Haptics.selectionAsync()}
      onPress={onPress}
      className="size-9 items-center justify-center active:opacity-60">
      <Icon name={icon} tone="primary" size={22} weight="medium" />
    </Pressable>
  );
}
