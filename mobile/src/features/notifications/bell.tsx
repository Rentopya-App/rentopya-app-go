import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { HeaderButton } from '@/ui/header-button';
import { ListRow } from '@/ui/list';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { useUnreadCount } from './api';
import { badgeLabel } from './grouping';

/** Header bell with the unread count; hidden without `notifications.read`. */
export function NotificationBell() {
  const { t } = useTranslation('notifications');
  const can = useCan();
  const unread = useUnreadCount();
  if (!can(Permission.NotificationsRead)) return null;
  const badge = badgeLabel(unread.data);
  return (
    <View>
      <HeaderButton
        icon="bell"
        label={badge ? t('bell_unread', { count: unread.data ?? 0 }) : t('title')}
        onPress={() => router.push('/notifications')}
      />
      {badge ? (
        <View
          pointerEvents="none"
          className="absolute -top-1 right-0 min-w-[18px] items-center rounded-full bg-destructive px-1">
          <Text className="font-sans-bold text-[11px] leading-[16px] text-primary-foreground">{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Menu entry of the notification center with the unread count. */
export function NotificationCenterRow({ last }: { last?: boolean }) {
  const { t } = useTranslation('notifications');
  const can = useCan();
  const unread = useUnreadCount();
  if (!can(Permission.NotificationsRead)) return null;
  const badge = badgeLabel(unread.data);
  return (
    <ListRow
      icon="bell"
      title={t('title')}
      subtitle={badge ? t('menu_unread', { count: unread.data ?? 0 }) : t('menu_none')}
      trailing={badge ? <StatusPill label={badge} tone="progress" /> : undefined}
      onPress={() => router.push('/notifications')}
      last={last}
    />
  );
}
