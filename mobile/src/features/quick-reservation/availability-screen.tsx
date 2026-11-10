import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Permission, useCan } from '@/core/auth/permissions';
import { displayTimeZone, formatShort } from '@/core/format';
import { confirmStep, Gate } from '@/features/reservations/parts';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { List, ListRow } from '@/ui/list';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { capacityOf, useAvailabilitySearch, useCreateHold, useExtendHold, useHolds, useReleaseHold } from './api';
import {
  canHold,
  capacityReasonKey,
  DEFAULT_HOLD_MINUTES,
  defaultRange,
  holdActions,
  holdMinutesValid,
  searchError,
  searchRequest,
  type AvailabilityHold,
  type AvailabilityProduct,
  type CapacityProblem,
  type SearchForm,
  type SearchRequest,
} from './lib';
import { ProblemBox, SearchFields } from './parts';

export function initialForm(zone: string): SearchForm {
  const r = defaultRange(zone);
  return {
    pickup: '',
    ret: '',
    startDay: r.start.day,
    startTime: r.start.time,
    endDay: r.end.day,
    endTime: r.end.time,
  };
}

/**
 * "Müsaitlik" (the panel's `/availability`): sellable capacity per product
 * for a branch and range, "Opsiyon koy" on a product, and a link to the
 * active holds. The search consumes no capacity.
 */
export function AvailabilityScreen() {
  const { t } = useTranslation('availability');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Gate perm={Permission.TenantAvailabilityRead} body={t('forbidden')}>
        <AvailabilityBody />
      </Gate>
    </>
  );
}

function AvailabilityBody() {
  const { t } = useTranslation('availability');
  const zone = displayTimeZone();
  const can = useCan();
  const [form, setForm] = useState<SearchForm>(() => initialForm(zone));
  const [tried, setTried] = useState(false);
  const [request, setRequest] = useState<SearchRequest | null>(null);
  const [target, setTarget] = useState<AvailabilityProduct | null>(null);
  const search = useAvailabilitySearch(request);
  const error = tried ? searchError(form, zone) : null;

  return (
    <FormScreen>
      <Text tone="muted">{t('quick_reservation:availability_hint', { zone })}</Text>
      <SearchFields form={form} onChange={setForm} error={error} />
      <Button
        icon="search"
        title={t('actions.search')}
        loading={search.isFetching}
        onPress={() => {
          setTried(true);
          setTarget(null);
          const next = searchRequest(form, zone);
          if (next) setRequest(next);
        }}
      />
      <List>
        <ListRow icon="clock" title={t('holds.title')} onPress={() => router.push('/availability/holds')} last />
      </List>
      {request ? (
        <QueryState query={search} rows={3}>
          {(data) => (
            <View className="gap-3">
              <Text variant="footnote" tone="muted">
                {t('results_summary', {
                  pickup: data.request.pickup_branch.code,
                  return: data.request.return_branch.code,
                  ready: formatShort(data.request.ready_at),
                  prep: data.request.prep_minutes,
                })}
              </Text>
              {data.items.length === 0 ? (
                <View className="gap-1 px-1">
                  <Text variant="headline">{t('results_empty_title')}</Text>
                  <Text tone="muted">{t('results_empty_description')}</Text>
                </View>
              ) : null}
              {data.items.map((item) =>
                target?.product.uuid === item.product.uuid ? (
                  <HoldPanel
                    key={item.product.uuid}
                    item={item}
                    request={request}
                    onClose={() => setTarget(null)}
                    onPickProduct={(uuid) => setTarget(data.items.find((i) => i.product.uuid === uuid) ?? null)}
                    onPickRange={(startsAt, endsAt) => {
                      setTarget(null);
                      setRequest({ ...request, starts_at: startsAt, ends_at: endsAt });
                    }}
                  />
                ) : (
                  <ProductCard
                    key={item.product.uuid}
                    item={item}
                    onHold={canHold(item, can) ? () => setTarget(item) : undefined}
                  />
                ),
              )}
            </View>
          )}
        </QueryState>
      ) : (
        <View className="gap-1 px-1">
          <Text variant="headline">{t('start_title')}</Text>
          <Text tone="muted">{t('start_description')}</Text>
        </View>
      )}
    </FormScreen>
  );
}

function breakdownText(t: (k: string) => string, item: AvailabilityProduct) {
  const b = item.breakdown;
  return [
    `${t('breakdown.free')} ${b.free}`,
    `${t('breakdown.reserved')} ${b.reserved}`,
    `${t('breakdown.held')} ${b.held}`,
    b.elsewhere ? `${t('breakdown.elsewhere')} ${b.elsewhere}` : null,
    b.reassignable ? `${t('breakdown.reassignable')} ${b.reassignable}` : null,
    b.safety_margin ? `${t('breakdown.safety_margin')} ${b.safety_margin}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ProductCard({ item, onHold }: { item: AvailabilityProduct; onHold?: () => void }) {
  const { t } = useTranslation('availability');
  return (
    <Card>
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-sans-semibold" numberOfLines={2}>
          {`${item.product.code} · ${item.product.title}`}
        </Text>
        <StatusPill label={`${t('columns.sellable')} ${item.sellable}`} tone={item.sellable > 0 ? 'done' : 'problem'} />
      </View>
      <Text variant="footnote" tone="muted">
        {breakdownText(t, item)}
      </Text>
      {item.reasons.map((r) => (
        <Text key={r} variant="footnote" tone="danger">
          {t(`reason.${r}`)}
        </Text>
      ))}
      {onHold ? <Button variant="outline" icon="clock" title={t('actions.hold')} onPress={onHold} /> : null}
    </Card>
  );
}

/** "Opsiyon koy" on one product (the panel's `HoldDialog`), with the alternatives of a refused hold. */
function HoldPanel({
  item,
  request,
  onClose,
  onPickProduct,
  onPickRange,
}: {
  item: AvailabilityProduct;
  request: SearchRequest;
  onClose: () => void;
  onPickProduct: (uuid: string) => void;
  onPickRange: (startsAt: string, endsAt: string) => void;
}) {
  const { t } = useTranslation('availability');
  const create = useCreateHold();
  const [minutes, setMinutes] = useState(String(DEFAULT_HOLD_MINUTES));
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<CapacityProblem | null>(null);
  const valid = holdMinutesValid(minutes);
  const alt = problem?.alternatives;
  return (
    <Card title={t('hold_dialog.title')} className="border-primary">
      <Text className="font-sans-semibold">{`${item.product.code} · ${item.product.title}`}</Text>
      <Text variant="footnote" tone="muted">
        {`${formatShort(request.starts_at)} → ${formatShort(request.ends_at)} · ${t('hold_dialog.sellable', { count: item.sellable })}`}
      </Text>
      <Text variant="footnote" tone="muted">
        {t('hold_dialog.description')}
      </Text>
      {problem ? (
        <ProblemBox title={t('hold_dialog.unavailable')} body={t(capacityReasonKey(problem.reason))}>
          {alt?.products.map((p) => (
            <Button
              key={p.product.uuid}
              variant="outline"
              title={`${p.product.code} (${p.sellable})`}
              onPress={() => onPickProduct(p.product.uuid)}
            />
          ))}
          {alt?.times.map((x) => (
            <Button
              key={x.starts_at}
              variant="outline"
              title={`${formatShort(x.starts_at)} → ${formatShort(x.ends_at)} (${x.sellable})`}
              onPress={() => onPickRange(x.starts_at, x.ends_at)}
            />
          ))}
        </ProblemBox>
      ) : null}
      <Input
        label={t('fields.hold_minutes')}
        hint={t('fields.hold_minutes_hint')}
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
        error={valid ? undefined : t('validation.hold_minutes')}
      />
      <TextArea label={t('fields.note')} value={note} onChangeText={setNote} maxLength={2000} />
      <Button
        icon="check"
        title={t('actions.hold')}
        disabled={!valid}
        loading={create.isPending}
        onPress={() => {
          setProblem(null);
          create.mutate(
            { ...request, product_uuid: item.product.uuid, hold_minutes: Number(minutes), note: note.trim() },
            {
              onSuccess: (res) => {
                toast.success(
                  t('toast.held', {
                    plate: res.allocation.vehicle.plate,
                    expires: res.allocation.expires_at ? formatShort(res.allocation.expires_at) : '—',
                  }),
                );
                onClose();
              },
              onError: (e) => {
                const p = capacityOf(e);
                if (p) setProblem(p);
                else toast.error(apiErrorMessage(e));
              },
            },
          );
        }}
      />
      <Button variant="ghost" title={t('common:cancel')} onPress={onClose} />
    </Card>
  );
}

// ---------------------------------------------------------------- holds

/** "Aktif opsiyonlar" (the panel's holds table): extend or release an active hold. */
export function HoldsScreen() {
  const { t } = useTranslation('availability');
  return (
    <>
      <Stack.Screen options={{ title: t('holds.title') }} />
      <Gate perm={Permission.TenantAvailabilityRead} body={t('forbidden')}>
        <HoldsList />
      </Gate>
    </>
  );
}

function HoldsList() {
  const { t } = useTranslation('availability');
  const query = useHolds();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <PagedList
      query={query}
      keyOf={(h) => h.uuid}
      empty={t('holds.empty_title')}
      header={
        <Text variant="footnote" tone="muted">
          {t('holds.empty_description')}
        </Text>
      }
      renderItem={(h) => (
        <HoldRow hold={h} open={open === h.uuid} onToggle={() => setOpen(open === h.uuid ? null : h.uuid)} />
      )}
    />
  );
}

function HoldRow({ hold, open, onToggle }: { hold: AvailabilityHold; open: boolean; onToggle: () => void }) {
  const { t } = useTranslation('availability');
  const can = useCan();
  const actions = holdActions(hold, can);
  const extend = useExtendHold();
  const release = useReleaseHold();
  const [minutes, setMinutes] = useState(String(DEFAULT_HOLD_MINUTES));
  const valid = holdMinutesValid(minutes);
  return (
    <View className="gap-2 border-b border-border bg-card px-4 py-3">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Text className="font-sans-semibold">{hold.vehicle.plate}</Text>
        <StatusPill
          label={hold.plate_fixed ? t('holds.plate_fixed') : t('holds.plate_provisional')}
          tone={hold.plate_fixed ? 'done' : 'neutral'}
        />
      </View>
      <Text variant="callout" numberOfLines={1}>{`${hold.product.code} · ${hold.product.title}`}</Text>
      <Text variant="footnote" tone="muted">
        {[
          `${hold.pickup_branch.code}${hold.return_branch.uuid !== hold.pickup_branch.uuid ? ` → ${hold.return_branch.code}` : ''}`,
          `${formatShort(hold.starts_at)} → ${formatShort(hold.ends_at)}`,
        ].join(' · ')}
      </Text>
      <Text variant="footnote" tone="muted">
        {[
          hold.expires_at ? `${t('holds.columns.expires_at')}: ${formatShort(hold.expires_at)}` : null,
          hold.note || null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {actions.extend ? (
        open ? (
          <View className="gap-2">
            <Input
              label={t('fields.extend_minutes')}
              hint={t('fields.extend_minutes_hint')}
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
              error={valid ? undefined : t('validation.hold_minutes')}
            />
            <Button
              icon="clock"
              title={t('actions.extend')}
              disabled={!valid}
              loading={extend.isPending}
              onPress={() =>
                extend.mutate(
                  { uuid: hold.uuid, minutes: Number(minutes) },
                  {
                    onSuccess: () => {
                      toast.success(t('toast.extended'));
                      onToggle();
                    },
                    onError: (e) => toast.error(apiErrorMessage(e)),
                  },
                )
              }
            />
            <Button
              variant="destructive"
              icon="trash"
              title={t('actions.release')}
              loading={release.isPending}
              onPress={() =>
                confirmStep({
                  title: t('release_dialog.title'),
                  body: t('release_dialog.description', { product: hold.product.code, plate: hold.vehicle.plate }),
                  ok: t('actions.release'),
                  cancel: t('common:cancel'),
                  destructive: true,
                  onOk: () =>
                    release.mutate(hold.uuid, {
                      onSuccess: (res) => {
                        toast.success(
                          res.affected.length > 0
                            ? t('toast.release_affected', { count: res.affected.length })
                            : t('toast.released'),
                        );
                      },
                      onError: (e) => toast.error(apiErrorMessage(e)),
                    }),
                })
              }
            />
          </View>
        ) : (
          <Button variant="outline" title={`${t('actions.extend')} / ${t('actions.release')}`} onPress={onToggle} />
        )
      ) : null}
    </View>
  );
}
