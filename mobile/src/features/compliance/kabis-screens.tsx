import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { useHasFeature } from '@/core/tenant';
import { useDebounced } from '@/core/use-debounced';
import { Gate, Lines } from '@/features/reservations/parts';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen, Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { kabisErrorText, useKabis, useKabisFacets, useKabisList, useResolveKabis, useRetryKabis } from './api';
import {
  holdText,
  KABIS_STATUSES,
  kabisAlarming,
  kabisEventText,
  kabisListQuery,
  missingFieldText,
  resolveValid,
  retryToastKey,
  type KabisDetail,
  type KabisFilter,
  type KabisResolution,
} from './lib';
import { KabisRow, KabisStatusChip, OfficialChip } from './parts';

/**
 * "KABİS bildirimleri" (the panel's `/kabis`): search, "needs action" and
 * status filters, newest event first. Every row that is not "reported",
 * "reported manually" or "reconciled" is a local record only.
 */
export function KabisListScreen() {
  const { t } = useTranslation('kabis');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Gate perm={Permission.TenantKabisRead} body={t('forbidden')}>
        <KabisList />
      </Gate>
    </>
  );
}

function KabisList() {
  const { t } = useTranslation('compliance_app');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<KabisFilter>('all');
  const search = useDebounced(q);
  const query = useKabisList(useMemo(() => kabisListQuery({ q: search, filter }), [search, filter]));
  const facets = useKabisFacets().data;
  const filtered = !!search.trim() || filter !== 'all';
  return (
    <PagedList
      query={query}
      keyOf={(n) => n.uuid}
      empty={filtered ? t('kabis:empty_filtered_title') : t('kabis:empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('kabis_search')} />
          <Chips
            options={[
              { value: 'all' as const, label: t('common:all') },
              {
                value: 'needs_action' as const,
                label: facets?.needs_action ? `${t('needs_action')} (${facets.needs_action})` : t('needs_action'),
              },
              ...KABIS_STATUSES.map((s) => ({ value: s, label: t(`kabis:statuses.${s}`) })),
            ]}
            value={filter}
            onChange={setFilter}
          />
          <Text variant="footnote" tone="muted" className="px-1">
            {t('kabis:official_note')}
          </Text>
        </>
      }
      renderItem={(n) => <KabisRow item={n} />}
    />
  );
}

/**
 * One notification (the panel's KABİS detail): state and why it waits or
 * what is missing, the reported facts, the staff resolution and every
 * provider call; retry / mark manual / reconcile as the API offers them.
 */
export function KabisDetailScreen() {
  const { t } = useTranslation('kabis');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const query = useKabis(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('detail.title') }} />
      <Gate perm={Permission.TenantKabisRead} body={t('forbidden')}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query} rows={4}>
            {(n) => <KabisDetailBody n={n} />}
          </QueryState>
        </Screen>
      </Gate>
    </>
  );
}

function str(v: unknown) {
  return typeof v === 'string' ? v : '';
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

function KabisDetailBody({ n }: { n: KabisDetail }) {
  const { t } = useTranslation('compliance_app');
  const hasFeature = useHasFeature();
  const retry = useRetryKabis(n.uuid);
  const place = obj(n.summary.place);
  const vehicle = obj(n.summary.vehicle);
  const canRetry = n.actions.retry && hasFeature('kabis');
  return (
    <>
      <View className="gap-2">
        <Text variant="title">{`${kabisEventText(t, n.event, n.sequence)} · ${n.rental.reference ?? ''}`}</Text>
        <Text variant="callout" tone="muted">
          {[formatShort(n.occurred_at), n.plate, n.branch.name].filter(Boolean).join(' · ')}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          <KabisStatusChip status={n.status} />
          <OfficialChip status={n.status} />
        </View>
      </View>

      <Card className={kabisAlarming(n.status) ? 'border-destructive' : undefined}>
        <Text variant="headline" tone={kabisAlarming(n.status) ? 'danger' : 'default'}>
          {t(`kabis:statuses.${n.status}`)}
        </Text>
        <Text variant="callout">{t(`kabis:status_hints.${n.status}`)}</Text>
        {n.status === 'waiting_dependency' && n.hold_reason ? (
          <Text variant="callout">{holdText(t, n.hold_reason)}</Text>
        ) : null}
        {n.missing_fields.map((f) => (
          <Text key={f} variant="callout">
            {`• ${missingFieldText(t, f)}`}
          </Text>
        ))}
      </Card>

      {canRetry || n.actions.mark_manual || n.actions.reconcile ? (
        <View className="gap-2">
          {canRetry ? (
            <Button
              title={n.actions.revalidates ? t('kabis:actions.revalidate') : t('kabis:actions.retry')}
              icon="refresh"
              loading={retry.isPending}
              onPress={() =>
                retry.mutate(undefined, {
                  onSuccess: (r) => toast.success(t(retryToastKey(r.action))),
                  onError: (e) => toast.error(kabisErrorText(e)),
                })
              }
            />
          ) : null}
          {n.actions.mark_manual ? (
            <Button
              title={t('kabis:actions.mark_manual')}
              variant="outline"
              icon="document"
              onPress={() => router.push({ pathname: '/kabis/[uuid]/mark-manual', params: { uuid: n.uuid } })}
            />
          ) : null}
          {n.actions.reconcile ? (
            <Button
              title={t('kabis:actions.reconcile')}
              variant="outline"
              icon="check"
              onPress={() => router.push({ pathname: '/kabis/[uuid]/reconcile', params: { uuid: n.uuid } })}
            />
          ) : null}
        </View>
      ) : null}

      <List>
        <ListRow
          icon="car"
          title={t('open_rental')}
          subtitle={n.rental.reference}
          onPress={() => router.push({ pathname: '/rentals/[uuid]', params: { uuid: n.rental.uuid } })}
          last={!n.corrects_uuid}
        />
        {n.corrects_uuid ? (
          <ListRow
            icon="history"
            title={t('kabis:fields.corrects')}
            subtitle={t('kabis:fields.open_corrected')}
            onPress={() => router.push({ pathname: '/kabis/[uuid]', params: { uuid: n.corrects_uuid! } })}
            last
          />
        ) : null}
      </List>

      <Card title={t('kabis:detail.state')}>
        <Lines
          lines={[
            {
              label: t('kabis:columns.attempts'),
              value: t('attempts_count', { attempts: n.attempts, max: n.max_attempts }),
            },
            {
              label: t('kabis:fields.next_attempt_at'),
              value: n.next_attempt_at ? formatShort(n.next_attempt_at) : null,
            },
            {
              label: t('kabis:columns.last_verified_at'),
              value: n.last_verified_at ? formatShort(n.last_verified_at) : t('kabis:fields.never_verified'),
            },
            { label: t('kabis:columns.external_reference'), value: n.external_reference || null },
            { label: t('kabis:fields.adapter'), value: n.account?.name ?? n.provider },
            { label: t('kabis:fields.cause'), value: n.cause ? t(`kabis:causes.${n.cause}`) : null },
            { label: t('kabis:columns.last_error'), value: n.last_error || null },
          ]}
        />
      </Card>

      <Card title={t('kabis:detail.facts')}>
        <Lines
          lines={[
            { label: t('kabis:columns.occurred_at'), value: formatShort(n.occurred_at) },
            {
              label: t('kabis:fields.place'),
              value:
                [str(place.name), str(place.point), str(place.district), str(place.city)].filter(Boolean).join(' · ') ||
                n.branch.name ||
                null,
            },
            { label: t('kabis:fields.address'), value: str(place.address) || null },
            { label: t('kabis:columns.plate'), value: n.plate || null },
            {
              label: t('kabis:fields.vehicle'),
              value: str(vehicle.brand_model) || null,
            },
          ]}
        />
      </Card>

      {n.resolution ? (
        <Card title={t('kabis:detail.resolution')}>
          <Lines
            lines={[
              { label: t('kabis:fields.resolution'), value: t(`kabis:statuses.${n.resolution}`) },
              { label: t('kabis:fields.reference'), value: n.resolution_reference || null },
              { label: t('kabis:fields.reason'), value: n.resolution_reason || null },
              {
                label: t('kabis:fields.resolved_by'),
                value:
                  [
                    n.resolved_by ? `${n.resolved_by.name} ${n.resolved_by.surname}`.trim() : '',
                    n.resolved_at ? formatShort(n.resolved_at) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || null,
              },
              { label: t('kabis:fields.attachment'), value: n.attachment?.name ?? null },
            ]}
          />
        </Card>
      ) : null}

      <Card title={t('kabis:detail.attempts')}>
        <Text variant="footnote" tone="muted">
          {t('kabis:detail.no_blind_retry')}
        </Text>
        {n.attempt_log.map((a) => (
          <View key={a.uuid} className="gap-0.5 border-t border-border pt-2">
            <Text variant="callout" className="font-sans-semibold">
              {`${t('attempt_line', { n: a.attempt_no })} · ${t(`operations.${a.operation}`)} · ${t(`outcomes.${a.outcome}`)}`}
            </Text>
            <Text variant="footnote" tone="muted">
              {formatShort(a.started_at)}
            </Text>
            {a.error ? (
              <Text variant="footnote" tone="danger">
                {a.error}
              </Text>
            ) : null}
          </View>
        ))}
      </Card>
    </>
  );
}

/**
 * "Manuel bildirildi" / "Uzlaştır" (`tenant.kabis.reconcile`): the official
 * reference and a reason; the receipt attachment stays on the panel.
 */
export function KabisResolveScreen({ action }: { action: KabisResolution }) {
  const { t } = useTranslation('kabis');
  const manual = action === 'mark-manual';
  return (
    <>
      <Stack.Screen options={{ title: manual ? t('resolve.manual_title') : t('resolve.reconcile_title') }} />
      <Gate perm={Permission.TenantKabisReconcile} body={t('forbidden')}>
        <ResolveForm action={action} />
      </Gate>
    </>
  );
}

function ResolveForm({ action }: { action: KabisResolution }) {
  const { t } = useTranslation('compliance_app');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const resolve = useResolveKabis(uuid, action);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const manual = action === 'mark-manual';
  const valid = resolveValid(reason, reference);
  const err = formErrors(resolve.error);
  const problem = resolve.error ? kabisErrorText(resolve.error) : null;
  return (
    <FormScreen
      footer={
        <>
          {problem && !Object.keys(err.fields).length ? (
            <Text variant="footnote" tone="danger">
              {problem}
            </Text>
          ) : null}
          <Button
            title={manual ? t('kabis:actions.mark_manual') : t('kabis:actions.reconcile')}
            size="lg"
            disabled={!valid.reason || !valid.reference}
            loading={resolve.isPending}
            onPress={() =>
              resolve.mutate(
                { reason: reason.trim(), reference: reference.trim() },
                {
                  onSuccess: () => {
                    toast.success(t(manual ? 'kabis:toast.marked_manual' : 'kabis:toast.reconciled'));
                    if (router.canGoBack()) router.back();
                  },
                },
              )
            }
          />
        </>
      }>
      <Text tone="muted">
        {manual ? t('kabis:resolve.manual_description') : t('kabis:resolve.reconcile_description')}
      </Text>
      <Input
        label={t('kabis:fields.reference')}
        hint={t('kabis:fields.reference_hint')}
        value={reference}
        onChangeText={setReference}
        maxLength={120}
        autoCapitalize="characters"
        error={err.fields.reference}
        autoFocus
      />
      <TextArea
        label={t('kabis:fields.reason')}
        hint={t('kabis:fields.reason_hint')}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        error={err.fields.reason}
      />
      <Text variant="footnote" tone="muted">
        {t('attachment_web')}
      </Text>
    </FormScreen>
  );
}
