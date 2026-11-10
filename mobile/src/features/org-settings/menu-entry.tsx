import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { List, ListRow } from '@/ui/list';

import { useSettingsEntries } from './hub-screen';

/** "Firma ayarları" in the menu: shown when at least one settings page is open to the member. */
export function OrgSettingsMenuEntry() {
  const { t } = useTranslation('settings_app');
  const groups = useSettingsEntries();
  if (!groups.length) return null;
  return (
    <List>
      <ListRow
        icon="settings"
        title={t('title')}
        subtitle={t('menu_subtitle')}
        onPress={() => router.push('/settings')}
        last
      />
    </List>
  );
}
