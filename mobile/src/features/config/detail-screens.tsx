import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { Can, Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useActivationCheck,
  useBranch,
  useCampaign,
  useDateRule,
  useExtra,
  useExtraStock,
  useGroup,
  useOneWayRule,
  usePatchCampaign,
  usePatchGroup,
  usePatchOneWayRule,
  usePatchProduct,
  usePatchSegment,
  usePricingToggle,
  useProduct,
  useRatePlan,
  useRatePlanMatrix,
  useSegment,
  useServicePoints,
  type RatePlan,
} from './api';
import { bandLabel, channelKey } from './lib';
import { ActiveSwitch, DetailScreen, Field, Gate, PanelButton, Pill, toastError } from './parts';

function useChannel() {
  const { t } = useTranslation('config_app');
  return (code: string | null | undefined) => (code ? (channelKey(code) ? t(channelKey(code)!) : code) : null);
}

function Bands({ bands }: { bands: { min_days: number; max_days: number | null; daily_price: string }[] }) {
  const { t } = useTranslation('config_app');
  if (!bands.length) return <Text tone="muted">{t('no_bands')}</Text>;
  return (
    <>
      {bands.map((b) => (
        <Field
          key={`${b.min_days}`}
          label={t('band_days', { band: bandLabel(b.min_days, b.max_days) })}
          value={formatMoney(b.daily_price)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------- rate plans

/** Activate (freezes the draft) / deactivate, behind `tenant.pricing.activate`; asks first like the panel. */
function PricingActions({
  kind,
  uuid,
  status,
  hasDraft,
}: {
  kind: 'rate-plans' | 'date-rules';
  uuid: string;
  status: string;
  hasDraft: boolean;
}) {
  const { t } = useTranslation(['config_app', 'pricing']);
  const toggle = usePricingToggle(kind, uuid);
  const run = (on: boolean) =>
    toggle.mutate(
      { on },
      {
        onSuccess: () => toast.success(t(on ? 'pricing:toast.activated' : 'pricing:toast.deactivated')),
        onError: toastError,
      },
    );
  const ask = (on: boolean) => {
    if (Platform.OS === 'web') return run(on);
    Alert.alert(t(on ? 'activate_title' : 'deactivate_title'), t(on ? 'activate_body' : 'deactivate_body'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t(on ? 'activate' : 'deactivate'), style: on ? 'default' : 'destructive', onPress: () => run(on) },
    ]);
  };
  const canActivate = hasDraft || status === 'inactive';
  return (
    <Can perm={Permission.TenantPricingActivate}>
      <View className="gap-2">
        {canActivate ? (
          <Button title={t('activate')} icon="check" loading={toggle.isPending} onPress={() => ask(true)} />
        ) : null}
        {status === 'active' ? (
          <Button title={t('deactivate')} variant="secondary" loading={toggle.isPending} onPress={() => ask(false)} />
        ) : null}
      </View>
    </Can>
  );
}

function ActivationIssues({ plan }: { plan: RatePlan }) {
  const { t } = useTranslation('config_app');
  const check = useActivationCheck(plan.uuid, plan.has_draft);
  if (!plan.has_draft || !check.data) return null;
  if (check.data.ready) return <Text tone="success">{t('check_ready')}</Text>;
  return (
    <Card title={t('check_issues')}>
      {check.data.issues.map((i, n) => (
        <Text key={n} variant="callout" tone="danger">
          {i.message}
        </Text>
      ))}
    </Card>
  );
}

export function RatePlanScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['pricing', 'config_app']);
  const channel = useChannel();
  return (
    <DetailScreen
      title={t('config_app:sections.rate_plans')}
      perm={Permission.TenantPricingRead}
      query={useRatePlan(uuid)}
      section="rate_plans"
      uuid={uuid}>
      {(p) => (
        <>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="headline" className="flex-1">
                {p.name}
              </Text>
              <Pill status={p.status} label={t(`pricing:status.${p.status}`)} />
            </View>
            <Field label={t('pricing:columns.rental_product')} value={p.rental_product.title} />
            <Field label={t('pricing:columns.scope')} value={t(`pricing:scope.${p.scope}`)} />
            <Field label={t('pricing:columns.branch')} value={p.branch?.name} />
            <Field label={t('pricing:columns.channel')} value={channel(p.channel)} />
            <Field label={t('pricing:columns.priority')} value={p.priority} />
            <Field
              label={t('pricing:fields.active_version')}
              value={p.active_version ? `v${p.active_version}` : t('pricing:never_activated')}
            />
            <Field
              label={t('pricing:columns.activated_at')}
              value={p.activated_at ? formatShort(p.activated_at) : null}
            />
          </Card>
          {p.active ? (
            <Card title={t('config_app:active_prices')}>
              <Bands bands={p.active.bands} />
            </Card>
          ) : null}
          {p.draft ? (
            <Card title={t('pricing:pending_draft')}>
              <Bands bands={p.draft.bands} />
              {p.draft.change_note ? <Text tone="muted">{p.draft.change_note}</Text> : null}
            </Card>
          ) : null}
          <ActivationIssues plan={p} />
          <PricingActions kind="rate-plans" uuid={p.uuid} status={p.status} hasDraft={p.has_draft} />
          <Text variant="footnote" tone="muted">
            {t('config_app:bands_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}

/** Read-only price matrix: products × bands of one scope (common, or the branch of the menu). */
export function MatrixScreen() {
  const { t } = useTranslation(['pricing', 'config_app']);
  const branch = useSelectedBranch();
  const [scope, setScope] = useState<'common' | 'branch'>('common');
  const matrix = useRatePlanMatrix({ scope, branch: scope === 'branch' ? branch.branchUuid : undefined });
  return (
    <>
      <Stack.Screen options={{ title: t('pricing:matrix.title') }} />
      <Gate perm={Permission.TenantPricingRead}>
        <Screen>
          <Chips
            options={[
              { value: 'common' as const, label: t('pricing:scope.common') },
              { value: 'branch' as const, label: branch.branch ? branch.branch.name : t('pricing:scope.branch') },
            ]}
            value={scope}
            onChange={setScope}
          />
          {scope === 'branch' && !branch.branchUuid ? (
            <EmptyState
              icon="building"
              title={t('pricing:matrix.pick_target')}
              body={t('config_app:matrix_pick_branch')}
            />
          ) : (
            <QueryState query={matrix}>
              {(m) =>
                m.rows.length ? (
                  <ScrollView horizontal className="rounded-lg border border-border bg-card">
                    <View className="p-3">
                      <View className="flex-row border-b border-border pb-2">
                        <Text variant="footnote" tone="muted" className="w-40">
                          {t('pricing:columns.rental_product')}
                        </Text>
                        {m.bands.map((b) => (
                          <Text key={b.min_days} variant="footnote" tone="muted" className="w-24 text-right">
                            {t('config_app:band_days', { band: bandLabel(b.min_days, b.max_days) })}
                          </Text>
                        ))}
                      </View>
                      {m.rows.map((r) => (
                        <View key={r.rental_product.uuid} className="flex-row items-center border-b border-border py-2">
                          <View className="w-40 pr-2">
                            <Text variant="callout" numberOfLines={1}>
                              {r.rental_product.title}
                            </Text>
                            <Text variant="footnote" tone="muted">
                              {r.source ? t(`pricing:status.${r.source}`) : t('pricing:matrix.no_plan')}
                            </Text>
                          </View>
                          {r.prices.map((price, i) => (
                            <Text key={i} variant="callout" className="w-24 text-right tabular-nums">
                              {price ? formatMoney(price) : '—'}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                ) : (
                  <EmptyState icon="inbox" title={t('pricing:matrix.no_products')} />
                )
              }
            </QueryState>
          )}
          <Text variant="footnote" tone="muted">
            {t('pricing:matrix.help_view')} {t('config_app:matrix_edit_in_panel')}
          </Text>
          <PanelButton section="matrix" />
        </Screen>
      </Gate>
    </>
  );
}

// ---------------------------------------------------------------- date rules

export function DateRuleScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['pricing', 'config_app']);
  return (
    <DetailScreen
      title={t('config_app:sections.date_rules')}
      perm={Permission.TenantPricingRead}
      query={useDateRule(uuid)}
      section="date_rules"
      uuid={uuid}>
      {(r) => {
        const v = r.draft ?? r.active;
        return (
          <>
            <Card>
              <View className="flex-row items-center justify-between gap-2">
                <Text variant="headline" className="flex-1">
                  {r.name}
                </Text>
                <Pill status={r.status} label={t(`pricing:status.${r.status}`)} />
              </View>
              <Field
                label={t('pricing:columns.range')}
                value={r.start_date ? `${formatCalendarDate(r.start_date)} – ${formatCalendarDate(r.end_date)}` : null}
              />
              <Field label={t('pricing:columns.kind')} value={r.kind ? t(`pricing:kind.${r.kind}`) : null} />
              <Field
                label={t('pricing:columns.value')}
                value={r.kind === 'percent' ? `%${r.value}` : formatMoney(r.value)}
              />
              <Field label={t('pricing:columns.priority')} value={r.priority} />
              <Field
                label={t('pricing:columns.scope')}
                value={
                  [v?.rental_products?.map((p) => p.title).join(', '), v?.segments?.map((s) => s.name).join(', ')]
                    .filter(Boolean)
                    .join(' · ') || t('config_app:all_products')
                }
              />
              <Field
                label={t('pricing:fields.branches')}
                value={r.all_branches ? t('pricing:all_branches') : v?.branches?.map((b) => b.name).join(', ')}
              />
              <Field
                label={t('pricing:fields.channels')}
                value={r.all_channels ? t('pricing:all_channels') : v?.channels?.join(', ')}
              />
            </Card>
            <PricingActions kind="date-rules" uuid={r.uuid} status={r.status} hasDraft={r.has_draft} />
            <Text variant="footnote" tone="muted">
              {t('config_app:rules_in_panel')}
            </Text>
          </>
        );
      }}
    </DetailScreen>
  );
}

// ---------------------------------------------------------------- extras, campaigns

export function ExtraScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['extras', 'config_app']);
  const extra = useExtra(uuid);
  const stock = useExtraStock(uuid, !!extra.data?.is_physical);
  const can = useCan();
  return (
    <DetailScreen
      title={t('config_app:sections.extras')}
      perm={Permission.TenantExtrasRead}
      query={extra}
      section="extras"
      uuid={uuid}>
      {(x) => (
        <>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="headline" className="flex-1">
                {x.name}
              </Text>
              <Pill status={x.status} label={t(`extras:status.${x.status}`)} />
            </View>
            <Field label={t('extras:columns.code')} value={x.code} />
            <Field label={t('extras:columns.extra_type')} value={t(`extras:type.${x.extra_type}`)} />
            <Field label={t('extras:columns.charge_type')} value={t(`extras:charge.${x.charge_type}`)} />
            <Field
              label={t('extras:columns.default_price')}
              value={x.default_price ? formatMoney(x.default_price) : null}
            />
            <Field label={t('extras:columns.max_total')} value={x.max_total ? formatMoney(x.max_total) : null} />
            <Field label={t('config_app:quantity_range')} value={`${x.min_quantity}–${x.max_quantity}`} />
            <Field label={t('extras:columns.product_price_count')} value={x.product_price_count} />
            {x.description ? <Text tone="muted">{x.description}</Text> : null}
          </Card>
          <Card title={t('extras:stock.title')}>
            {!x.is_physical ? (
              <Text tone="muted">{t('extras:stock.not_physical')}</Text>
            ) : (
              <QueryState query={stock} rows={2}>
                {(s) =>
                  s.items.length ? (
                    <>
                      {s.items.map((r) => (
                        <Field
                          key={r.branch.uuid}
                          label={r.branch.name}
                          value={
                            <Text
                              variant="callout"
                              tone={r.peak_committed > r.quantity ? 'danger' : 'default'}
                              className="tabular-nums">
                              {t('config_app:stock_row', {
                                quantity: r.quantity,
                                inUse: r.in_use_now,
                                peak: r.peak_committed,
                              })}
                            </Text>
                          }
                        />
                      ))}
                      {can(Permission.TenantExtrasWrite) ? (
                        <Button
                          variant="secondary"
                          icon="edit"
                          title={t('config_app:edit_stock')}
                          onPress={() => router.push(`/config/extras/${x.uuid}/stock`)}
                        />
                      ) : null}
                    </>
                  ) : (
                    <Text tone="muted">{t('extras:stock.empty')}</Text>
                  )
                }
              </QueryState>
            )}
          </Card>
          <Text variant="footnote" tone="muted">
            {t('config_app:extras_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}

export function CampaignScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['campaigns', 'config_app']);
  const patch = usePatchCampaign(uuid);
  const channel = useChannel();
  return (
    <DetailScreen
      title={t('config_app:sections.campaigns')}
      perm={Permission.TenantCampaignsRead}
      query={useCampaign(uuid)}
      section="campaigns"
      uuid={uuid}>
      {(c) => (
        <>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="headline" className="flex-1">
                {c.name}
              </Text>
              <Pill status={c.state} label={t(`campaigns:state.${c.state}`)} />
            </View>
            <Field label={t('campaigns:columns.campaign_type')} value={t(`campaigns:type.${c.campaign_type}`)} />
            <Field label={t('campaigns:columns.code')} value={c.code} />
            <Field
              label={t('campaigns:columns.discount_value')}
              value={c.discount_kind === 'percent' ? `%${c.discount_value}` : formatMoney(c.discount_value)}
            />
            <Field
              label={t('campaigns:fields.max_discount')}
              value={c.max_discount ? formatMoney(c.max_discount) : null}
            />
            <Field
              label={t('campaigns:fields.min_subtotal')}
              value={c.min_subtotal ? formatMoney(c.min_subtotal) : null}
            />
            <Field label={t('campaigns:columns.start_date')} value={formatCalendarDate(c.start_date)} />
            <Field label={t('campaigns:columns.end_date')} value={formatCalendarDate(c.end_date)} />
            <Field
              label={t('campaigns:columns.used_count')}
              value={c.usage_limit ? `${c.used_count} / ${c.usage_limit}` : c.used_count}
            />
            <Field
              label={t('campaigns:fields.channels')}
              value={
                c.channels?.length ? c.channels.map((x) => channel(x)).join(', ') : t('campaigns:fields.all_channels')
              }
            />
            {c.description ? <Text tone="muted">{c.description}</Text> : null}
          </Card>
          <ActiveSwitch
            value={c.is_active}
            perm={Permission.TenantCampaignsWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
          <Text variant="footnote" tone="muted">
            {t('config_app:campaigns_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}

// ---------------------------------------------------------------- fleet set-up

export function SegmentScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['fleet', 'config_app']);
  const patch = usePatchSegment(uuid);
  return (
    <DetailScreen
      title={t('fleet:segments.title')}
      perm={Permission.TenantFleetRead}
      query={useSegment(uuid)}
      section="segments"
      uuid={uuid}>
      {(s) => (
        <>
          <Card>
            <Text variant="headline">{s.name}</Text>
            <Field label={t('fleet:fields.code')} value={s.code} />
            <Field label={t('fleet:groups.title')} value={s.groups_count} />
            <Field label={t('fleet:products.title')} value={s.products_count} />
            {s.description ? <Text tone="muted">{s.description}</Text> : null}
          </Card>
          <ActiveSwitch
            value={s.is_active}
            perm={Permission.TenantFleetWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
        </>
      )}
    </DetailScreen>
  );
}

export function GroupScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['fleet', 'config_app']);
  const patch = usePatchGroup(uuid);
  return (
    <DetailScreen
      title={t('fleet:groups.title')}
      perm={Permission.TenantFleetRead}
      query={useGroup(uuid)}
      section="groups"
      uuid={uuid}>
      {(g) => (
        <>
          <Card>
            <Text variant="headline">{g.name}</Text>
            <Field label={t('fleet:fields.code')} value={g.code} />
            <Field label={t('fleet:fields.segment')} value={g.segment.name} />
            <Field label="ACRISS" value={g.acriss_code} />
            <Field label={t('config_app:min_seats')} value={g.min_seats} />
            <Field label={t('config_app:min_luggage')} value={g.min_luggage} />
            <Field label={t('config_app:models')} value={g.catalog_models.map((m) => m.name).join(', ')} />
            <Field label={t('fleet:products.title')} value={g.products_count} />
            {g.description ? <Text tone="muted">{g.description}</Text> : null}
          </Card>
          <ActiveSwitch
            value={g.is_active}
            perm={Permission.TenantFleetWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
          <Text variant="footnote" tone="muted">
            {t('config_app:attributes_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}

export function ProductScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['fleet', 'config_app']);
  const patch = usePatchProduct(uuid);
  return (
    <DetailScreen
      title={t('fleet:products.title')}
      perm={Permission.TenantFleetRead}
      query={useProduct(uuid)}
      section="products"
      uuid={uuid}>
      {(p) => (
        <>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="headline" className="flex-1">
                {p.title}
              </Text>
              <Pill status={p.status} label={t(`fleet:status.${p.status}`)} />
            </View>
            <Field label={t('fleet:fields.code')} value={p.code} />
            <Field label={t('fleet:fields.segment')} value={p.segment.name} />
            <Field label={t('config_app:guarantee')} value={p.display_text} />
            <Field label={t('config_app:version')} value={`v${p.current_version}`} />
          </Card>
          <ActiveSwitch
            value={p.is_active}
            perm={Permission.TenantFleetWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
          <Text variant="footnote" tone="muted">
            {t('config_app:attributes_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}

export function OneWayRuleScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['one_way_rules', 'config_app']);
  const patch = usePatchOneWayRule(uuid);
  return (
    <DetailScreen
      title={t('config_app:sections.one_way')}
      perm={Permission.TenantOneWayRead}
      query={useOneWayRule(uuid)}
      section="one_way">
      {(r) => (
        <>
          <Card>
            <Text variant="headline">{`${r.from_branch.name} → ${r.to_branch.name}`}</Text>
            <Field
              label={t('one_way_rules:columns.rental_product')}
              value={r.rental_product?.title ?? t('one_way_rules:fields.all_products')}
            />
            <Field label={t('one_way_rules:columns.allowed')} value={t(`one_way_rules:allowed.${r.allowed}`)} />
            <Field label={t('one_way_rules:columns.fee')} value={formatMoney(r.fee)} />
            {r.note ? <Text tone="muted">{r.note}</Text> : null}
          </Card>
          <ActiveSwitch
            value={r.is_active}
            perm={Permission.TenantOneWayWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
        </>
      )}
    </DetailScreen>
  );
}

// ---------------------------------------------------------------- branches

export function BranchScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['branches', 'config_app']);
  const points = useServicePoints(uuid);
  const can = useCan();
  const write = can(Permission.TenantBranchesWrite);
  return (
    <DetailScreen
      title={t('branches:detail_title')}
      perm={Permission.TenantBranchesRead}
      query={useBranch(uuid)}
      section="branches"
      uuid={uuid}>
      {(b) => (
        <>
          <Card>
            <View className="flex-row items-center justify-between gap-2">
              <Text variant="headline" className="flex-1">
                {b.name}
              </Text>
              <Pill
                status={b.is_active ? 'active' : 'inactive'}
                label={t(`branches:status.${b.is_active ? 'active' : 'inactive'}`)}
              />
            </View>
            <Field label={t('branches:fields.code')} value={b.code} />
            <Field label={t('branches:fields.address')} value={b.address} />
            <Field label={t('branches:fields.city')} value={[b.district, b.city].filter(Boolean).join(', ')} />
            <Field label={t('branches:fields.phone')} value={b.phone} />
            <Field label={t('branches:fields.email')} value={b.email} />
            <Field label={t('branches:fields.prep_minutes')} value={`${b.prep_minutes} ${t('branches:minutes')}`} />
          </Card>
          {write ? (
            <Button
              variant="secondary"
              icon="edit"
              title={t('config_app:edit_basics')}
              onPress={() => router.push(`/config/branches/${b.uuid}/edit`)}
            />
          ) : null}
          <QueryState query={points} rows={2}>
            {(list) =>
              list.items.length ? (
                <List>
                  {list.items.map((p, i) => (
                    <ListRow
                      key={p.uuid}
                      icon="location"
                      title={p.name}
                      subtitle={[
                        t(`branches:service_points.types.${p.type}`),
                        Number(p.extra_fee) > 0
                          ? t('branches:service_points.fee', { amount: formatMoney(p.extra_fee) })
                          : null,
                        p.delivery_enabled ? t('branches:service_points.fields.delivery_enabled') : null,
                        p.is_active ? null : t('config_app:inactive'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      onPress={write ? () => router.push(`/config/branches/${b.uuid}/points/${p.uuid}`) : undefined}
                      last={i === list.items.length - 1}
                    />
                  ))}
                </List>
              ) : (
                <EmptyState icon="location" title={t('branches:service_points.empty_title')} />
              )
            }
          </QueryState>
          <Text variant="footnote" tone="muted">
            {t('config_app:hours_in_panel')}
          </Text>
        </>
      )}
    </DetailScreen>
  );
}
