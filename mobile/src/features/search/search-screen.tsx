import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { api, orgHeader, unwrap } from '@/core/api/client';
import { useSession } from '@/core/auth/session';
import { useDebounced } from '@/core/use-debounced';
import { openPanelLink } from '@/features/notifications/open-link';
import { panelTarget } from '@/features/notifications/links';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import type { IconName } from '@/ui/icons';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';

import { groupHits, searchable, specKey } from './lib';

/** Spec icon names of the API (`SearchSpec.icon`) → app icons. */
const SPEC_ICON: Record<string, IconName> = {
  vehicles: 'car',
  customers: 'customer',
  branches: 'building',
  suppliers: 'wallet',
  rental_products: 'car',
  products: 'car',
};

/**
 * Company panel search (the panel's Cmd+K, `/v1/tenant/search`): results
 * grouped by type in the order of `/v1/tenant/search/specs` (only the types
 * the member may read). A hit opens the app's screen (rental, reservation,
 * field task, vehicle) or the panel page ("panelde aç").
 */
export function SearchScreen() {
  const { t } = useTranslation('search');
  const org = useSession((s) => s.organization);
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 250);
  const specs = useQuery({
    queryKey: ['search', org?.slug, 'specs'],
    enabled: !!org,
    staleTime: 5 * 60_000,
    queryFn: () => unwrap(api.GET('/v1/tenant/search/specs', { params: { header: orgHeader() } })),
  });
  const enabled = specs.data?.enabled !== false;
  const hits = useQuery({
    queryKey: ['search', org?.slug, 'hits', term],
    enabled: !!org && enabled && searchable(term),
    queryFn: () =>
      unwrap(api.GET('/v1/tenant/search', { params: { header: orgHeader(), query: { q: term, limit: 30 } } })),
  });

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        <SearchField value={q} onChangeText={setQ} placeholder={t('placeholder')} autoFocus />
        {specs.data && !enabled ? (
          <EmptyState icon="search" title={t('disabled_title')} body={t('disabled_body')} />
        ) : !searchable(term) ? (
          <EmptyState icon="search" title={t('hint_title')} body={t('hint_body')} />
        ) : (
          <QueryState query={hits} rows={3}>
            {(data) => {
              const groups = groupHits(data.items ?? [], specs.data?.items);
              if (!groups.length) return <EmptyState icon="search" title={t('common:no_results')} />;
              return (
                <>
                  {groups.map((g) => (
                    <View key={g.spec}>
                      <SectionHeader title={t(specKey(g.labelKey, g.spec), { defaultValue: g.spec })} />
                      <List>
                        {g.hits.map((h, i) => {
                          const own = !!panelTarget(h.href)?.route;
                          return (
                            <ListRow
                              key={`${h.spec}-${h.id}`}
                              icon={SPEC_ICON[g.icon ?? ''] ?? SPEC_ICON[g.spec] ?? 'search'}
                              title={h.title}
                              subtitle={[h.subtitle, own ? null : t('open_in_panel')].filter(Boolean).join(' · ')}
                              trailing={
                                own ? undefined : <Icon name="externalLink" tone="muted-foreground" size={16} />
                              }
                              onPress={() => void openPanelLink(h.href)}
                              last={i === g.hits.length - 1}
                            />
                          );
                        })}
                      </List>
                    </View>
                  ))}
                </>
              );
            }}
          </QueryState>
        )}
      </Screen>
    </>
  );
}
