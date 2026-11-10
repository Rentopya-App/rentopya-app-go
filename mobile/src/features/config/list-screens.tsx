import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Permission, useCan, type PermissionSlug } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Chips } from '@/ui/chips';
import type { IconName } from '@/ui/icons';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Text } from '@/ui/text';

import {
  useBranches,
  useCampaigns,
  useCapacityRules,
  useDateRules,
  useExtras,
  useGroups,
  useOneWayRules,
  useProducts,
  useRatePlans,
  useSegments,
} from './api';
import { channelKey, SECTION_GROUPS, SECTION_ROUTES, SECTIONS, type SectionKey } from './lib';
import { Gate, PanelButton, Pill } from './parts';

type Page<T> = { items: T[]; total: number; offset: number; limit: number };
type Row = { title: string; subtitle?: string; pill?: { status: string; label: string }; href?: string };

/** "Yapılandırma": the pricing, fleet set-up, branch and channel screens the member may open. */
export function ConfigHubScreen() {
  const { t } = useTranslation('config_app');
  const can = useCan();
  const visible = SECTIONS.filter((s) => can(s.perm));
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        {visible.length ? null : <Text tone="muted">{t('common:forbidden')}</Text>}
        {SECTION_GROUPS.map((g) => {
          const rows = visible.filter((s) => s.group === g);
          if (!rows.length) return null;
          return (
            <View key={g}>
              <SectionHeader title={t(`groups.${g}`)} />
              <List>
                {rows.map((s, i) => (
                  <ListRow
                    key={s.key}
                    icon={s.icon as IconName}
                    title={t(`sections.${s.key}`)}
                    subtitle={t(`sections.${s.key}_hint`)}
                    onPress={() => router.push(SECTION_ROUTES[s.key] as never)}
                    last={i === rows.length - 1}
                  />
                ))}
              </List>
            </View>
          );
        })}
        <Text variant="footnote" tone="muted" className="px-1">
          {t('panel_note')}
        </Text>
      </Screen>
    </>
  );
}

/** A searchable, paged configuration list with the panel link above it. */
function ResourceList<T extends { uuid: string }>({
  section,
  perm,
  useList,
  row,
  extraQuery,
  filters,
  search = true,
}: {
  section: SectionKey;
  perm: PermissionSlug;
  useList: (q: Record<string, unknown>) => UseInfiniteQueryResult<{ pages: Page<T>[] }>;
  row: (item: T) => Row;
  extraQuery?: Record<string, unknown>;
  filters?: React.ReactNode;
  search?: boolean;
}) {
  const { t } = useTranslation('config_app');
  const [q, setQ] = useState('');
  const term = useDebounced(q);
  const query = useMemo(() => ({ ...(search ? { q: term } : {}), ...extraQuery }), [term, extraQuery, search]);
  const list = useList(query);
  return (
    <>
      <Stack.Screen options={{ title: t(`sections.${section}`) }} />
      <Gate perm={perm}>
        <PagedList
          query={list}
          keyOf={(r) => r.uuid}
          empty={term ? t('empty_filtered') : t('empty')}
          header={
            <>
              {search ? <SearchField value={q} onChangeText={setQ} placeholder={t('search')} /> : null}
              {filters}
              <PanelButton section={section} />
            </>
          }
          renderItem={(item, _i, last) => {
            const r = row(item);
            return (
              <ListRow
                title={r.title}
                subtitle={r.subtitle}
                trailing={r.pill ? <Pill status={r.pill.status} label={r.pill.label} /> : undefined}
                onPress={r.href ? () => router.push(r.href as never) : undefined}
                last={last}
              />
            );
          }}
        />
      </Gate>
    </>
  );
}

function useActiveLabel() {
  const { t } = useTranslation('config_app');
  return (on: boolean) => ({ status: on ? 'active' : 'inactive', label: t(on ? 'active' : 'inactive') });
}

/** Chips of a status filter: all + the given values. */
function StatusChips<V extends string>({
  values,
  value,
  onChange,
  label,
}: {
  values: readonly V[];
  value: V | 'all';
  onChange: (v: V | 'all') => void;
  label: (v: V) => string;
}) {
  const { t } = useTranslation();
  return (
    <Chips<V | 'all'>
      options={[{ value: 'all', label: t('common:all') }, ...values.map((v) => ({ value: v, label: label(v) }))]}
      value={value}
      onChange={onChange}
    />
  );
}

// ---------------------------------------------------------------- pricing

export function RatePlansScreen() {
  const { t } = useTranslation(['pricing', 'config_app']);
  const [status, setStatus] = useState<'draft' | 'active' | 'inactive' | 'all'>('all');
  const extra = useMemo(() => ({ status: status === 'all' ? undefined : status }), [status]);
  return (
    <ResourceList
      section="rate_plans"
      perm={Permission.TenantPricingRead}
      useList={useRatePlans}
      extraQuery={extra}
      filters={
        <StatusChips
          values={['active', 'draft', 'inactive'] as const}
          value={status}
          onChange={setStatus}
          label={(s) => t(`pricing:status.${s}`)}
        />
      }
      row={(p) => ({
        title: p.name,
        subtitle: [
          p.rental_product.title,
          t(`pricing:scope.${p.scope}`),
          p.branch?.name,
          channelKey(p.channel) ? t(channelKey(p.channel)!) : p.channel,
          p.price_from ? t('config_app:price_from', { amount: formatMoney(p.price_from) }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        pill: { status: p.status, label: t(`pricing:status.${p.status}`) },
        href: `/config/rate-plans/${p.uuid}`,
      })}
    />
  );
}

export function DateRulesScreen() {
  const { t } = useTranslation(['pricing', 'config_app']);
  const [status, setStatus] = useState<'draft' | 'active' | 'inactive' | 'all'>('all');
  const extra = useMemo(() => ({ status: status === 'all' ? undefined : status }), [status]);
  return (
    <ResourceList
      section="date_rules"
      perm={Permission.TenantPricingRead}
      useList={useDateRules}
      extraQuery={extra}
      filters={
        <StatusChips
          values={['active', 'draft', 'inactive'] as const}
          value={status}
          onChange={setStatus}
          label={(s) => t(`pricing:status.${s}`)}
        />
      }
      row={(r) => ({
        title: r.name,
        subtitle: [
          r.start_date ? `${formatCalendarDate(r.start_date)} – ${formatCalendarDate(r.end_date)}` : null,
          r.kind ? `${r.kind === 'percent' ? `%${r.value}` : formatMoney(r.value)}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        pill: { status: r.status, label: t(`pricing:status.${r.status}`) },
        href: `/config/date-rules/${r.uuid}`,
      })}
    />
  );
}

export function ExtrasScreen() {
  const { t } = useTranslation(['extras', 'config_app']);
  return (
    <ResourceList
      section="extras"
      perm={Permission.TenantExtrasRead}
      useList={useExtras}
      row={(x) => ({
        title: x.name,
        subtitle: [
          x.code,
          t(`extras:type.${x.extra_type}`),
          x.default_price ? `${formatMoney(x.default_price)} · ${t(`extras:charge.${x.charge_type}`)}` : null,
          x.is_physical ? t('config_app:stock_total', { count: x.stock_total }) : null,
        ]
          .filter(Boolean)
          .join(' · '),
        pill: { status: x.status, label: t(`extras:status.${x.status}`) },
        href: `/config/extras/${x.uuid}`,
      })}
    />
  );
}

export function CampaignsScreen() {
  const { t } = useTranslation(['campaigns', 'config_app']);
  return (
    <ResourceList
      section="campaigns"
      perm={Permission.TenantCampaignsRead}
      useList={useCampaigns}
      row={(c) => ({
        title: c.name,
        subtitle: [
          c.code,
          c.discount_kind === 'percent' ? `%${c.discount_value}` : formatMoney(c.discount_value),
          t('config_app:used_count', { count: c.used_count }),
        ]
          .filter(Boolean)
          .join(' · '),
        pill: { status: c.state, label: t(`campaigns:state.${c.state}`) },
        href: `/config/campaigns/${c.uuid}`,
      })}
    />
  );
}

// ---------------------------------------------------------------- fleet set-up

export function SegmentsScreen() {
  const { t } = useTranslation('config_app');
  const active = useActiveLabel();
  return (
    <ResourceList
      section="segments"
      perm={Permission.TenantFleetRead}
      useList={useSegments}
      row={(s) => ({
        title: s.name,
        subtitle: [s.code, t('groups_products', { groups: s.groups_count, products: s.products_count })].join(' · '),
        pill: active(s.is_active),
        href: `/config/segments/${s.uuid}`,
      })}
    />
  );
}

export function GroupsScreen() {
  const active = useActiveLabel();
  return (
    <ResourceList
      section="groups"
      perm={Permission.TenantFleetRead}
      useList={useGroups}
      row={(g) => ({
        title: g.name,
        subtitle: [g.code, g.segment.name, g.acriss_code].filter(Boolean).join(' · '),
        pill: active(g.is_active),
        href: `/config/groups/${g.uuid}`,
      })}
    />
  );
}

export function ProductsScreen() {
  const { t } = useTranslation('fleet');
  return (
    <ResourceList
      section="products"
      perm={Permission.TenantFleetRead}
      useList={useProducts}
      row={(p) => ({
        title: p.title,
        subtitle: [p.code, p.segment.name, p.display_text].filter(Boolean).join(' · '),
        pill: p.is_active
          ? { status: p.status, label: t(`status.${p.status}`) }
          : { status: 'inactive', label: t('config_app:inactive') },
        href: `/config/products/${p.uuid}`,
      })}
    />
  );
}

export function OneWayRulesScreen() {
  const { t } = useTranslation(['one_way_rules', 'config_app']);
  const branch = useSelectedBranch();
  const extra = useMemo(() => ({ from_branch: branch.branchUuid ?? undefined }), [branch.branchUuid]);
  return (
    <ResourceList
      section="one_way"
      perm={Permission.TenantOneWayRead}
      useList={useOneWayRules}
      extraQuery={extra}
      filters={
        branch.branch ? (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('config_app:branch_filtered', { branch: branch.branch.name })}
          </Text>
        ) : null
      }
      row={(r) => ({
        title: `${r.from_branch.name} → ${r.to_branch.name}`,
        subtitle: [
          r.rental_product?.title ?? t('one_way_rules:fields.all_products'),
          r.allowed ? formatMoney(r.fee) : null,
          r.is_active ? null : t('config_app:inactive'),
        ]
          .filter(Boolean)
          .join(' · '),
        pill: r.allowed
          ? { status: 'active', label: t('one_way_rules:allowed.true') }
          : { status: 'failing', label: t('one_way_rules:allowed.false') },
        href: `/config/one-way-rules/${r.uuid}`,
      })}
    />
  );
}

export function CapacityRulesScreen() {
  const { t } = useTranslation(['availability', 'config_app']);
  const active = useActiveLabel();
  return (
    <ResourceList
      section="capacity"
      perm={Permission.TenantCapacityRulesRead}
      useList={useCapacityRules}
      row={(r) => ({
        title: `${t(`availability:rule_type.${r.rule_type}`)} · ${r.quantity}`,
        subtitle: [
          r.product?.title ?? t('config_app:all_products'),
          r.branch?.name ?? t('config_app:all_branches'),
          r.channel ? (channelKey(r.channel) ? t(channelKey(r.channel)!) : r.channel) : t('config_app:all_channels'),
          r.note,
        ]
          .filter(Boolean)
          .join(' · '),
        pill: active(r.is_active),
      })}
    />
  );
}

// ---------------------------------------------------------------- branches

export function BranchesScreen() {
  const { t } = useTranslation('config_app');
  const active = useActiveLabel();
  return (
    <ResourceList
      section="branches"
      perm={Permission.TenantBranchesRead}
      useList={useBranches}
      row={(b) => ({
        title: b.name,
        subtitle: [
          b.code,
          [b.district, b.city].filter(Boolean).join(', '),
          t('points', { count: b.service_points_count }),
        ]
          .filter(Boolean)
          .join(' · '),
        pill: active(b.is_active),
        href: `/config/branches/${b.uuid}`,
      })}
    />
  );
}
