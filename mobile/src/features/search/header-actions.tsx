import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { NotificationBell } from '@/features/notifications/bell';
import { HeaderButton } from '@/ui/header-button';

/** "Bugün" header: search and the notification bell. */
export function TodayHeaderActions() {
  const { t } = useTranslation('search');
  return (
    <View className="flex-row items-center gap-2">
      <HeaderButton icon="search" label={t('title')} onPress={() => router.push('/search')} />
      <NotificationBell />
    </View>
  );
}
