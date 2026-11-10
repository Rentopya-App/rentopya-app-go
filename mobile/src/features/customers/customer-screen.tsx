import { router, Stack, useIsFocused, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { Permission, useCan, useCanAll } from '@/core/auth/permissions';
import { formatCalendarDate, formatNumber, formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { HeaderButton } from '@/ui/header-button';
import { Icon } from '@/ui/icon';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { AgreementRow } from './agreements-screens';
import {
  type Customer,
  type CustomerDocument,
  type CustomerRevealed,
  useCustomer,
  useCustomerActivity,
  useCustomerAgreements,
  useCustomerConsents,
  useCustomerContacts,
  useCustomerDocuments,
  useCustomerDrivers,
  useDeleteContact,
  useDeleteDocument,
  useDeleteDriver,
  useRefreshCustomer,
} from './api';
import { openDocumentFile } from './document-file';
import { consentKey, countryName, docTypeKey, identityKey, sourceKey, typeKey } from './lib';
import { confirmDelete, Field, Masked } from './parts';
import { hideRevealed, useRevealed } from './reveal';
import { StepUpHost } from './step-up';

type Tab = 'general' | 'drivers' | 'consents' | 'documents' | 'activity';
const TABS: Tab[] = ['general', 'drivers', 'consents', 'documents', 'activity'];

const actorName = (a: { name: string; surname: string; email?: string } | null | undefined) =>
  a ? `${a.name} ${a.surname}`.trim() || a.email || null : null;

function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${formatNumber(bytes / (1024 * 1024), 1)} MB`;
  return `${formatNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/**
 * The customer page: the header with type, masked identity and consents,
 * then the panel's tabs (Genel, Sürücüler, İzinler, Belgeler, Aktivite).
 * "Göster" reveals the sensitive values for the API's display window.
 */
export function CustomerScreen({ uuid, initialTab }: { uuid: string; initialTab?: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const query = useCustomer(uuid);
  const refresh = useRefreshCustomer(uuid);
  const focused = useIsFocused();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>(() =>
    (TABS as string[]).includes(initialTab ?? '') ? (initialTab as Tab) : 'general',
  );
  const notFound = isApiError(query.error) && query.error.status === 404;
  const customer = query.data;

  // Revealed values never outlive the page.
  useEffect(() => () => hideRevealed(uuid), [uuid]);

  if (!can(Permission.TenantCustomersRead)) return <EmptyState icon="security" title={t('forbidden')} />;
  return (
    <>
      <Stack.Screen
        options={{
          title: customer?.display_name || t('detail_title'),
          headerRight: () =>
            customer && !customer.anonymized && can(Permission.TenantCustomersWrite) ? (
              <HeaderButton
                icon="edit"
                label={t('actions.edit')}
                onPress={() => router.push(`/customers/${uuid}/edit` as Href)}
              />
            ) : null,
        }}
      />
      <StepUpHost active={focused} />
      {notFound && !customer ? (
        <EmptyState icon="customer" title={t('not_found')} />
      ) : (
        <Screen
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={async () => {
                setRefreshing(true);
                await refresh().finally(() => setRefreshing(false));
              }}
            />
          }>
          <QueryState query={query}>
            {(c) => (
              <>
                <Header customer={c} />
                <Chips<Tab>
                  options={TABS.map((v) => ({ value: v, label: t(`tabs.${v}`) }))}
                  value={tab}
                  onChange={setTab}
                />
                {tab === 'general' ? <General customer={c} /> : null}
                {tab === 'drivers' ? <Drivers customer={c} /> : null}
                {tab === 'consents' ? <Consents customer={c} /> : null}
                {tab === 'documents' ? <Documents customer={c} /> : null}
                {tab === 'activity' ? <Activity uuid={c.uuid} /> : null}
              </>
            )}
          </QueryState>
        </Screen>
      )}
    </>
  );
}

function Header({ customer: c }: { customer: Customer }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <View className="size-12 items-center justify-center rounded-lg bg-secondary">
          <Icon name={c.customer_type === 'corporate' ? 'building' : 'user'} tone="primary" size={22} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text variant="headline" numberOfLines={2}>
            {c.display_name || t('anonymized_badge')}
          </Text>
          <Text variant="footnote" tone="muted" className="tabular-nums" numberOfLines={1}>
            {[c.identity_masked, c.phone_masked].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
      </View>
      <View className="flex-row flex-wrap gap-2">
        <StatusPill label={t(typeKey(c.customer_type))} />
        {c.anonymized ? <StatusPill label={t('anonymized_badge')} tone="progress" /> : null}
        {c.consent_channels.map((ch) => (
          <StatusPill key={ch} label={t(consentKey(ch))} tone="done" />
        ))}
        <StatusPill label={t('header.drivers', { count: c.drivers_count })} />
      </View>
    </Card>
  );
}

/** Reveal button or the banner with the countdown and "hide now". */
function RevealBar({
  customer,
  revealed,
  left,
}: {
  customer: Customer;
  revealed: CustomerRevealed | null;
  left: number;
}) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  if (!can(Permission.TenantCustomersReveal) || customer.anonymized) return null;
  if (!revealed) {
    return (
      <Button
        title={t('customers_app:reveal_button')}
        icon="security"
        variant="outline"
        onPress={() => router.push(`/customers/${customer.uuid}/reveal` as Href)}
      />
    );
  }
  return (
    <View className="gap-2 rounded-lg border border-warning bg-warning/10 p-4">
      <Text variant="headline">{t('reveal.banner_title')}</Text>
      <Text variant="footnote">{t('reveal.banner_description', { seconds: left })}</Text>
      <Button title={t('reveal.hide')} variant="outline" onPress={() => hideRevealed(customer.uuid)} />
    </View>
  );
}

function General({ customer: c }: { customer: Customer }) {
  const { t, i18n } = useTranslation(['customers', 'customers_app']);
  const { revealed, secondsLeft: left } = useRevealed(c.uuid);
  const corporate = c.customer_type === 'corporate';
  const b = c.billing;
  return (
    <>
      <RevealBar customer={c} revealed={revealed} left={left} />
      <View>
        <SectionHeader title={t('detail.identity')} />
        <List>
          {corporate ? (
            <>
              <Field label={t('fields.company_title')}>{c.company_title || '—'}</Field>
              <Field label={t('fields.tax_office')}>{c.tax_office || '—'}</Field>
            </>
          ) : (
            <>
              <Field label={t('fields.first_name')}>{c.first_name || '—'}</Field>
              <Field label={t('fields.last_name')}>{c.last_name || '—'}</Field>
            </>
          )}
          <Field label={t('fields.identity_type')}>{c.identity_type ? t(identityKey(c.identity_type)) : '—'}</Field>
          <Field label={t('fields.identity_number')}>
            <Masked masked={c.identity_masked} plain={revealed?.identity_number} />
          </Field>
          <Field label={corporate ? t('fields.country') : t('fields.nationality')} last>
            {c.nationality ? countryName(c.nationality, i18n.language) : '—'}
          </Field>
        </List>
      </View>
      <View>
        <SectionHeader title={t('detail.contact')} />
        <List>
          <Field label={t('fields.phone')}>
            <Masked masked={c.phone_masked} plain={revealed?.phone} />
          </Field>
          <Field label={t('fields.email')}>
            <Masked masked={c.email_masked} plain={revealed?.email} />
          </Field>
          <Field label={t('fields.tags')}>{c.tags.length ? c.tags.join(', ') : '—'}</Field>
          <Field label={t('fields.updated_at')} last>
            {formatShort(c.updated_at)}
          </Field>
        </List>
      </View>
      <View>
        <SectionHeader title={t('detail.billing')} />
        <List>
          <Field label={t('fields.billing_address')}>{b.address || '—'}</Field>
          <Field label={t('fields.billing_city')}>{[b.district, b.city].filter(Boolean).join(' / ') || '—'}</Field>
          <Field label={t('fields.billing_postal_code')}>{b.postal_code || '—'}</Field>
          <Field label={t('fields.billing_country')}>{b.country ? countryName(b.country, i18n.language) : '—'}</Field>
          <Field label={t('fields.e_invoice')} last>
            {b.e_invoice ? t('yes') : t('no')}
          </Field>
        </List>
      </View>
      <View>
        <SectionHeader title={t('fields.note')} />
        <Card>
          <Text variant="callout" tone={c.note ? 'default' : 'muted'}>
            {c.note || t('detail.no_note')}
          </Text>
        </Card>
      </View>
      {corporate ? <Contacts customer={c} plain={revealed} /> : null}
      <CustomerAgreements uuid={c.uuid} />
    </>
  );
}

/** Contacts of a corporate customer, with add / edit / delete. */
function Contacts({ customer, plain }: { customer: Customer; plain: CustomerRevealed | null }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const contacts = useCustomerContacts(customer.uuid);
  const remove = useDeleteContact(customer.uuid);
  const write = can(Permission.TenantCustomersWrite) && !customer.anonymized;
  return (
    <View>
      <SectionHeader title={t('contacts.title')} />
      <QueryState query={contacts} rows={2}>
        {(data) => (
          <>
            {data.items.length ? (
              <List>
                {data.items.map((c, i) => {
                  const p = plain?.contacts.find((x) => x.uuid === c.uuid);
                  return (
                    <View key={c.uuid} className={i === data.items.length - 1 ? '' : 'border-b border-border'}>
                      <View className="gap-1 px-4 py-3">
                        <View className="flex-row items-center gap-2">
                          <Text variant="headline" className="flex-1" numberOfLines={1}>
                            {c.full_name}
                          </Text>
                          {c.is_primary ? <StatusPill label={t('contacts.primary')} tone="done" /> : null}
                        </View>
                        {c.title ? (
                          <Text variant="footnote" tone="muted">
                            {c.title}
                          </Text>
                        ) : null}
                        <Masked masked={c.phone_masked} plain={p?.phone} />
                        <Masked masked={c.email_masked} plain={p?.email} />
                        {c.note ? (
                          <Text variant="footnote" tone="muted">
                            {c.note}
                          </Text>
                        ) : null}
                      </View>
                      {write ? (
                        <View className="flex-row gap-2 px-4 pb-3">
                          <Button
                            title={t('actions.edit')}
                            icon="edit"
                            variant="secondary"
                            onPress={() =>
                              router.push({
                                pathname: '/customers/[uuid]/contact',
                                params: { uuid: customer.uuid, contact: c.uuid },
                              } as unknown as Href)
                            }
                          />
                          <Button
                            title={t('actions.delete')}
                            icon="trash"
                            variant="ghost"
                            loading={remove.isPending && remove.variables === c.uuid}
                            onPress={() =>
                              confirmDelete(
                                t('contacts.delete_title'),
                                c.full_name,
                                { cancel: t('common:cancel'), ok: t('actions.delete') },
                                () =>
                                  remove.mutate(c.uuid, {
                                    onSuccess: () => toast.success(t('toast.contact_deleted')),
                                    onError: (e) => toast.error(apiErrorMessage(e)),
                                  }),
                              )
                            }
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </List>
            ) : (
              <EmptyState icon="customers" title={t('contacts.empty_title')} body={t('contacts.empty_description')} />
            )}
            {write ? (
              <Button
                title={t('contacts.add')}
                icon="add"
                variant="ghost"
                className="mt-2"
                onPress={() =>
                  router.push({
                    pathname: '/customers/[uuid]/contact',
                    params: { uuid: customer.uuid },
                  } as unknown as Href)
                }
              />
            ) : null}
          </>
        )}
      </QueryState>
    </View>
  );
}

/** Corporate agreements of the customer (`tenant.agreements.read`). */
function CustomerAgreements({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['agreements']);
  const can = useCan();
  const agreements = useCustomerAgreements(uuid);
  if (!can(Permission.TenantAgreementsRead) || !agreements.data?.items.length) return null;
  const items = agreements.data.items;
  return (
    <View>
      <SectionHeader title={t('title')} />
      <List>
        {items.map((a, i) => (
          <AgreementRow
            key={a.uuid}
            agreement={a}
            last={i === items.length - 1}
            onPress={() => router.push(`/agreements/${a.uuid}` as Href)}
          />
        ))}
      </List>
    </View>
  );
}

/** Drivers with the rental condition check; "customer is also driver" for an individual customer. */
function Drivers({ customer }: { customer: Customer }) {
  const { t, i18n } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const drivers = useCustomerDrivers(customer.uuid);
  const remove = useDeleteDriver(customer.uuid);
  const { revealed } = useRevealed(customer.uuid);
  const write = can(Permission.TenantCustomersWrite) && !customer.anonymized;
  const go = (params: Record<string, string>, screen: 'driver' | 'eligibility') =>
    router.push({
      pathname: `/customers/[uuid]/${screen}`,
      params: { uuid: customer.uuid, ...params },
    } as unknown as Href);
  return (
    <QueryState query={drivers} rows={2}>
      {(data) => {
        const hasSelf = data.items.some((d) => d.is_customer_self);
        return (
          <>
            <Text variant="footnote" tone="muted" className="px-1">
              {t('drivers.help')}
            </Text>
            {data.items.length ? (
              <List>
                {data.items.map((d, i) => {
                  const p = revealed?.drivers.find((x) => x.uuid === d.uuid);
                  return (
                    <View key={d.uuid} className={i === data.items.length - 1 ? '' : 'border-b border-border'}>
                      <View className="gap-1.5 px-4 py-3">
                        <Text variant="headline" numberOfLines={1}>
                          {d.full_name || '—'}
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {d.is_customer_self ? <StatusPill label={t('drivers.self')} /> : null}
                          {d.foreign_licence ? (
                            <StatusPill
                              label={t('drivers.foreign', { country: countryName(d.licence_country, i18n.language) })}
                              tone="progress"
                            />
                          ) : null}
                          {d.licence_expired ? <StatusPill label={t('drivers.expired')} tone="problem" /> : null}
                        </View>
                        <Text variant="footnote" tone="muted">
                          {[
                            d.age != null ? `${t('drivers.age')}: ${t('drivers.years', { count: d.age })}` : null,
                            d.licence_years != null
                              ? `${t('drivers.licence_years')}: ${t('drivers.years', { count: d.licence_years })}`
                              : null,
                            d.licence_class ? `${t('drivers.licence_class')}: ${d.licence_class}` : null,
                            d.licence_expires_on
                              ? `${t('drivers.licence_expires_on')}: ${formatCalendarDate(d.licence_expires_on)}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </Text>
                        <View className="flex-row flex-wrap items-center gap-x-4 gap-y-1">
                          <View className="flex-row items-center gap-1">
                            <Text variant="footnote" tone="muted">
                              {t('drivers.licence_number')}:
                            </Text>
                            <Masked masked={d.licence_masked} plain={p?.licence_number} />
                          </View>
                          <View className="flex-row items-center gap-1">
                            <Text variant="footnote" tone="muted">
                              {t('fields.identity_number')}:
                            </Text>
                            <Masked masked={d.identity_masked} plain={p?.identity_number} />
                          </View>
                          {d.phone_masked ? (
                            <View className="flex-row items-center gap-1">
                              <Text variant="footnote" tone="muted">
                                {t('fields.phone')}:
                              </Text>
                              <Masked masked={d.phone_masked} plain={p?.phone} />
                            </View>
                          ) : null}
                        </View>
                      </View>
                      <View className="flex-row flex-wrap gap-2 px-4 pb-3">
                        <Button
                          title={t('eligibility.action')}
                          icon="check"
                          variant="secondary"
                          onPress={() => go({ driver: d.uuid }, 'eligibility')}
                        />
                        {write ? (
                          <>
                            <Button
                              title={t('actions.edit')}
                              icon="edit"
                              variant="ghost"
                              onPress={() => go({ driver: d.uuid }, 'driver')}
                            />
                            <Button
                              title={t('actions.delete')}
                              icon="trash"
                              variant="ghost"
                              loading={remove.isPending && remove.variables === d.uuid}
                              onPress={() =>
                                confirmDelete(
                                  t('drivers.delete_title'),
                                  d.full_name,
                                  { cancel: t('common:cancel'), ok: t('actions.delete') },
                                  () =>
                                    remove.mutate(d.uuid, {
                                      onSuccess: () => toast.success(t('toast.driver_deleted')),
                                      onError: (e) => toast.error(apiErrorMessage(e)),
                                    }),
                                )
                              }
                            />
                          </>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </List>
            ) : (
              <EmptyState icon="user" title={t('drivers.empty_title')} body={t('drivers.empty_description')} />
            )}
            {write ? (
              <View className="gap-2">
                {customer.customer_type === 'individual' && !hasSelf ? (
                  <Button
                    title={t('drivers.add_self')}
                    icon="user"
                    variant="outline"
                    onPress={() => go({ self: '1' }, 'driver')}
                  />
                ) : null}
                <Button title={t('drivers.add')} icon="add" onPress={() => go({}, 'driver')} />
              </View>
            ) : null}
          </>
        );
      }}
    </QueryState>
  );
}

/** Current consent per channel with grant / withdraw, then the history. */
function Consents({ customer }: { customer: Customer }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const consents = useCustomerConsents(customer.uuid);
  const write = can(Permission.TenantCustomersWrite) && !customer.anonymized;
  return (
    <QueryState query={consents} rows={3}>
      {(data) => (
        <>
          <Text variant="footnote" tone="muted" className="px-1">
            {t('consents.help')}
          </Text>
          <View>
            <SectionHeader title={t('consents.current_title')} />
            <List>
              {data.current.map((s, i) => (
                <View key={s.channel} className={i === data.current.length - 1 ? '' : 'border-b border-border'}>
                  <View className="gap-1 px-4 py-3">
                    <View className="flex-row items-center gap-2">
                      <Text variant="headline" className="flex-1">
                        {t(consentKey(s.channel))}
                      </Text>
                      <StatusPill
                        label={s.granted ? t('consents.active') : t('consents.none')}
                        tone={s.granted ? 'done' : 'neutral'}
                      />
                    </View>
                    <Text variant="footnote" tone="muted">
                      {s.granted && s.since
                        ? t('consents.since', { date: formatShort(s.since), version: s.text_version })
                        : t('consents.no_consent')}
                    </Text>
                  </View>
                  {write ? (
                    <View className="px-4 pb-3">
                      <Button
                        title={s.granted ? t('consents.withdraw') : t('consents.grant')}
                        icon={s.granted ? 'cancel' : 'check'}
                        variant={s.granted ? 'outline' : 'secondary'}
                        onPress={() =>
                          router.push({
                            pathname: '/customers/[uuid]/consent',
                            params: {
                              uuid: customer.uuid,
                              channel: s.channel,
                              action: s.granted ? 'withdraw' : 'grant',
                            },
                          } as unknown as Href)
                        }
                      />
                    </View>
                  ) : null}
                </View>
              ))}
            </List>
          </View>
          <View>
            <SectionHeader title={t('consents.history_title')} />
            {data.items.length ? (
              <List>
                {data.items.map((c, i) => (
                  <ListRow
                    key={c.uuid}
                    icon={c.active ? 'check' : 'cancel'}
                    title={`${t(consentKey(c.channel))} · ${c.active ? t('consents.active') : t('consents.withdrawn')}`}
                    subtitle={[
                      formatShort(c.granted_at),
                      c.withdrawn_at ? `${t('consents.withdrawn_at')}: ${formatShort(c.withdrawn_at)}` : null,
                      t(sourceKey(c.source)),
                      c.text_version || null,
                      actorName(c.recorded_by),
                      c.note || null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    last={i === data.items.length - 1}
                  />
                ))}
              </List>
            ) : (
              <EmptyState icon="inbox" title={t('consents.empty_title')} body={t('consents.empty_description')} />
            )}
          </View>
        </>
      )}
    </QueryState>
  );
}

/**
 * Identity / licence scans in private storage. "Fotoğraf ekle" takes a
 * picture with the camera or picks one from the library and uploads it
 * through the documents API; opening a file needs the download and reveal
 * permissions and is recorded.
 */
function Documents({ customer }: { customer: Customer }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const canAll = useCanAll();
  const docs = useCustomerDocuments(customer.uuid);
  const remove = useDeleteDocument(customer.uuid);
  const [opening, setOpening] = useState<string | null>(null);
  const write = can(Permission.TenantCustomersWrite) && !customer.anonymized;
  const download = canAll(Permission.TenantDocumentDownload, Permission.TenantCustomersReveal);
  const open = async (d: CustomerDocument) => {
    setOpening(d.uuid);
    try {
      await openDocumentFile(customer.uuid, d);
    } catch (e) {
      toast.error(isApiError(e) ? apiErrorMessage(e) : t('toast.download_failed'));
    } finally {
      setOpening(null);
    }
  };
  const goDocument = (params: Record<string, string>) =>
    router.push({
      pathname: '/customers/[uuid]/document',
      params: { uuid: customer.uuid, ...params },
    } as unknown as Href);
  return (
    <QueryState query={docs} rows={2}>
      {(data) => (
        <>
          <Text variant="footnote" tone="muted" className="px-1">
            {download ? t('documents.help') : t('documents.help_no_download')}
          </Text>
          {write ? (
            <Button title={t('customers_app:document_add')} icon="camera" onPress={() => goDocument({})} />
          ) : null}
          {data.items.length ? (
            <List>
              {data.items.map((d, i) => (
                <View key={d.uuid} className={i === data.items.length - 1 ? '' : 'border-b border-border'}>
                  <View className="gap-1 px-4 py-3">
                    <View className="flex-row items-center gap-2">
                      <Icon name="document" tone="primary" size={18} />
                      <Text variant="headline" className="flex-1" numberOfLines={1}>
                        {t(docTypeKey(d.doc_type))}
                      </Text>
                      {!d.has_file ? <StatusPill label={t('customers_app:document_no_file')} tone="progress" /> : null}
                    </View>
                    <Text variant="footnote" tone="muted">
                      {[
                        d.driver?.full_name ?? t('documents.no_driver'),
                        d.valid_until ? `${t('documents.valid_until')}: ${formatCalendarDate(d.valid_until)}` : null,
                        d.has_file ? `${d.file_name} · ${fileSize(d.size_bytes)}` : null,
                        formatShort(d.created_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {d.note ? (
                      <Text variant="footnote" tone="muted">
                        {d.note}
                      </Text>
                    ) : null}
                  </View>
                  <View className="flex-row flex-wrap gap-2 px-4 pb-3">
                    {d.has_file && download ? (
                      <Button
                        title={t('customers_app:document_open')}
                        icon="externalLink"
                        variant="secondary"
                        loading={opening === d.uuid}
                        disabled={!!opening}
                        onPress={() => void open(d)}
                      />
                    ) : null}
                    {write ? (
                      <>
                        <Button
                          title={d.has_file ? t('documents.replace_file') : t('documents.upload_file')}
                          icon="camera"
                          variant={d.has_file ? 'ghost' : 'secondary'}
                          onPress={() => goDocument({ doc: d.uuid })}
                        />
                        <Button
                          title={t('actions.delete')}
                          icon="trash"
                          variant="ghost"
                          loading={remove.isPending && remove.variables === d.uuid}
                          onPress={() =>
                            confirmDelete(
                              t('documents.delete_title'),
                              t(docTypeKey(d.doc_type)),
                              { cancel: t('common:cancel'), ok: t('actions.delete') },
                              () =>
                                remove.mutate(d.uuid, {
                                  onSuccess: () => toast.success(t('toast.document_deleted')),
                                  onError: (e) => toast.error(apiErrorMessage(e)),
                                }),
                            )
                          }
                        />
                      </>
                    ) : null}
                  </View>
                </View>
              ))}
            </List>
          ) : (
            <EmptyState icon="document" title={t('documents.empty_title')} body={t('documents.empty_description')} />
          )}
        </>
      )}
    </QueryState>
  );
}

function Activity({ uuid }: { uuid: string }) {
  const { t, i18n } = useTranslation(['customers', 'customers_app']);
  const activity = useCustomerActivity(uuid, 20);
  const items = activity.data?.pages.flatMap((p) => p.items) ?? [];
  // The panel's activity labels; an unknown action shows as it is.
  const describe = (action: string) => {
    const key = `activity:actions.${action}`;
    return i18n.exists(key) ? t(key) : action;
  };
  if (activity.isError && !activity.data) {
    return (
      <EmptyState
        icon="error"
        title={t('common:load_failed')}
        action={{ title: t('common:retry'), icon: 'refresh', onPress: () => void activity.refetch() }}
      />
    );
  }
  if (!activity.data) return <Text tone="muted">{t('common:loading')}</Text>;
  if (!items.length) return <EmptyState icon="history" title={t('activity.empty')} />;
  return (
    <>
      <List>
        {items.map((e, i) => {
          const reason = typeof e.payload?.reason === 'string' ? e.payload.reason : '';
          return (
            <ListRow
              key={e.uuid}
              icon="history"
              title={describe(e.action)}
              subtitle={[
                formatShort(e.created_at),
                actorName(e.actor) ?? t('activity.system'),
                reason ? t('activity.reason', { reason }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
              last={i === items.length - 1}
            />
          );
        })}
      </List>
      {activity.hasNextPage ? (
        <Button
          title={t('activity.load_more')}
          variant="ghost"
          loading={activity.isFetchingNextPage}
          onPress={() => void activity.fetchNextPage()}
        />
      ) : null}
    </>
  );
}
