import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import { PagedList } from '@/ui/paged-list';
import { SearchField } from '@/ui/search-field';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';

import { useCollections } from './api';
import { COLLECTION_METHODS, COLLECTION_STATUSES, collectionStatusKey, methodKey } from './model';
import { CollectionRow, Forbidden } from './parts';

const ALL = '__all__';

/**
 * "Tahsilatlar" (`tenant.finance.accounts.read`): every collection the member
 * may see, newest first. Search by number, payer or reference; method and
 * state filters; the menu's branch filter narrows it to that branch.
 */
export function CollectionsScreen() {
  const { t } = useTranslation(['finance_app', 'finance']);
  const can = useCan();
  const readable = can(Permission.TenantFinanceAccountsRead);
  const branch = useSelectedBranch();
  const [q, setQ] = useState('');
  const [method, setMethod] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const search = useDebounced(q);
  const query = useCollections(
    {
      q: search,
      method: method === ALL ? null : method,
      status: status === ALL ? null : status,
      branch: branch.branchUuid,
    },
    readable,
  );
  const filtered = !!search.trim() || method !== ALL || status !== ALL;

  const header = (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder={t('collections_search')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...COLLECTION_METHODS.map((m) => ({ value: m, label: t(methodKey(m)) })),
        ]}
        value={method}
        onChange={setMethod}
      />
      <Select
        label={t('finance:columns.status')}
        value={status}
        options={[
          { value: ALL, label: t('common:all') },
          ...COLLECTION_STATUSES.map((s) => ({ value: s, label: t(collectionStatusKey(s)) })),
        ]}
        onChange={setStatus}
      />
      {branch.branch ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('branch_filter', { name: branch.branch.name })}
        </Text>
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('finance:collections.title') }} />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(c) => c.uuid}
          empty={filtered ? t('finance:collections.empty_filtered') : t('finance:collections.empty')}
          renderItem={(c, _i, last) => (
            <CollectionRow c={c} last={last} onPress={() => router.push(`/finance/collections/${c.uuid}`)} />
          )}
        />
      ) : (
        <Forbidden body={t('finance:forbidden')} />
      )}
    </>
  );
}
