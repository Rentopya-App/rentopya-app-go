import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, RefreshControl, View } from 'react-native';

import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatMoney, formatShort } from '@/core/format';
import { useDebounced } from '@/core/use-debounced';
import { Gate, Lines } from '@/features/reservations/parts';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { TextArea } from '@/ui/fields';
import { Icon } from '@/ui/icon';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen, Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  tollErrorText,
  tollProblem,
  useAssignToll,
  useRentalSearch,
  useTollCandidates,
  useTollDecision,
  useTollFacets,
  useTollPass,
  useTollPasses,
} from './api';
import {
  REVIEW_STATUSES,
  sortCandidates,
  stationText,
  TOLL_STATUSES,
  tollActions,
  tollListQuery,
  type TollDecision,
  type TollFilter,
  type TollPassDetail,
} from './lib';
import { CountBadge, TollRow, TollStatusChip } from './parts';

const DECISION_ROUTES = {
  unassign: '/tolls/[uuid]/unassign',
  ignore: '/tolls/[uuid]/ignore',
  rematch: '/tolls/[uuid]/rematch',
} as const;

function back() {
  if (router.canGoBack()) router.back();
}

/**
 * "HGS/OGS geçişleri" (the panel's `/tolls`) and the review queue
 * (`/tolls/review`: unmatched + needs review, oldest first): search and
 * status filter; the full list links the queue with its count.
 */
export function TollPassesScreen({ review }: { review: boolean }) {
  const { t } = useTranslation('tolls');
  return (
    <>
      <Stack.Screen options={{ title: review ? t('review.title') : t('title') }} />
      <Gate perm={Permission.TenantTollsRead} body={t('forbidden')}>
        <TollList review={review} />
      </Gate>
    </>
  );
}

function TollList({ review }: { review: boolean }) {
  const { t } = useTranslation('compliance_app');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<TollFilter>('all');
  const search = useDebounced(q);
  const query = useTollPasses(useMemo(() => tollListQuery({ q: search, filter, review }), [search, filter, review]));
  const facets = useTollFacets(!review).data;
  const filtered = !!search.trim() || filter !== 'all';
  const statuses = review ? REVIEW_STATUSES : TOLL_STATUSES;
  return (
    <PagedList
      query={query}
      keyOf={(p) => p.uuid}
      empty={
        filtered ? t('tolls:empty_filtered_title') : review ? t('tolls:review.empty_title') : t('tolls:empty_title')
      }
      header={
        <>
          {!review ? (
            <List>
              <ListRow
                icon="inbox"
                title={t('tolls:review.title')}
                onPress={() => router.push('/tolls/review')}
                trailing={facets?.review ? <CountBadge count={facets.review} /> : undefined}
                last
              />
            </List>
          ) : (
            <Text variant="footnote" tone="muted" className="px-1">
              {t('tolls:review.description')}
            </Text>
          )}
          <SearchField value={q} onChangeText={setQ} placeholder={t('tolls_search')} />
          <Chips
            options={[
              { value: 'all' as const, label: t('common:all') },
              ...statuses.map((s) => ({ value: s, label: t(`tolls:statuses.${s}`) })),
            ]}
            value={filter}
            onChange={setFilter}
          />
        </>
      }
      renderItem={(p) => <TollRow item={p} />}
    />
  );
}

/**
 * One pass (the panel's toll detail): facts, the match (vehicle, rental,
 * method, decision), charges and the timeline; assign / unassign / ignore /
 * rematch for `tenant.tolls.review`.
 */
export function TollPassDetailScreen() {
  const { t } = useTranslation('tolls');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const query = useTollPass(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('detail.title') }} />
      <Gate perm={Permission.TenantTollsRead} body={t('forbidden')}>
        <Screen
          refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
          <QueryState query={query} rows={4}>
            {(p) => <TollDetailBody p={p} />}
          </QueryState>
        </Screen>
      </Gate>
    </>
  );
}

function TollDetailBody({ p }: { p: TollPassDetail }) {
  const { t } = useTranslation('compliance_app');
  const can = useCan();
  const actions = tollActions(p, can(Permission.TenantTollsReview));
  return (
    <>
      <View className="gap-2">
        <Text variant="title">{stationText(p) || p.external_id}</Text>
        <Text variant="figure">{formatMoney(p.amount, p.currency || 'TRY')}</Text>
        {p.fee_amount ? (
          <Text variant="footnote" tone="muted">
            {t('tolls:fee_short', { amount: formatMoney(p.fee_amount, p.currency || 'TRY') })}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-1.5">
          <TollStatusChip status={p.status} />
          {p.review_reason ? <StatusPill label={t(`tolls:review_reasons.${p.review_reason}`)} tone="problem" /> : null}
          {p.manual ? <StatusPill label={t('tolls:manual_badge')} /> : null}
          {p.revision > 1 ? <StatusPill label={t('tolls:revision_badge', { revision: p.revision })} /> : null}
        </View>
      </View>

      {actions.length ? (
        <View className="gap-2">
          {actions.map((a) =>
            a === 'assign' || a === 'reassign' ? (
              <Button
                key={a}
                title={t(`tolls:actions.${a}`)}
                icon="link"
                onPress={() => router.push({ pathname: '/tolls/[uuid]/assign', params: { uuid: p.uuid } })}
              />
            ) : (
              <Button
                key={a}
                title={t(`tolls:actions.${a}`)}
                variant="outline"
                icon={a === 'ignore' ? 'cancel' : a === 'rematch' ? 'refresh' : 'remove'}
                onPress={() => router.push({ pathname: DECISION_ROUTES[a], params: { uuid: p.uuid } })}
              />
            ),
          )}
        </View>
      ) : null}

      {p.vehicle || p.rental ? (
        <List>
          {p.vehicle ? (
            <ListRow
              icon="car"
              title={t('open_vehicle')}
              subtitle={p.vehicle.plate}
              onPress={() => router.push({ pathname: '/vehicle/[uuid]', params: { uuid: p.vehicle!.uuid } })}
              last={!p.rental}
            />
          ) : null}
          {p.rental ? (
            <ListRow
              icon="document"
              title={t('open_rental')}
              subtitle={p.rental.reference}
              onPress={() => router.push({ pathname: '/rentals/[uuid]', params: { uuid: p.rental!.uuid } })}
              last
            />
          ) : null}
        </List>
      ) : null}

      <Card title={t('tolls:detail.facts')}>
        <Lines
          lines={[
            { label: t('tolls:columns.passed_at'), value: formatShort(p.passed_at) },
            { label: t('tolls:columns.plate'), value: p.plate || null },
            { label: t('tolls:columns.tag_number'), value: p.tag_number || null },
            { label: t('tolls:columns.station'), value: stationText(p) || null },
            { label: t('tolls:columns.external_id'), value: p.external_id },
            { label: t('tolls:fields.provider'), value: `${p.provider} · ${t(`tolls:sources.${p.source}`)}` },
            { label: t('tolls:fields.account'), value: p.account?.display_name ?? null },
            { label: t('tolls:fields.last_fetched_at'), value: formatShort(p.last_fetched_at) },
          ]}
        />
      </Card>

      <Card title={t('tolls:detail.match')}>
        <Lines
          lines={[
            { label: t('tolls:fields.vehicle'), value: p.vehicle?.plate ?? t('tolls:detail.no_vehicle') },
            { label: t('tolls:columns.rental'), value: p.rental?.reference ?? t('tolls:no_rental_yet') },
            {
              label: t('tolls:fields.match_method'),
              value: p.match_method ? t(`tolls:match_methods.${p.match_method}`) : null,
            },
            {
              label: t('tolls:fields.decided'),
              value:
                [p.decided_by?.name, p.decided_at ? formatShort(p.decided_at) : ''].filter(Boolean).join(' · ') || null,
            },
          ]}
        />
      </Card>

      <Card title={t('tolls:charges.title')}>
        {p.charges.length ? (
          p.charges.map((c) => (
            <View key={c.uuid} className="flex-row items-start gap-2 border-t border-border pt-2">
              <View className="flex-1 gap-0.5">
                <Text variant="callout">
                  {`${t(`tolls:charges.kinds.${c.kind}`)} · ${c.rental.reference}`}
                  {c.reversal_of_uuid ? ` · ${t('tolls:charges.reversal')}` : ''}
                </Text>
                <Text variant="footnote" tone="muted">
                  {[formatShort(c.created_at), c.reason].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text variant="callout" className="tabular-nums">
                {formatMoney(c.amount, c.currency || 'TRY')}
              </Text>
            </View>
          ))
        ) : (
          <Text variant="callout" tone="muted">
            {t('tolls:charges.empty')}
          </Text>
        )}
      </Card>

      <Card title={t('tolls:detail.timeline')}>
        {p.events.map((e) => (
          <View key={e.uuid} className="gap-0.5 border-t border-border pt-2">
            <Text variant="callout" className="font-sans-semibold">
              {t(`tolls:events.${e.action}`)}
            </Text>
            <Text variant="footnote" tone="muted">
              {[formatShort(e.created_at), e.actor?.name].filter(Boolean).join(' · ')}
            </Text>
            {e.reason ? <Text variant="footnote">{e.reason}</Text> : null}
          </View>
        ))}
      </Card>
    </>
  );
}

/** Unassign / ignore / rematch with the mandatory reason (`tenant.tolls.review`). */
export function TollDecisionScreen({ action }: { action: TollDecision }) {
  const { t } = useTranslation('tolls');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const decision = useTollDecision(uuid, action);
  const toastKey = { unassign: 'toast.unassigned', ignore: 'toast.ignored', rematch: 'toast.rematched' }[action];
  return (
    <>
      <Stack.Screen options={{ title: t(`decisions.${action}_title`) }} />
      <Gate perm={Permission.TenantTollsReview} body={t('forbidden')}>
        <ReasonForm
          description={t(`decisions.${action}_description`)}
          label={t('fields.reason')}
          submitTitle={t(`actions.${action}`)}
          destructive={action === 'ignore'}
          pending={decision.isPending}
          error={decision.error}
          onSubmit={(reason) =>
            decision.mutate(reason, {
              onSuccess: () => {
                toast.success(t(toastKey));
                back();
              },
              onError: (e) => {
                const problem = tollProblem(e);
                if (problem) toast.error(problem);
              },
            })
          }
        />
      </Gate>
    </>
  );
}

/**
 * Assign a pass to a rental: the vehicle's rentals around the pass time
 * ("contains the pass" first), or a search over delivered / returned
 * rentals; a mandatory reason. The server reverses the old charge.
 */
export function TollAssignScreen() {
  const { t } = useTranslation('tolls');
  return (
    <>
      <Stack.Screen options={{ title: t('assign.title') }} />
      <Gate perm={Permission.TenantTollsReview} body={t('forbidden')}>
        <AssignForm />
      </Gate>
    </>
  );
}

function PickRow({
  selected,
  title,
  subtitle,
  badge,
  onPress,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  badge?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      className="flex-row items-center gap-3 border-b border-border px-4 py-3 active:bg-muted">
      <Icon name={selected ? 'check' : 'add'} tone={selected ? 'primary' : 'muted-foreground'} size={20} />
      <View className="flex-1 gap-0.5">
        <Text variant="callout" className="font-sans-semibold">
          {title}
        </Text>
        <Text variant="footnote" tone="muted" numberOfLines={2}>
          {subtitle}
        </Text>
        {badge ? <StatusPill label={badge} tone="done" /> : null}
      </View>
    </Pressable>
  );
}

function AssignForm() {
  const { t } = useTranslation('compliance_app');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const pass = useTollPass(uuid);
  const candidates = useTollCandidates(uuid);
  const assign = useAssignToll(uuid);
  const [q, setQ] = useState('');
  const search = useDebounced(q);
  const found = useRentalSearch(search, true);
  const [picked, setPicked] = useState<{ uuid: string; reference: string } | null>(null);
  const [reason, setReason] = useState('');
  const err = formErrors(assign.error);
  const ok = !!picked && reason.trim().length >= 3 && reason.trim().length <= 500;
  const items = sortCandidates(candidates.data?.items ?? []).filter((c) => c.uuid !== pass.data?.rental?.uuid);
  return (
    <FormScreen
      footer={
        <>
          {assign.error ? (
            <Text variant="footnote" tone="danger">
              {tollErrorText(assign.error)}
            </Text>
          ) : null}
          <Text variant="footnote" tone="muted">
            {picked ? t('selected_rental', { reference: picked.reference }) : t('pick_rental')}
          </Text>
          <Button
            title={t('tolls:actions.assign')}
            size="lg"
            disabled={!ok}
            loading={assign.isPending}
            onPress={() =>
              picked &&
              assign.mutate(
                { rental_uuid: picked.uuid, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(t('tolls:toast.assigned'));
                    back();
                  },
                },
              )
            }
          />
        </>
      }>
      <Text tone="muted">{t('tolls:assign.description')}</Text>
      {pass.data ? (
        <Card>
          <Text variant="callout" className="font-sans-semibold">
            {`${stationText(pass.data)} · ${formatMoney(pass.data.amount, pass.data.currency || 'TRY')}`}
          </Text>
          <Text variant="footnote" tone="muted">
            {[formatShort(pass.data.passed_at), pass.data.plate || pass.data.tag_number, pass.data.external_id]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </Card>
      ) : null}

      <Text variant="caption" tone="muted">
        {t('tolls:assign.candidates')}
      </Text>
      <QueryState query={candidates} rows={2}>
        {() =>
          items.length ? (
            <View className="overflow-hidden rounded-lg border border-border bg-card">
              {items.map((c) => (
                <PickRow
                  key={c.uuid}
                  selected={picked?.uuid === c.uuid}
                  title={c.reference}
                  subtitle={[
                    c.customer,
                    `${formatShort(c.actual_pickup_at ?? c.planned_pickup_at)} → ${formatShort(c.actual_return_at ?? c.planned_return_at)}`,
                    c.actual_pickup_at ? '' : t('tolls:assign.planned'),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  badge={c.contains_pass ? t('tolls:assign.contains_pass') : undefined}
                  onPress={() => setPicked({ uuid: c.uuid, reference: c.reference })}
                />
              ))}
            </View>
          ) : (
            <Text variant="callout" tone="muted">
              {`${t('tolls:assign.no_candidates')}. ${t('tolls:assign.no_candidates_hint')}`}
            </Text>
          )
        }
      </QueryState>

      <Text variant="caption" tone="muted">
        {t('tolls:assign.search_label')}
      </Text>
      <SearchField value={q} onChangeText={setQ} placeholder={t('tolls:assign.search_hint')} />
      {search.trim() && found.data ? (
        found.data.length ? (
          <View className="overflow-hidden rounded-lg border border-border bg-card">
            {found.data.map((r) => (
              <PickRow
                key={r.uuid}
                selected={picked?.uuid === r.uuid}
                title={`${r.reference} · ${r.vehicle.plate}`}
                subtitle={r.customer.display_name}
                onPress={() => setPicked({ uuid: r.uuid, reference: r.reference })}
              />
            ))}
          </View>
        ) : (
          <Text variant="callout" tone="muted">
            {t('tolls:assign.search_empty')}
          </Text>
        )
      ) : null}

      <TextArea
        label={t('tolls:fields.reason')}
        hint={t('tolls:fields.reason_hint')}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        error={err.fields.reason}
      />
    </FormScreen>
  );
}
