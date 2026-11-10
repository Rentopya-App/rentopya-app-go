import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import { type Customer, useCustomerList } from './api';
import { consentKey, CUSTOMER_TYPES, typeKey } from './lib';

const ALL = '__all__';

/** One customer: name, type, masked identity and phone, consents and drivers. */
export function CustomerRow({ customer, onPress, last }: { customer: Customer; onPress: () => void; last?: boolean }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const corporate = customer.customer_type === 'corporate';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${customer.display_name}, ${t(typeKey(customer.customer_type))}`}
      onPress={onPress}
      className={cn('gap-1.5 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-2">
        <Icon name={corporate ? 'building' : 'user'} tone="primary" size={18} />
        <Text variant="headline" className="flex-1" numberOfLines={1}>
          {customer.anonymized ? t('anonymized_badge') : customer.display_name}
        </Text>
        <StatusPill label={t(typeKey(customer.customer_type))} />
      </View>
      <Text variant="footnote" tone="muted" numberOfLines={1} className="tabular-nums">
        {[customer.identity_masked, customer.phone_masked, customer.email_masked].filter(Boolean).join(' · ') || '—'}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[
          customer.consent_channels.length
            ? customer.consent_channels.map((c) => t(consentKey(c))).join(', ')
            : t(consentKey('none')),
          t('header.drivers', { count: customer.drivers_count }),
          customer.tags.length ? customer.tags.join(', ') : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Pressable>
  );
}

/**
 * "Müşteriler": the panel's customer list for the phone. Search by name,
 * title, the full identity number, phone or e-mail (the API matches the
 * encrypted values); filter by type. Values stay masked.
 */
export function CustomersScreen() {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string>(ALL);
  const search = useDebounced(q);
  const readable = can(Permission.TenantCustomersRead);
  const query = useCustomerList({ q: search, type: type === ALL ? null : type });
  const filtered = !!search.trim() || type !== ALL;

  const header = (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder={t('customers_app:search_placeholder')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...CUSTOMER_TYPES.map((c) => ({ value: c, label: t(typeKey(c)) })),
        ]}
        value={type}
        onChange={setType}
      />
    </>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () =>
            readable && can(Permission.TenantCustomersWrite) ? (
              <HeaderButton
                icon="add"
                label={t('actions.create')}
                onPress={() => router.push('/customers/new' as Href)}
              />
            ) : null,
        }}
      />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(c) => c.uuid}
          empty={filtered ? t('empty_filtered_title') : t('empty_title')}
          renderItem={(c, _i, last) => (
            <CustomerRow customer={c} last={last} onPress={() => router.push(`/customers/${c.uuid}` as Href)} />
          )}
        />
      ) : (
        <EmptyState icon="security" title={t('forbidden')} />
      )}
    </>
  );
}
