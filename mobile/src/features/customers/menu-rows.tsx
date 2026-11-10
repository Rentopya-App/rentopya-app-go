import { router, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { List, ListRow, SectionHeader } from '@/ui/list';

/** Menu entries of the customer area: customers and corporate agreements, each behind its read permission. */
export function CustomersMenuRows() {
  const { t } = useTranslation(['customers_app']);
  const can = useCan();
  const customers = can(Permission.TenantCustomersRead);
  const agreements = can(Permission.TenantAgreementsRead);
  if (!customers && !agreements) return null;
  return (
    <View>
      <SectionHeader title={t('menu_section')} />
      <List>
        {customers ? (
          <ListRow
            icon="customers"
            title={t('customers:title')}
            subtitle={t('menu_customers_hint')}
            onPress={() => router.push('/customers' as Href)}
            last={!agreements}
          />
        ) : null}
        {agreements ? (
          <ListRow
            icon="document"
            title={t('agreements:title')}
            subtitle={t('menu_agreements_hint')}
            onPress={() => router.push('/agreements' as Href)}
            last
          />
        ) : null}
      </List>
    </View>
  );
}
