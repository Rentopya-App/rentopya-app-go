import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

import { SECTIONS } from './lib';

/** "Yapılandırma" in the menu's module list, shown when any of its sections is permitted. */
export function ConfigMenuEntry() {
  const { t } = useTranslation('config_app');
  const can = useCan();
  if (!SECTIONS.some((s) => can(s.perm))) return null;
  return (
    <List>
      <ListRow
        icon="settings"
        title={t('title')}
        subtitle={t('menu_subtitle')}
        onPress={() => router.push('/config')}
        last
      />
    </List>
  );
}
