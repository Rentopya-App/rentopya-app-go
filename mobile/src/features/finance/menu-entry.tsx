import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow } from '@/ui/list';

/**
 * "Finans" in the menu's module list: shown with any of the permissions of
 * its screens (collections, payments, deposits).
 */
export function FinanceMenuEntry() {
  const { t } = useTranslation('finance_app');
  const can = useCan();
  if (!can(Permission.TenantFinanceAccountsRead, Permission.TenantPaymentsRead, Permission.TenantFinanceDepositsRead))
    return null;
  return (
    <List>
      <ListRow
        icon="wallet"
        title={t('title')}
        subtitle={t('menu_subtitle')}
        onPress={() => router.push('/finance')}
        last
      />
    </List>
  );
}
