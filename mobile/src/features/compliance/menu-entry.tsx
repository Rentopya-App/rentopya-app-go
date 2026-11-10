import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

import { useKabisFacets, useTollFacets } from './api';
import { CountBadge } from './parts';

/**
 * "KABİS bildirimleri" (`tenant.kabis.read`) and "HGS/OGS geçişleri"
 * (`tenant.tolls.read`) in the menu's module list, with the panel's nav
 * badges: notifications that need a person, passes in the review queue.
 */
export function ComplianceMenuEntry() {
  const { t } = useTranslation('compliance_app');
  const can = useCan();
  const kabis = can(Permission.TenantKabisRead);
  const tolls = can(Permission.TenantTollsRead);
  const kabisCount = useKabisFacets(kabis).data?.needs_action;
  const tollCount = useTollFacets(tolls).data?.review;
  if (!kabis && !tolls) return null;
  return (
    <List>
      {kabis ? (
        <ListRow
          icon="security"
          title={t('kabis:title')}
          subtitle={t('kabis_subtitle')}
          onPress={() => router.push('/kabis')}
          trailing={kabisCount ? <CountBadge count={kabisCount} /> : undefined}
          last={!tolls}
        />
      ) : null}
      {tolls ? (
        <ListRow
          icon="wallet"
          title={t('tolls:title')}
          subtitle={t('tolls_subtitle')}
          onPress={() => router.push('/tolls')}
          trailing={tollCount ? <CountBadge count={tollCount} /> : undefined}
          last
        />
      ) : null}
    </List>
  );
}
