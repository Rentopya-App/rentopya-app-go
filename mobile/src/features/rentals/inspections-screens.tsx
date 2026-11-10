import * as Linking from 'expo-linking';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, RefreshControl, View } from 'react-native';

import { Can, Permission } from '@/core/auth/permissions';
import { formatNumber, formatShort } from '@/core/format';
import { useDebounced } from '@/core/use-debounced';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { PagedList } from '@/ui/paged-list';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { SearchField } from '@/ui/search-field';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useInspection, useInspectionMedia, useInspections } from './api';
import {
  INSPECTION_FILTERS,
  INSPECTION_STATUS_TONES,
  inspectionListQuery,
  personName,
  photoGroups,
  REVIEW_TONES,
  type Inspection,
  type InspectionFilter,
} from './lib';
import { Fields, InspectionRow } from './parts';

function Forbidden() {
  const { t } = useTranslation('rentals');
  return <EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />;
}

/**
 * "Teslim / iade formları" (the panel's `/t/{slug}/inspections`): the
 * review queue first (disputed or unsigned returns), then every form by
 * kind or draft state; read-only on the phone.
 */
export function InspectionsScreen() {
  const { t } = useTranslation('inspections_web');
  return (
    <>
      <Stack.Screen options={{ title: t('list.title') }} />
      <Can perm={Permission.TenantRentalsRead} fallback={<Forbidden />}>
        <InspectionsList />
      </Can>
    </>
  );
}

function InspectionsList() {
  const { t } = useTranslation('inspections_web');
  const [q, setQ] = useState('');
  const search = useDebounced(q, 300);
  const [filter, setFilter] = useState<InspectionFilter>('review');
  const query = useInspections(useMemo(() => inspectionListQuery({ q: search, filter }), [search, filter]));
  return (
    <PagedList
      query={query}
      keyOf={(i) => i.uuid}
      empty={t('list.empty_title')}
      header={
        <>
          <SearchField value={q} onChangeText={setQ} placeholder={t('rentals_app:inspections.search')} />
          <Chips
            options={INSPECTION_FILTERS.map((f) => ({ value: f, label: t(`rentals_app:inspections.filters.${f}`) }))}
            value={filter}
            onChange={setFilter}
          />
        </>
      }
      renderItem={(item) => <InspectionRow item={item} />}
    />
  );
}

/** One handover / return form, read-only: facts, readings against the handover, photos and damages. */
export function InspectionScreen() {
  const { t } = useTranslation('inspections_web');
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return (
    <>
      <Stack.Screen options={{ title: t('list.title') }} />
      <Can perm={Permission.TenantRentalsRead} fallback={<Forbidden />}>
        <Detail uuid={uuid} />
      </Can>
    </>
  );
}

function Detail({ uuid }: { uuid: string }) {
  const query = useInspection(uuid);
  return (
    <Screen refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <QueryState query={query} rows={5}>
        {(ins) => <Body ins={ins} />}
      </QueryState>
    </Screen>
  );
}

/** Version of the completed evidence: the link query refetches when it changes. */
function evidenceVersion(photos: Inspection['photos'], signature?: { uuid: string } | null) {
  const ids = photos
    .filter((p) => p.status === 'completed')
    .map((p) => p.uuid)
    .sort();
  if (signature) ids.push(signature.uuid);
  return ids.join(',');
}

function Body({ ins }: { ins: Inspection }) {
  const { t } = useTranslation('inspections_web');
  const at = (v: string | null) => (v ? formatShort(v) : null);
  const base = ins.baseline;
  const missing = base
    ? ins.template.checklist
        .filter((i) => base.equipment[i.key] && ins.equipment[i.key] === false)
        .map((i) => i.label)
        .join(', ')
    : '';
  return (
    <>
      <Stack.Screen options={{ title: `${t(`kinds.${ins.kind}`)} · ${ins.rental.reference}` }} />
      <View className="gap-2 px-1">
        <Text variant="title" numberOfLines={2}>
          {`${ins.rental.vehicle.plate} · ${ins.rental.customer.display_name}`}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          <StatusPill label={t(`statuses.${ins.status}`)} tone={INSPECTION_STATUS_TONES[ins.status]} />
          <StatusPill label={t(`review.${ins.review_status}`)} tone={REVIEW_TONES[ins.review_status]} />
          <StatusPill label={`v${ins.version}`} />
          {ins.disputed ? <StatusPill label={t('list.disputed')} tone="problem" /> : null}
        </View>
      </View>
      <Button
        variant="outline"
        icon="car"
        title={t('complete.open_rental')}
        onPress={() => router.push(`/rentals/${ins.rental.uuid}` as Href)}
      />
      {ins.review_status === 'pending' ? (
        <View className="gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <Text variant="footnote" tone="danger" className="font-sans-semibold">
            {t('detail.review_title')}
          </Text>
          <Text variant="callout">{t('detail.review_hint')}</Text>
          <Text variant="footnote" tone="muted">
            {t('rentals_app:inspections.review_on_web')}
          </Text>
        </View>
      ) : null}
      <Card title={t('detail.facts')}>
        <Fields
          rows={[
            { label: t('detail.occurred_at'), value: at(ins.occurred_at) },
            {
              label: t('detail.finalized_at'),
              value: ins.finalized_at
                ? [at(ins.finalized_at), personName(ins.finalized_by)].filter(Boolean).join(' · ')
                : null,
            },
            {
              label: t('rentals_app:inspections.place'),
              value: ins.point?.name ?? ins.branch?.name ?? null,
            },
            { label: t('readings.km'), value: ins.km !== null ? `${formatNumber(ins.km)} km` : null },
            { label: t('readings.fuel'), value: ins.fuel !== null ? `%${ins.fuel}` : null },
            {
              label: t('list.columns.signature'),
              value: [t(`signature_status.${ins.signature_status}`), ins.signature_note].filter(Boolean).join(' — '),
            },
            {
              label: t('list.disputed'),
              value: ins.disputed ? ins.dispute_note || t('detail.yes') : t('detail.no'),
            },
            { label: t('review_step.statement'), value: ins.customer_statement },
            { label: t('detail.revision_reason'), value: ins.revision_reason },
            {
              label: t('detail.review_note'),
              value: ins.review_note
                ? [ins.review_note, personName(ins.reviewed_by)].filter(Boolean).join(' · ')
                : null,
            },
            { label: t('rentals_app:inspections.note'), value: ins.note },
          ]}
        />
      </Card>
      {base ? (
        <Card title={t('detail.comparison')}>
          <Fields
            rows={[
              {
                label: t('readings.km'),
                value: `${base.km ?? '—'} → ${ins.km ?? '—'}${
                  base.km != null && ins.km != null ? ` (${formatNumber(ins.km - base.km)} km)` : ''
                }`,
              },
              { label: t('readings.fuel'), value: `%${base.fuel ?? '—'} → %${ins.fuel ?? '—'}` },
              { label: t('readings.missing_now'), value: missing || t('review_step.none') },
            ]}
          />
        </Card>
      ) : null}
      <Photos ins={ins} />
      <Damages ins={ins} />
    </>
  );
}

function Thumb({ href, label }: { href: string | undefined; label: string }) {
  const { t } = useTranslation('rentals_app');
  const open = () => {
    if (href) Linking.openURL(href).catch(() => toast.error(t('inspections.open_failed')));
  };
  return (
    <Pressable
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      disabled={!href}
      onPress={open}
      className="aspect-[4/3] w-[48%] overflow-hidden rounded-md border border-border bg-muted active:opacity-80">
      {href ? (
        <Image source={{ uri: href }} resizeMode="cover" className="size-full" accessibilityIgnoresInvertColors />
      ) : (
        <View className="flex-1 items-center justify-center">
          <Text variant="footnote" tone="muted">
            {t('inspections.no_link')}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Completed photos by slot, from the API's short-lived signed links (the
 * app never sees an object key); a tap opens the full photo.
 */
function Photos({ ins }: { ins: Inspection }) {
  const { t } = useTranslation('inspections_web');
  const version = evidenceVersion(ins.photos, ins.signature);
  const links = useInspectionMedia(ins.uuid, version);
  const groups = photoGroups(ins);
  const map = links.data ?? {};
  return (
    <Card title={t('detail.photos')}>
      {groups.length === 0 && !ins.signature ? (
        <Text variant="callout" tone="muted">
          {t('rentals_app:inspections.no_photos')}
        </Text>
      ) : null}
      {groups.map((g) => {
        const label =
          g.label ?? (g.slot === 'damage' ? t('photos.damage') : g.slot === 'extra' ? t('photos.extra') : g.slot);
        return (
          <View key={g.slot} className="gap-1.5">
            <Text variant="footnote" className="font-sans-semibold">
              {label}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {g.photos.map((p) => (
                <Thumb key={p.uuid} href={map[p.uuid]} label={label} />
              ))}
            </View>
            <Text variant="footnote" tone="muted">
              {t('detail.evidence_line', {
                at: g.photos[0].uploaded_at ? formatShort(g.photos[0].uploaded_at) : '—',
                hash: g.photos[0].sha256.slice(0, 12),
              })}
            </Text>
          </View>
        );
      })}
      {ins.signature ? (
        <View className="gap-1.5">
          <Text variant="footnote" className="font-sans-semibold">
            {`${t('list.columns.signature')} · ${ins.signature.signer_name}`}
          </Text>
          <View className="flex-row">
            <Thumb href={map[ins.signature.uuid]} label={t('list.columns.signature')} />
          </View>
          <Text variant="footnote" tone="muted">
            {formatShort(ins.signature.signed_at)}
          </Text>
        </View>
      ) : null}
      {links.isError ? (
        <Button variant="ghost" icon="refresh" title={t('common:retry')} onPress={() => void links.refetch()} />
      ) : null}
    </Card>
  );
}

function Damages({ ins }: { ins: Inspection }) {
  const { t } = useTranslation('inspections_web');
  const zone = (z: string) => {
    const key = `zones.${z}`;
    const label = t(key);
    return label === key ? z : label;
  };
  return (
    <Card title={t('damages.title')}>
      {ins.damages.length === 0 ? (
        <Text variant="callout" tone="muted">
          {t('damages.empty')}
        </Text>
      ) : (
        <View>
          {ins.damages.map((d, i) => (
            <View
              key={d.uuid}
              className={i === ins.damages.length - 1 ? 'gap-1 py-2' : 'gap-1 border-b border-border py-2'}>
              <View className="flex-row flex-wrap items-center gap-1.5">
                <Text variant="callout" className="font-sans-semibold">
                  {zone(d.zone)}
                </Text>
                {ins.kind === 'return' && d.is_new ? <StatusPill label={t('damages.new')} tone="problem" /> : null}
                {d.disputed ? <StatusPill label={t('damages.disputed')} tone="progress" /> : null}
              </View>
              <Text variant="footnote">
                {`${t(`damage_types.${d.damage_type}`)} · ${t(`severities.${d.severity}`)}`}
              </Text>
              {d.description ? (
                <Text variant="footnote" tone="muted">
                  {d.description}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}
