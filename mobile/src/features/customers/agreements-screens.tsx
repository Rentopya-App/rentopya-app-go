import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatCalendarDate, formatMoney, formatNumber, formatShort } from '@/core/format';
import { useSelectedBranch } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';

import {
  type Agreement,
  type AgreementListItem,
  useAgreement,
  useAgreementActivity,
  useAgreementList,
  useAgreementRentals,
  useRefreshAgreement,
} from './api';
import {
  AGREEMENT_STATUS_TONE,
  AGREEMENT_STATUSES,
  agreementStatusKey,
  contactRoleKey,
  invoicePeriodKey,
  VALIDITY_TONE,
  validityKey,
} from './lib';
import { Field } from './parts';

const ALL = '__all__';

const actorName = (a: { name: string; surname: string; email: string } | null | undefined) =>
  a ? `${a.name} ${a.surname}`.trim() || a.email : null;

/** "01.02.2026 – 31.01.2027" or "01.02.2026 – süresiz". */
function range(t: (k: string) => string, from: string, to: string | null) {
  return `${formatCalendarDate(from)} – ${to ? formatCalendarDate(to) : t('agreements:open_ended')}`;
}

/** One agreement: name, code, customer, validity window, status. */
export function AgreementRow({
  agreement,
  onPress,
  last,
}: {
  agreement: AgreementListItem;
  onPress: () => void;
  last?: boolean;
}) {
  const { t } = useTranslation(['agreements', 'customers_app']);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${agreement.name}, ${t(agreementStatusKey(agreement.status))}`}
      onPress={onPress}
      className={cn('gap-1.5 px-4 py-3 active:bg-muted', !last && 'border-b border-border')}>
      <View className="flex-row items-center gap-2">
        <Text variant="headline" className="flex-1" numberOfLines={1}>
          {agreement.name}
        </Text>
        <StatusPill label={t(agreementStatusKey(agreement.status))} tone={AGREEMENT_STATUS_TONE[agreement.status]} />
      </View>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {[agreement.code, agreement.customer.display_name].join(' · ')}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1} className="tabular-nums">
        {[
          range(t, agreement.valid_from, agreement.valid_to),
          t(validityKey(agreement.validity)),
          agreement.branch?.name ?? t('head_office'),
        ].join(' · ')}
      </Text>
    </Pressable>
  );
}

/** "Kurumsal anlaşmalar": list with search and status; the menu's branch filter is the managing branch. */
export function AgreementsScreen() {
  const { t } = useTranslation(['agreements', 'customers_app']);
  const can = useCan();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(ALL);
  const branch = useSelectedBranch();
  const search = useDebounced(q);
  const readable = can(Permission.TenantAgreementsRead);
  const query = useAgreementList({ q: search, status: status === ALL ? null : status, branch: branch.branchUuid });
  const filtered = !!search.trim() || status !== ALL;

  const header = (
    <>
      <SearchField value={q} onChangeText={setQ} placeholder={t('customers_app:agreements_search')} />
      <Chips
        options={[
          { value: ALL, label: t('common:all') },
          ...AGREEMENT_STATUSES.map((s) => ({ value: s, label: t(agreementStatusKey(s)) })),
        ]}
        value={status}
        onChange={setStatus}
      />
      {branch.branch ? (
        <Text variant="footnote" tone="muted" className="px-1">
          {t('customers_app:agreements_branch_filter', { name: branch.branch.name })}
        </Text>
      ) : null}
    </>
  );

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      {readable ? (
        <PagedList
          query={query}
          header={header}
          keyOf={(a) => a.uuid}
          empty={filtered ? t('empty_filtered_title') : t('empty_title')}
          renderItem={(a, _i, last) => (
            <AgreementRow agreement={a} last={last} onPress={() => router.push(`/agreements/${a.uuid}` as Href)} />
          )}
        />
      ) : (
        <EmptyState icon="security" title={t('forbidden')} />
      )}
    </>
  );
}

/** One agreement (read only): terms, payment and exposure, authorized people, sales and activity. */
export function AgreementScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['agreements', 'customers_app']);
  const can = useCan();
  const query = useAgreement(uuid);
  const refresh = useRefreshAgreement(uuid);
  const [refreshing, setRefreshing] = useState(false);
  const notFound = isApiError(query.error) && query.error.status === 404;
  if (!can(Permission.TenantAgreementsRead)) return <EmptyState icon="security" title={t('forbidden')} />;
  return (
    <>
      <Stack.Screen options={{ title: query.data?.code ?? t('detail_title') }} />
      {notFound && !query.data ? (
        <EmptyState icon="document" title={t('not_found')} />
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
          <QueryState query={query}>{(a) => <AgreementBody agreement={a} />}</QueryState>
        </Screen>
      )}
    </>
  );
}

function AgreementBody({ agreement: a }: { agreement: Agreement }) {
  const { t } = useTranslation(['agreements', 'customers_app']);
  const can = useCan();
  const longTerm = [
    a.monthly_km_allowance
      ? t('detail.km_month', { km: formatNumber(a.monthly_km_allowance) })
      : t('detail.km_unlimited'),
    a.maintenance_interval_days ? t('detail.maintenance_days', { days: a.maintenance_interval_days }) : null,
    a.maintenance_interval_km ? t('detail.maintenance_km', { km: formatNumber(a.maintenance_interval_km) }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Card>
        <View className="flex-row flex-wrap items-center gap-2">
          <StatusPill label={t(agreementStatusKey(a.status))} tone={AGREEMENT_STATUS_TONE[a.status]} />
          <StatusPill label={t(validityKey(a.validity))} tone={VALIDITY_TONE[a.validity]} />
        </View>
        <View className="gap-0.5">
          <Text variant="title">{a.name}</Text>
          <Text variant="footnote" tone="muted">
            {a.code} · {range(t, a.valid_from, a.valid_to)}
          </Text>
        </View>
      </Card>

      <View>
        <SectionHeader title={t('detail.terms')} />
        <List>
          <ListRow
            icon="customer"
            title={a.customer.display_name}
            subtitle={[t('fields.customer'), a.customer.identity_masked].filter(Boolean).join(' · ')}
            onPress={
              can(Permission.TenantCustomersRead)
                ? () => router.push(`/customers/${a.customer.uuid}` as Href)
                : undefined
            }
          />
          <Field label={t('fields.branch')}>
            {a.branch ? [a.branch.code, a.branch.name].filter(Boolean).join(' · ') : t('head_office')}
          </Field>
          <Field label={t('detail.long_term')}>{longTerm}</Field>
          <Field label={t('fields.notes')} last={!a.terminated_at}>
            {a.notes || '—'}
          </Field>
          {a.terminated_at ? (
            <Field label={t('detail.terminated')} last>
              {`${formatShort(a.terminated_at)} · ${a.termination_reason}`}
            </Field>
          ) : null}
        </List>
      </View>

      <View>
        <SectionHeader title={t('detail.payment')} />
        <List>
          <Field label={t('fields.invoice_period')}>
            <Text variant="callout">{t(invoicePeriodKey(a.invoice_period))}</Text>
            <Text variant="footnote" tone="muted">
              {t(`invoice_periods.${a.invoice_period}_hint`)}
            </Text>
          </Field>
          <Field label={t('fields.payment_term_days')}>
            <Text variant="callout">{t('days', { count: a.payment_term_days })}</Text>
            {a.account ? (
              <Text variant="footnote" tone="muted">
                {t('detail.account_term', { code: a.account.code, days: a.account.payment_term_days })}
              </Text>
            ) : null}
          </Field>
          <Field label={t('fields.open_account')}>
            {a.open_account
              ? t('detail.open_account_limit', { limit: formatMoney(a.credit_limit, a.currency) })
              : t('detail.prepayment_rules')}
          </Field>
          <Field label={t('fields.coupon_eligible')} last>
            {a.coupon_eligible ? t('detail.coupons_corporate') : t('detail.coupons_none')}
          </Field>
        </List>
        {a.exposure ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            {(
              [
                ['exposure.credit_limit', a.exposure.credit_limit],
                ['exposure.balance', a.exposure.balance],
                ['exposure.pending', a.exposure.pending],
                ['exposure.available', a.exposure.available],
              ] as const
            ).map(([key, value]) => (
              <View key={key} className="min-w-[45%] flex-1 gap-0.5 rounded-lg border border-border bg-card p-3">
                <Text variant="footnote" tone="muted">
                  {t(key)}
                </Text>
                <Text
                  variant="headline"
                  tone={key === 'exposure.available' && Number(value) < 0 ? 'danger' : 'default'}
                  className="tabular-nums">
                  {formatMoney(value, a.currency)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View>
        <SectionHeader title={t('contacts.title')} />
        {a.contacts.length ? (
          <List>
            {a.contacts.map((c, i) => (
              <ListRow
                key={c.uuid}
                icon="user"
                title={c.full_name}
                subtitle={[t(contactRoleKey(c.role)), c.title, c.phone_masked, c.email_masked]
                  .filter(Boolean)
                  .join(' · ')}
                last={i === a.contacts.length - 1}
              />
            ))}
          </List>
        ) : (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('contacts.empty')}
          </Text>
        )}
      </View>

      <View>
        <SectionHeader title={t('drivers.title')} />
        {a.drivers.length ? (
          <List>
            {a.drivers.map((d, i) => (
              <ListRow
                key={d.uuid}
                icon="user"
                title={d.name}
                subtitle={[
                  d.kind === 'customer' ? t('drivers.kind_customer') : t('drivers.kind_driver'),
                  d.owner,
                  d.licence_masked,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                last={i === a.drivers.length - 1}
              />
            ))}
          </List>
        ) : (
          <Text variant="footnote" tone="muted" className="px-1">
            {t('drivers.empty_description')}
          </Text>
        )}
      </View>

      <AgreementRentals uuid={a.uuid} />
      <AgreementActivity uuid={a.uuid} />
    </>
  );
}

/** Reservations / rentals sold with the agreement; opens the rental (or the reservation) summary. */
function AgreementRentals({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['agreements', 'customers_app']);
  const can = useCan();
  const rows = useAgreementRentals(uuid);
  return (
    <View>
      <SectionHeader title={t('rentals.title')} />
      <QueryState query={rows} rows={2}>
        {(data) =>
          data.items.length ? (
            <List>
              {data.items.slice(0, 20).map((r, i, all) => {
                const open = r.rental
                  ? can(Permission.TenantRentalsRead)
                    ? () => router.push(`/rentals/${r.rental?.uuid}` as Href)
                    : undefined
                  : can(Permission.TenantReservationsRead)
                    ? () => router.push(`/reservations/${r.reservation_uuid}` as Href)
                    : undefined;
                return (
                  <ListRow
                    key={r.reservation_uuid}
                    icon="car"
                    title={[r.reference, r.plate].filter(Boolean).join(' · ')}
                    subtitle={[
                      `${formatShort(r.starts_at)} – ${formatShort(r.ends_at)}`,
                      formatMoney(r.total, r.currency),
                      r.open_account ? t('rentals.open_account') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={open}
                    last={i === all.length - 1}
                  />
                );
              })}
            </List>
          ) : (
            <Text variant="footnote" tone="muted" className="px-1">
              {t('rentals.empty')}
            </Text>
          )
        }
      </QueryState>
    </View>
  );
}

function AgreementActivity({ uuid }: { uuid: string }) {
  const { t, i18n } = useTranslation(['agreements', 'customers_app']);
  const activity = useAgreementActivity(uuid);
  const describe = (action: string) => {
    const key = `activity:actions.${action}`;
    return i18n.exists(key) ? t(key) : action;
  };
  return (
    <View>
      <SectionHeader title={t('customers_app:activity_title')} />
      <QueryState query={activity} rows={2}>
        {(data) =>
          data.items.length ? (
            <List>
              {data.items.map((e, i) => (
                <ListRow
                  key={e.uuid}
                  icon="history"
                  title={describe(e.action)}
                  subtitle={`${formatShort(e.created_at)} · ${actorName(e.actor) ?? t('customers_app:system')}`}
                  last={i === data.items.length - 1}
                />
              ))}
            </List>
          ) : (
            <Text variant="footnote" tone="muted" className="px-1">
              {t('customers_app:activity_empty')}
            </Text>
          )
        }
      </QueryState>
    </View>
  );
}
