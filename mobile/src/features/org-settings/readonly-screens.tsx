import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { Permission, useCan, type PermissionSlug } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { useHasFeature } from '@/core/tenant';
import type { components } from '@/core/api/schema';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useContractTemplates,
  useInspectionTemplates,
  useIntegration,
  useIntegrationAction,
  useIntegrationJobs,
  useIntegrations,
  useInvoiceSettings,
  useNotificationDeliveries,
  useNotificationEvents,
  useNotificationTemplates,
  usePublicApiKeys,
  usePublicApiOverview,
  useSaveNotificationRule,
  useSite,
  useSiteArticles,
  useSiteLeads,
  useWhatsAppSession,
  type IntegrationAccount,
  type NotificationEvent,
} from './api';
import { credentialRows, localized, type PanelPage } from './lib';
import { confirmAction, Gate, InfoRow, PanelLink, Pill } from './parts';
import { StepUpHost } from './step-up';

type S = components['schemas'];
type Feature = S['FeatureKey'];

/** Title, permission gate, plan feature and the "open in panel" footer every read-only page shares. */
function Page({
  title,
  perm,
  feature,
  children,
}: {
  title: string;
  perm: PermissionSlug;
  feature?: Feature;
  children: ReactNode;
}) {
  const { t } = useTranslation('settings_app');
  const has = useHasFeature();
  return (
    <>
      <Stack.Screen options={{ title }} />
      <StepUpHost />
      <Gate perm={perm}>
        {feature && !has(feature) ? <EmptyState icon="security" title={t('feature_off')} /> : children}
      </Gate>
    </>
  );
}

function PanelNote({ page }: { page: PanelPage }) {
  const { t } = useTranslation('settings_app');
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="muted">
        {t('panel_note')}
      </Text>
      <PanelLink page={page} />
    </View>
  );
}

// ---------------------------------------------------------------- notifications

type NotifTab = 'rules' | 'templates' | 'history';

/** "Bildirimler": rules (on / off here, channels in the panel), templates (read-only), delivery history. */
export function NotificationSettingsScreen() {
  const { t } = useTranslation('notification_engine');
  const [tab, setTab] = useState<NotifTab>('rules');
  const tabs = (
    <Chips
      options={(['rules', 'templates', 'history'] as const).map((v) => ({ value: v, label: t(`tabs.${v}`) }))}
      value={tab}
      onChange={setTab}
    />
  );
  return (
    <Page title={t('title')} perm={Permission.TenantNotificationSettingsRead}>
      {tab === 'history' ? (
        <Deliveries header={tabs} />
      ) : tab === 'rules' ? (
        <Rules header={tabs} />
      ) : (
        <Templates header={tabs} />
      )}
    </Page>
  );
}

function Rules({ header }: { header: ReactNode }) {
  const { t } = useTranslation('notification_engine');
  const can = useCan();
  const write = can(Permission.TenantNotificationSettingsWrite);
  const events = useNotificationEvents();
  const save = useSaveNotificationRule();
  const toggle = (e: NotificationEvent, enabled: boolean) =>
    save.mutate(
      {
        event: e.code,
        enabled,
        channels: e.rule.channels,
        fallback: e.rule.fallback,
        reminder_offsets: e.rule.reminder_offsets,
      },
      { onError: (err) => toast.error(apiErrorMessage(err)) },
    );
  return (
    <Screen>
      {header}
      <QueryState query={events}>
        {(d) => (
          <>
            {d.events.map((e) => (
              <View
                key={e.code}
                className="flex-row items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <View className="flex-1 gap-0.5">
                  <Text>{t(`events.${e.code}`, { defaultValue: e.code })}</Text>
                  <Text variant="footnote" tone="muted">
                    {t(`audiences.${e.audience}`)} · {e.rule.channels.map((c) => t(`channels.${c}`)).join(' → ') || '—'}
                  </Text>
                </View>
                <Switch
                  value={e.rule.enabled}
                  disabled={!write || save.isPending}
                  accessibilityLabel={t('rules.enabled')}
                  onValueChange={(v) => toggle(e, v)}
                />
              </View>
            ))}
            <PanelNote page="notifications" />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function Templates({ header }: { header: ReactNode }) {
  const { t } = useTranslation('notification_engine');
  const templates = useNotificationTemplates();
  return (
    <Screen>
      {header}
      <QueryState query={templates}>
        {(items) => (
          <>
            {items.map((tpl) => (
              <Card key={`${tpl.event}-${tpl.channel}-${tpl.language}`}>
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="flex-1 font-sans-semibold">
                    {t(`events.${tpl.event}`, { defaultValue: tpl.event })}
                  </Text>
                  <Text variant="footnote" tone="muted">
                    {t(`channels.${tpl.channel}`)} · {tpl.language.toUpperCase()}
                  </Text>
                </View>
                {tpl.subject ? <Text variant="callout">{tpl.subject}</Text> : null}
                <Text variant="footnote" tone="muted" numberOfLines={4}>
                  {tpl.body}
                </Text>
              </Card>
            ))}
            <PanelNote page="notifications" />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function Deliveries({ header }: { header: ReactNode }) {
  const { t } = useTranslation('notification_engine');
  const query = useNotificationDeliveries();
  return (
    <PagedList<S['NotificationDelivery']>
      query={query}
      keyOf={(d) => d.uuid}
      empty={t('history.empty')}
      header={<>{header}</>}
      renderItem={(d) => (
        <View className="gap-1 border-b border-border px-4 py-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
              {t(`events.${d.event}`, { defaultValue: d.event })}
            </Text>
            <Pill status={d.status} label={t(`delivery_statuses.${d.status}`)} />
          </View>
          <Text variant="footnote" tone="muted">
            {t(`channels.${d.channel}`)} · {d.recipient_name || d.recipient_masked} · {formatShort(d.created_at)}
          </Text>
          {d.error ? (
            <Text variant="footnote" tone="danger">
              {d.error}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

// ---------------------------------------------------------------- WhatsApp

/** "WhatsApp": session status only; pairing with the QR code stays in the panel. */
export function WhatsAppScreen() {
  const { t } = useTranslation('whatsapp');
  const has = useHasFeature();
  const session = useWhatsAppSession(has('whatsapp'));
  return (
    <Page title={t('title')} perm={Permission.TenantIntegrationsManage} feature="whatsapp">
      <Screen>
        <QueryState query={session}>
          {(s) => (
            <Card title={t('session.title')}>
              <Pill status={s.status} label={t(`statuses.${s.status}`)} />
              {s.status === 'not_connected' ? <Text tone="muted">{t('session.not_connected_help')}</Text> : null}
              <InfoRow label={t('session.provider')} value={s.provider} />
              <InfoRow label={t('session.phone')} value={s.phone_masked} />
              <InfoRow label={t('session.connected_at')} value={formatShort(s.connected_at)} />
              <InfoRow label={t('session.last_status_at')} value={formatShort(s.last_status_at)} />
              {s.last_error ? <InfoRow label={t('session.last_error')} value={s.last_error} /> : null}
            </Card>
          )}
        </QueryState>
        <PanelNote page="whatsapp" />
      </Screen>
    </Page>
  );
}

// ---------------------------------------------------------------- templates

/** Contract templates: list with status and version; the rich editor stays in the panel. */
export function ContractTemplatesScreen() {
  const { t } = useTranslation('settings_app');
  const query = useContractTemplates();
  return (
    <Page title={t('pages.contract_templates')} perm={Permission.TenantContractsRead}>
      <PagedList<S['ContractTemplate']>
        query={query}
        keyOf={(x) => x.uuid}
        empty={t('empty')}
        header={<PanelNote page="contractTemplates" />}
        renderItem={(x) => (
          <View className="gap-1 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
                {x.name}
              </Text>
              <Pill status={x.status} label={t(`template_statuses.${x.status}`)} />
            </View>
            <Text variant="footnote" tone="muted">
              {t(`contract_kinds.${x.kind}`)} · v{x.version} · {t('used_by', { count: x.used_by })}
            </Text>
          </View>
        )}
      />
    </Page>
  );
}

/** Inspection templates: photo slots and checklist counts. */
export function InspectionTemplatesScreen() {
  const { t } = useTranslation('settings_app');
  const query = useInspectionTemplates();
  return (
    <Page title={t('pages.inspection_templates')} perm={Permission.TenantRentalsRead}>
      <PagedList<S['InspectionTemplate']>
        query={query}
        keyOf={(x) => x.uuid}
        empty={t('empty')}
        header={<PanelNote page="inspectionTemplates" />}
        renderItem={(x) => (
          <View className="gap-1 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
                {x.name}
              </Text>
              <Pill status={x.status} label={t(`template_statuses.${x.status}`)} />
            </View>
            <Text variant="footnote" tone="muted">
              v{x.version} ·{' '}
              {t('inspection_counts', { photos: x.photo_slots.length, items: x.checklist.length, used: x.inspections })}
            </Text>
          </View>
        )}
      />
    </Page>
  );
}

// ---------------------------------------------------------------- invoices

/** E-invoice settings: series, supplier and integrator connection (read-only). */
export function InvoiceSettingsScreen() {
  const { t } = useTranslation('settings_app');
  const has = useHasFeature();
  const settings = useInvoiceSettings(has('einvoice'));
  return (
    <Page title={t('pages.invoices')} perm={Permission.TenantInvoicesSettings} feature="einvoice">
      <Screen>
        <QueryState query={settings}>
          {(s) => (
            <>
              <Card title={t('invoices.connection')}>
                <Pill
                  status={s.connection.state === 'ready' ? 'active' : 'pending'}
                  label={t(`invoices.states.${s.connection.state}`)}
                />
                <InfoRow label={t('invoices.provider')} value={s.connection.name || s.connection.provider} />
              </Card>
              <Card title={t('invoices.series')}>
                <InfoRow label="e-Fatura" value={s.efatura_series} />
                <InfoRow label="e-Arşiv" value={s.earsiv_series} />
                <InfoRow label={t('invoices.default_note')} value={s.default_note} />
              </Card>
              <Card title={t('invoices.supplier')}>
                <InfoRow label={t('invoices.legal_name')} value={s.supplier.legal_name} />
                <InfoRow label={t('invoices.tax_number')} value={s.supplier.tax_number} />
                <InfoRow
                  label={t('invoices.address')}
                  value={[s.supplier.address, s.supplier.district, s.supplier.city].filter(Boolean).join(', ')}
                />
              </Card>
              {s.missing.length ? (
                <Card title={t('invoices.missing')}>
                  {s.missing.map((m) => (
                    <Text key={m} variant="callout">
                      • {m}
                    </Text>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </QueryState>
        <PanelNote page="invoices" />
      </Screen>
    </Page>
  );
}

// ---------------------------------------------------------------- public API

/** Public API: channels, failed deliveries and the keys (prefix and last four only). */
export function PublicApiScreen() {
  const { t } = useTranslation('public_api');
  const has = useHasFeature();
  const on = has('public_api');
  const overview = usePublicApiOverview(on);
  const keys = usePublicApiKeys(on);
  return (
    <Page title={t('title')} perm={Permission.TenantPublicAPIRead} feature="public_api">
      <PagedList<S['PublicAPIKey']>
        query={keys}
        keyOf={(k) => k.uuid}
        empty={t('keys.empty_title')}
        header={
          <>
            <QueryState query={overview} rows={1}>
              {(o) => (
                <Card>
                  <InfoRow label={t('overview.base_url')} value={o.base_url} />
                  <InfoRow
                    label={t('overview.channels')}
                    value={o.channels
                      .filter((c) => c.active)
                      .map((c) => t(`channels.${c.code}`))
                      .join(', ')}
                  />
                  <InfoRow label={t('overview.failed_deliveries')} value={String(o.deliveries.failed)} />
                </Card>
              )}
            </QueryState>
            <PanelNote page="publicApi" />
          </>
        }
        renderItem={(k) => (
          <View className="gap-1 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
                {k.name}
              </Text>
              <Pill status={k.status} label={t(`key_statuses.${k.status}`)} />
            </View>
            <Text variant="footnote" tone="muted">
              {t(`kinds.${k.kind}`)} · {t(`channels.${k.channel}`)} · {k.key_prefix}…{k.key_last4}
            </Text>
            <Text variant="footnote" tone="muted">
              {t('keys.columns.last_used_at')}: {k.last_used_at ? formatShort(k.last_used_at) : '—'}
            </Text>
          </View>
        )}
      />
    </Page>
  );
}

// ---------------------------------------------------------------- integrations

/** Provider accounts: kind, mode, status and the last check. */
export function IntegrationsScreen() {
  const { t } = useTranslation('payments');
  const query = useIntegrations();
  return (
    <Page title={t('integrations.title')} perm={Permission.TenantIntegrationsManage}>
      <PagedList<IntegrationAccount>
        query={query}
        keyOf={(a) => a.uuid}
        empty={t('integrations.empty_title')}
        header={<PanelNote page="integrations" />}
        renderItem={(a, _i, last) => (
          <ListRow
            icon="wrench"
            title={a.display_name || t(`integrations.providers.${a.provider}`, { defaultValue: a.provider })}
            subtitle={`${t(`settings_app:integration_kinds.${a.kind}`)} · ${t(`integrations.modes.${a.mode}`)} · ${t(
              `integrations.statuses.${a.status}`,
            )}`}
            onPress={() => router.push(`/settings/integrations/${a.uuid}`)}
            last={last}
          />
        )}
      />
    </Page>
  );
}

/** One provider account: masked credential hints (never values), test / enable / disable, the job list. */
export function IntegrationScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('payments');
  return (
    <Page title={t('integrations.title')} perm={Permission.TenantIntegrationsManage}>
      <IntegrationBody uuid={uuid} />
    </Page>
  );
}

function IntegrationBody({ uuid }: { uuid: string }) {
  const { t } = useTranslation('payments');
  const account = useIntegration(uuid);
  const jobs = useIntegrationJobs(uuid);
  const action = useIntegrationAction(uuid);

  const run = async (kind: 'test' | 'enable' | 'disable') => {
    if (kind === 'disable') {
      const ok = await confirmAction({
        title: t('integrations.disable_title'),
        body: t('integrations.disable_description'),
        action: t('integrations.actions.disable'),
        cancel: t('common:cancel'),
        destructive: true,
      });
      if (!ok) return;
    }
    action.mutate(kind, {
      onSuccess: (r) => {
        if (kind === 'test') {
          const ok = (r as { last_check_status?: string }).last_check_status !== 'failed';
          (ok ? toast.success : toast.error)(t(ok ? 'integrations.toast.test_ok' : 'integrations.toast.test_failed'));
        } else toast.success(t(kind === 'enable' ? 'integrations.toast.enabled' : 'integrations.toast.disabled'));
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <PagedList<S['IntegrationJob']>
      query={jobs}
      keyOf={(j) => j.uuid}
      empty={t('integrations.jobs.empty_title')}
      header={
        <QueryState query={account} rows={2}>
          {(a) => (
            <>
              <Card>
                <Text variant="headline">
                  {a.display_name || t(`integrations.providers.${a.provider}`, { defaultValue: a.provider })}
                </Text>
                <Pill status={a.status} label={t(`integrations.statuses.${a.status}`)} />
                <InfoRow label={t('integrations.columns.mode')} value={t(`integrations.modes.${a.mode}`)} />
                <InfoRow
                  label={t('integrations.columns.last_check')}
                  value={
                    a.last_checked_at
                      ? `${t(`integrations.check.${a.last_check_status || 'never'}`)} · ${formatShort(a.last_checked_at)}`
                      : t('integrations.check.never')
                  }
                />
                {a.last_check_error ? <InfoRow label="" value={a.last_check_error} /> : null}
              </Card>
              <Card title={t('integrations.columns.credentials')}>
                {credentialRows(a.credentials_hint).map((r) => (
                  <InfoRow key={r.key} label={r.key} value={r.value} />
                ))}
                <Text variant="footnote" tone="muted">
                  {t('integrations.secrets_note')}
                </Text>
              </Card>
              <View className="flex-row gap-2">
                <Button
                  title={t('integrations.actions.test')}
                  variant="outline"
                  icon="refresh"
                  className="flex-1"
                  disabled={action.isPending || a.status !== 'active'}
                  onPress={() => void run('test')}
                />
                <Button
                  title={t(a.status === 'active' ? 'integrations.actions.disable' : 'integrations.actions.enable')}
                  variant={a.status === 'active' ? 'ghost' : 'secondary'}
                  className="flex-1"
                  disabled={action.isPending}
                  onPress={() => void run(a.status === 'active' ? 'disable' : 'enable')}
                />
              </View>
              <Text variant="caption" tone="muted" className="px-1">
                {t('integrations.jobs.title')}
              </Text>
            </>
          )}
        </QueryState>
      }
      renderItem={(j) => (
        <View className="gap-1 border-b border-border px-4 py-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
              {t(`integrations.jobs.kinds.${j.kind}`, { defaultValue: j.kind })}
            </Text>
            <Pill status={j.status} label={t(`integrations.jobs.statuses.${j.status}`, { defaultValue: j.status })} />
          </View>
          <Text variant="footnote" tone="muted">
            {j.attempts}/{j.max_attempts} · {formatShort(j.created_at)}
          </Text>
          {j.last_error ? (
            <Text variant="footnote" tone="danger" numberOfLines={2}>
              {j.last_error}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

// ---------------------------------------------------------------- branded site

/** Branded site: address, publish state and booking readiness; the site builder stays in the panel. */
export function SiteScreen() {
  const { t } = useTranslation('settings_app');
  const has = useHasFeature();
  const site = useSite(has('site'));
  return (
    <Page title={t('pages.site')} perm={Permission.TenantSiteRead} feature="site">
      <Screen>
        <QueryState query={site}>
          {(s) =>
            !s.exists ? (
              <EmptyState icon="language" title={t('site.none')} />
            ) : (
              <>
                <Card>
                  <Pill status={s.live ? 'active' : 'draft'} label={t(s.live ? 'site.live' : 'site.not_live')} />
                  <InfoRow label={t('site.url')} value={s.url} />
                  <InfoRow label={t('site.template')} value={s.config.template} />
                  <InfoRow label={t('site.hosts')} value={s.hosts.map((h) => h.host).join(', ')} />
                  <InfoRow
                    label={t('site.published_at')}
                    value={s.published_at ? `#${s.published_revision} · ${formatShort(s.published_at)}` : '—'}
                  />
                  {s.has_unpublished_changes ? <Text tone="muted">{t('site.unpublished')}</Text> : null}
                </Card>
                <Card title={t('site.booking')}>
                  <Pill
                    status={s.booking_enabled ? 'active' : 'blocked'}
                    label={t(s.booking_enabled ? 'site.booking_on' : 'site.booking_off')}
                  />
                  {s.booking_blockers.map((b) => (
                    <Text key={b} variant="callout">
                      • {t(`site.blockers.${b}`)}
                    </Text>
                  ))}
                </Card>
              </>
            )
          }
        </QueryState>
        <PanelNote page="site" />
      </Screen>
    </Page>
  );
}

/** Site articles: title, status and dates; the article editor stays in the panel. */
export function SiteArticlesScreen() {
  const { t, i18n } = useTranslation('settings_app');
  const has = useHasFeature();
  const query = useSiteArticles(has('site'));
  return (
    <Page title={t('pages.site_articles')} perm={Permission.TenantSiteRead} feature="site">
      <PagedList<S['SiteArticle']>
        query={query}
        keyOf={(a) => a.uuid}
        empty={t('empty')}
        header={<PanelNote page="siteArticles" />}
        renderItem={(a) => (
          <View className="gap-1 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={2}>
                {localized(a.title, i18n.language) || '—'}
              </Text>
              <Pill status={a.status} label={t(`article_statuses.${a.status}`)} />
            </View>
            <Text variant="footnote" tone="muted" numberOfLines={2}>
              {localized(a.summary, i18n.language)}
            </Text>
            <Text variant="footnote" tone="muted">
              {formatShort(a.published_at ?? a.updated_at)}
            </Text>
          </View>
        )}
      />
    </Page>
  );
}

/** Site requests (contact, corporate, franchise, newsletter) from the branded site's forms. */
export function SiteLeadsScreen() {
  const { t } = useTranslation('site_leads');
  const has = useHasFeature();
  const query = useSiteLeads(has('site'));
  return (
    <Page title={t('title')} perm={Permission.TenantSiteLeadsRead} feature="site">
      <PagedList<S['SiteLead']>
        query={query}
        keyOf={(l) => l.uuid}
        empty={t('empty_title')}
        header={<PanelNote page="siteLeads" />}
        renderItem={(l) => (
          <View className="gap-1 border-b border-border px-4 py-3">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold" numberOfLines={1}>
                {l.name || l.email}
              </Text>
              <Pill status={l.status} label={t(`statuses.${l.status}`)} />
            </View>
            <Text variant="footnote" tone="muted">
              {t(`kinds.${l.kind}`)} · {[l.email, l.phone].filter(Boolean).join(' · ')} · {formatShort(l.created_at)}
            </Text>
            {l.message ? (
              <Text variant="callout" numberOfLines={3}>
                {l.message}
              </Text>
            ) : null}
          </View>
        )}
      />
    </Page>
  );
}
