import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { useAccountingEntries } from '@/features/accounting/screens';
import { List, ListRow } from '@/ui/list';

/**
 * "Raporlar" (`tenant.finance.reports.read`) and "Muhasebe" (any of cari,
 * invoices, cash, suppliers, expenses or reports read) in the menu's module list.
 */
export function ReportsMenuEntry() {
  const { t } = useTranslation('reports_app');
  const can = useCan();
  const reports = can(Permission.TenantFinanceReportsRead);
  const accounting = useAccountingEntries().length > 0;
  if (!reports && !accounting) return null;
  return (
    <List>
      {reports ? (
        <ListRow
          icon="gauge"
          title={t('reports:title')}
          subtitle={t('menu_reports')}
          onPress={() => router.push('/reports')}
          last={!accounting}
        />
      ) : null}
      {accounting ? (
        <ListRow
          icon="wallet"
          title={t('accounting_title')}
          subtitle={t('menu_accounting')}
          onPress={() => router.push('/accounting')}
          last
        />
      ) : null}
    </List>
  );
}
