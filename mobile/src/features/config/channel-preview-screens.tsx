import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission } from '@/core/auth/permissions';
import { addDays, displayTimeZone, formatMoney, formatShort, localDate } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { zonedIso } from '@/core/zoned';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { Input } from '@/ui/input';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen, Screen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { TimeStrip } from '@/ui/time-strip';

import {
  useChannelAccounts,
  useChannelMapping,
  useChannelMappings,
  usePatchChannelMapping,
  usePricingPreview,
  useProducts,
  type PricingPreview,
} from './api';
import { channelKey, SALES_CHANNELS, validatePreview, type Errors, type PreviewValues } from './lib';
import { ActiveSwitch, DetailScreen, Field, Gate, PanelButton, Pill } from './parts';

// ---------------------------------------------------------------- channels

/** "Kanal yöneticisi": the channel accounts and their mappings; account settings stay in the panel. */
export function ChannelsScreen() {
  const { t } = useTranslation(['channels', 'config_app']);
  const [tab, setTab] = useState<'accounts' | 'mappings'>('accounts');
  return (
    <>
      <Stack.Screen options={{ title: t('config_app:sections.channels') }} />
      <Gate perm={Permission.TenantChannelsRead}>
        {tab === 'accounts' ? (
          <Accounts tabs={<Tabs value={tab} onChange={setTab} />} />
        ) : (
          <Mappings tabs={<Tabs value={tab} onChange={setTab} />} />
        )}
      </Gate>
    </>
  );
}

function Tabs({ value, onChange }: { value: 'accounts' | 'mappings'; onChange: (v: 'accounts' | 'mappings') => void }) {
  const { t } = useTranslation('channels');
  return (
    <Chips
      options={[
        { value: 'accounts' as const, label: t('tabs.accounts') },
        { value: 'mappings' as const, label: t('tabs.mappings') },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function Accounts({ tabs }: { tabs: React.ReactNode }) {
  const { t } = useTranslation(['channels', 'config_app']);
  const accounts = useChannelAccounts();
  return (
    <Screen>
      {tabs}
      <QueryState query={accounts}>
        {(d) =>
          d.length ? (
            <>
              {d.map((a) => (
                <Card key={a.uuid}>
                  <View className="flex-row items-center justify-between gap-2">
                    <Text variant="headline" className="flex-1">
                      {a.display_name}
                    </Text>
                    <Pill status={a.sync.health} label={t(`channels:health.${a.sync.health}`)} />
                  </View>
                  <Field label={t('config_app:mode')} value={t(`channels:accounts.mode_${a.mode}`)} />
                  <Field label={t('channels:accounts.active_mappings')} value={a.active_mappings} />
                  <Field label={t('channels:accounts.open_errors')} value={a.open_errors} />
                  <Field label={t('channels:accounts.last_push')} value={formatShort(a.sync.last_push_at)} />
                  <Field label={t('channels:accounts.last_pull')} value={formatShort(a.sync.last_pull_at)} />
                  <Field
                    label={t('channels:accounts.horizon')}
                    value={t('channels:accounts.horizon_days', { days: a.settings.horizon_days })}
                  />
                  {a.settings.stop_sale ? <Text tone="danger">{t('channels:accounts.stop_sale_on')}</Text> : null}
                  {a.sync.last_push_error ? (
                    <Text variant="footnote" tone="danger">
                      {a.sync.last_push_error}
                    </Text>
                  ) : null}
                </Card>
              ))}
              <Text variant="footnote" tone="muted">
                {t('config_app:channel_settings_in_panel')}
              </Text>
            </>
          ) : (
            <EmptyState
              icon="link"
              title={t('channels:accounts.empty_title')}
              body={t('channels:accounts.empty_description')}
            />
          )
        }
      </QueryState>
      <PanelButton section="channels" />
    </Screen>
  );
}

function Mappings({ tabs }: { tabs: React.ReactNode }) {
  const { t } = useTranslation(['channels', 'config_app']);
  const query = useMemo(() => ({}), []);
  const list = useChannelMappings(query);
  return (
    <PagedList
      query={list}
      keyOf={(m) => m.uuid}
      empty={t('config_app:empty')}
      header={<>{tabs}</>}
      renderItem={(m, _i, last) => (
        <ListRow
          title={`${m.branch?.name ?? m.product?.name ?? m.extra?.name ?? '—'} → ${m.external_code}`}
          subtitle={[
            t(`channels:entity_types.${m.entity_type}`),
            m.account.name,
            m.stop_sale ? t('config_app:stop_sale') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
          trailing={
            <Pill
              status={m.is_active ? 'active' : 'inactive'}
              label={t(m.is_active ? 'config_app:active' : 'config_app:inactive')}
            />
          }
          onPress={() => router.push(`/config/channels/mappings/${m.uuid}`)}
          last={last}
        />
      )}
    />
  );
}

export function ChannelMappingScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['channels', 'config_app']);
  const patch = usePatchChannelMapping(uuid);
  return (
    <DetailScreen
      title={t('channels:tabs.mappings')}
      perm={Permission.TenantChannelsRead}
      query={useChannelMapping(uuid)}
      section="channels">
      {(m) => (
        <>
          <Card>
            <Text variant="headline">{m.branch?.name ?? m.product?.name ?? m.extra?.name ?? '—'}</Text>
            <Field label={t('config_app:entity')} value={t(`channels:entity_types.${m.entity_type}`)} />
            <Field label={t('config_app:account')} value={m.account.name} />
            <Field label={t('config_app:external_code')} value={m.external_code} />
            <Field label={t('config_app:external_name')} value={m.external_name} />
            <Field label={t('config_app:priority')} value={m.priority} />
            <Field label={t('config_app:max_quota')} value={m.max_quota} />
            {m.note ? <Text tone="muted">{m.note}</Text> : null}
          </Card>
          <ActiveSwitch
            value={m.is_active}
            perm={Permission.TenantChannelsWrite}
            mutation={patch}
            body={(on) => ({ is_active: on })}
          />
          <ActiveSwitch
            value={m.stop_sale}
            perm={Permission.TenantChannelsWrite}
            mutation={patch}
            body={(on) => ({ stop_sale: on })}
            label={t('config_app:stop_sale')}
          />
        </>
      )}
    </DetailScreen>
  );
}

// ---------------------------------------------------------------- price preview

/** "Fiyat önizleme" with the current prices: product, branch, channel, pick-up and return (no drafts). */
export function PreviewScreen() {
  const { t } = useTranslation('pricing');
  return (
    <>
      <Stack.Screen options={{ title: t('preview.title') }} />
      <Gate perm={Permission.TenantPricingRead}>
        <PreviewForm />
      </Gate>
    </>
  );
}

function PreviewForm() {
  const { t } = useTranslation(['pricing', 'config_app']);
  const branch = useSelectedBranch();
  const products = useProducts(useMemo(() => ({ is_active: true }), []));
  const preview = usePricingPreview();
  const today = localDate(new Date(), displayTimeZone());
  const [v, setV] = useState<PreviewValues>({
    rental_product_uuid: '',
    branch_uuid: branch.branchUuid ?? '',
    channel: 'web',
    start_day: addDays(today, 1),
    start_time: '10:00',
    end_day: addDays(today, 8),
    end_time: '10:00',
    coupon_code: '',
  });
  const [local, setLocal] = useState<Errors>({});
  const api = formErrors(preview.error);
  const field = (n: string) => (local[n] ? t(local[n]) : api.fields[n]);
  const set = (p: Partial<PreviewValues>) => setV((s) => ({ ...s, ...p }));
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const submit = () => {
    const e = validatePreview(v);
    setLocal(e);
    if (Object.keys(e).length) return;
    const tz = displayTimeZone();
    preview.mutate({
      rental_product_uuid: v.rental_product_uuid,
      branch_uuid: v.branch_uuid,
      channel: v.channel,
      start_at: zonedIso(v.start_day, v.start_time, tz),
      end_at: zonedIso(v.end_day, v.end_time, tz),
      ...(v.coupon_code.trim() ? { coupon_code: v.coupon_code.trim() } : {}),
    });
  };
  return (
    <FormScreen
      footer={
        <>
          {api.message ? (
            <Text variant="footnote" tone="danger">
              {api.message}
            </Text>
          ) : null}
          <Button size="lg" title={t('preview.run')} loading={preview.isPending} onPress={submit} />
        </>
      }>
      <Select
        label={t('fields.rental_product')}
        value={v.rental_product_uuid}
        placeholder={t('fields.product_placeholder')}
        searchable
        options={items.map((p) => ({ value: p.uuid, label: p.title, description: p.code }))}
        onChange={(rental_product_uuid) => set({ rental_product_uuid })}
        error={field('rental_product_uuid')}
      />
      <Select
        label={t('preview.pickup_branch')}
        value={v.branch_uuid}
        placeholder={t('fields.branch_placeholder')}
        searchable={branch.branches.length > 8}
        options={branch.branches.map((b) => ({ value: b.uuid, label: b.name, description: b.code }))}
        onChange={(branch_uuid) => set({ branch_uuid })}
        error={field('branch_uuid')}
      />
      <Select
        label={t('fields.channel')}
        value={v.channel}
        options={SALES_CHANNELS.map((c) => ({ value: c, label: t(channelKey(c)!) }))}
        onChange={(channel) => set({ channel })}
        error={field('channel')}
      />
      <DateField
        label={t('preview.start_at')}
        value={v.start_day}
        onChange={(start_day) => set({ start_day })}
        error={field('start_day')}
      />
      <TimeStrip value={v.start_time} onChange={(start_time) => set({ start_time })} />
      <DateField
        label={t('preview.end_at')}
        value={v.end_day}
        min={v.start_day}
        onChange={(end_day) => set({ end_day })}
        error={field('end_day')}
      />
      <TimeStrip value={v.end_time} onChange={(end_time) => set({ end_time })} />
      <Input
        label={t('config_app:coupon_code')}
        value={v.coupon_code}
        onChangeText={(coupon_code) => set({ coupon_code })}
        autoCapitalize="characters"
        maxLength={64}
        error={field('coupon_code')}
      />
      {preview.data ? <PreviewResult data={preview.data} /> : null}
      <Text variant="footnote" tone="muted">
        {t('config_app:preview_drafts_in_panel')}
      </Text>
      <PanelButton section="preview" />
    </FormScreen>
  );
}

function PreviewResult({ data }: { data: PricingPreview }) {
  const { t } = useTranslation(['pricing', 'config_app']);
  const side = data.current;
  const b = side.breakdown;
  return (
    <Card title={t('preview.current')}>
      {side.error ? (
        <Text tone="danger">{t(`preview.errors.${side.error.code}`, { defaultValue: side.error.message })}</Text>
      ) : b ? (
        <>
          <Field label={t('preview.plan')} value={b.plan.name} />
          <Field label={t('config_app:billing_days')} value={b.billing_days} />
          <Field label={t('preview.band_price')} value={formatMoney(b.days[0]?.base_price, b.currency)} />
          <Field label={t('preview.rental_subtotal')} value={formatMoney(b.rental_subtotal, b.currency)} />
          {b.discount ? (
            <Field label={t('preview.discount')} value={`− ${formatMoney(b.discount.amount, b.currency)}`} />
          ) : null}
          {b.lines
            .filter((l) => l.kind !== 'rental')
            .map((l, i) => (
              <Field key={i} label={l.name || t(`preview.lines.${l.kind}`)} value={formatMoney(l.gross, b.currency)} />
            ))}
          <Field label={t('preview.vat')} value={formatMoney(b.vat_total, b.currency)} />
          <View className="flex-row items-center justify-between border-t border-border pt-3">
            <Text variant="headline">{t('config_app:total')}</Text>
            <Text variant="headline" className="tabular-nums">
              {formatMoney(b.total, b.currency)}
            </Text>
          </View>
        </>
      ) : null}
      {side.coupon ? (
        <Text variant="footnote" tone={side.coupon.status === 'applied' ? 'success' : 'danger'}>
          {`${side.coupon.code}: ${side.coupon.reason || side.coupon.status}`}
        </Text>
      ) : null}
      {data.warnings.length ? (
        <List>
          {data.warnings.map((w, i) => (
            <ListRow
              key={w}
              icon="info"
              title={t(`preview.warnings.${w}`, { defaultValue: w })}
              last={i === data.warnings.length - 1}
            />
          ))}
        </List>
      ) : null}
    </Card>
  );
}
