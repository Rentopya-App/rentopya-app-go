import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { formErrors } from '@/core/api/form-errors';
import { Permission, useCan } from '@/core/auth/permissions';
import { formatShort } from '@/core/format';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Chips } from '@/ui/chips';
import { SwitchRow, TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen, Screen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  useOrganizationProfile,
  useOrganizationSettings,
  useRemoveLogo,
  useRenameOrganization,
  useSaveSettings,
  useUploadLogo,
  type OrganizationSettings,
  type OrganizationSettingsVersion,
} from './api';
import { logoProblem, minutesText, missingKey, parseMinutes, type MinutesField } from './lib';
import { ApiImage, confirmAction, Gate, InfoRow, PanelLink } from './parts';
import { StepUpHost } from './step-up';

/**
 * "Genel" settings (`/t/{slug}/settings`): the profile (name and logo), the
 * online-sales readiness, and the settings document's company, reservation,
 * payment, policy and channel fields. Tax mappings and the version history
 * stay read-only here and open in the panel.
 */
export function OrganizationSettingsScreen() {
  const { t } = useTranslation('tenant_settings');
  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <StepUpHost />
      <Gate perm={Permission.TenantSettingsRead}>
        <Body />
      </Gate>
    </>
  );
}

function Body() {
  const settings = useOrganizationSettings();
  return <QueryState query={settings}>{(v) => <SettingsForm key={v.version} version={v} />}</QueryState>;
}

type Profile = NonNullable<ReturnType<typeof useOrganizationProfile>['data']>;

function ProfileCard() {
  const { t } = useTranslation('tenant_settings');
  const profile = useOrganizationProfile();
  return (
    <Card title={t('profile.title')}>
      <QueryState query={profile} rows={1}>
        {(p) => <ProfileForm key={p.updated_at} p={p} />}
      </QueryState>
    </Card>
  );
}

function ProfileForm({ p }: { p: Profile }) {
  const { t } = useTranslation('tenant_settings');
  const can = useCan();
  const write = can(Permission.TenantSettingsWrite);
  const rename = useRenameOrganization();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const [name, setName] = useState(p.name);
  const [error, setError] = useState<string>();

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: false });
    if (r.canceled || !r.assets?.length) return;
    const a = r.assets[0];
    const type = a.mimeType ?? 'image/jpeg';
    const problem = logoProblem({ mimeType: type, size: a.fileSize });
    if (problem) {
      toast.error(problem === 'size' ? t('profile.logo_too_large') : t('profile.logo_hint'));
      return;
    }
    upload.mutate(
      { uri: a.uri, name: a.fileName ?? `logo.${type.split('/')[1] ?? 'png'}`, type },
      {
        onSuccess: () => toast.success(t('profile.toast.logo_uploaded')),
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  const save = () => {
    const v = name.trim();
    if (!v) return setError(t('profile.validation.name_required'));
    if (v.length > 255) return setError(t('profile.validation.name_too_long'));
    setError(undefined);
    rename.mutate(v, {
      onSuccess: () => toast.success(t('profile.toast.renamed')),
      onError: (e) => setError(formErrors(e).fields.name ?? apiErrorMessage(e)),
    });
  };

  return (
    <>
      <View className="flex-row items-center gap-4">
        {p.logo_url ? (
          <ApiImage path={p.logo_url} />
        ) : (
          <View className="size-[72px] items-center justify-center rounded-md bg-muted">
            <Text variant="title" tone="muted">
              {p.name.slice(0, 1).toLocaleUpperCase('tr')}
            </Text>
          </View>
        )}
        <View className="flex-1 gap-2">
          {write ? (
            <>
              <Button
                title={p.logo_url ? t('profile.logo_replace') : t('profile.logo_upload')}
                variant="outline"
                icon="photos"
                loading={upload.isPending}
                onPress={() => void pick()}
              />
              {p.logo_url ? (
                <Button
                  title={t('profile.logo_remove')}
                  variant="ghost"
                  icon="trash"
                  loading={remove.isPending}
                  onPress={async () => {
                    const ok = await confirmAction({
                      title: t('profile.logo_remove_title'),
                      body: t('profile.logo_remove_description'),
                      action: t('profile.logo_remove'),
                      cancel: t('common:cancel'),
                      destructive: true,
                    });
                    if (ok)
                      remove.mutate(undefined, {
                        onSuccess: () => toast.success(t('profile.toast.logo_removed')),
                        onError: (e) => toast.error(apiErrorMessage(e)),
                      });
                  }}
                />
              ) : null}
            </>
          ) : null}
          <Text variant="footnote" tone="muted">
            {t('profile.logo_hint')}
          </Text>
        </View>
      </View>
      <Input
        label={t('profile.name')}
        value={name}
        onChangeText={setName}
        editable={write}
        error={error}
        hint={t('profile.name_hint', { slug: p.slug })}
      />
      {write ? (
        <Button
          title={t('profile.save')}
          variant="secondary"
          disabled={name.trim() === p.name}
          loading={rename.isPending}
          onPress={save}
        />
      ) : null}
    </>
  );
}

function Readiness({ v }: { v: OrganizationSettingsVersion }) {
  const { t } = useTranslation('tenant_settings');
  return (
    <Card>
      <Text variant="headline" tone={v.ready_for_online_sales ? 'success' : 'danger'}>
        {v.ready_for_online_sales ? t('readiness.ready_title') : t('readiness.not_ready_title')}
      </Text>
      <Text tone="muted">
        {v.ready_for_online_sales ? t('readiness.ready_description') : t('readiness.not_ready_description')}
      </Text>
      {v.missing.map((m) => (
        <Text key={m} variant="callout">
          • {t(`fields.${missingKey(m)}`, { defaultValue: m })}
        </Text>
      ))}
      <Text variant="footnote" tone="muted">
        {v.version
          ? t('save_bar.saved', { version: v.version, date: formatShort(v.created_at) })
          : t('save_bar.never_saved')}
      </Text>
    </Card>
  );
}

const MINUTES: { field: MinutesField; hint: string }[] = [
  { field: 'staff_review_window_minutes', hint: 'staff_review_window_hint' },
  { field: 'payment_hold_minutes', hint: 'payment_hold_hint' },
  { field: 'quote_validity_minutes', hint: 'quote_validity_hint' },
];

type Section = 'company' | 'reservation' | 'policies' | 'channels' | 'tax';

function SettingsForm({ version }: { version: OrganizationSettingsVersion }) {
  const { t } = useTranslation('tenant_settings');
  const can = useCan();
  const write = can(Permission.TenantSettingsWrite);
  const save = useSaveSettings();
  const current = useOrganizationSettings();
  const [s, setS] = useState<OrganizationSettings>(version.settings);
  const [minutes, setMinutes] = useState<Record<MinutesField, string>>({
    staff_review_window_minutes: minutesText(version.settings.reservation.staff_review_window_minutes),
    payment_hold_minutes: minutesText(version.settings.reservation.payment_hold_minutes),
    quote_validity_minutes: minutesText(version.settings.reservation.quote_validity_minutes),
  });
  const [section, setSection] = useState<Section>('company');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  const [conflict, setConflict] = useState(false);

  const company = (k: keyof OrganizationSettings['company'], v: string) =>
    setS((p) => ({ ...p, company: { ...p.company, [k]: v } }));
  const reservation = (patch: Partial<OrganizationSettings['reservation']>) =>
    setS((p) => ({ ...p, reservation: { ...p.reservation, ...patch } }));
  const payment = (patch: Partial<OrganizationSettings['payment']>) =>
    setS((p) => ({ ...p, payment: { ...p.payment, ...patch } }));
  const policy = (k: keyof OrganizationSettings['policies'], v: string) =>
    setS((p) => ({ ...p, policies: { ...p.policies, [k]: v } }));
  const err = (path: string) => errors[path] ?? errors[`settings.${path}`];

  const submit = () => {
    const parsed = Object.fromEntries(MINUTES.map((m) => [m.field, parseMinutes(minutes[m.field])])) as Record<
      MinutesField,
      number | null
    >;
    const bad = MINUTES.filter((m) => Number.isNaN(parsed[m.field]));
    if (bad.length) {
      setErrors(
        Object.fromEntries(
          bad.map((m) => [`reservation.${m.field}`, t('validation.minutes_range', { min: 1, max: 10080 })]),
        ),
      );
      setSection('reservation');
      return;
    }
    setErrors({});
    setMessage(undefined);
    save.mutate(
      { settings: { ...s, reservation: { ...s.reservation, ...parsed } }, base_version: version.version },
      {
        onSuccess: (v) => toast.success(t('toast.saved', { version: v.version })),
        onError: (e) => {
          if (isApiError(e) && e.status === 409) return setConflict(true);
          const f = formErrors(e);
          setErrors(f.fields);
          setMessage(f.message ?? (Object.keys(f.fields).length ? undefined : apiErrorMessage(e)));
        },
      },
    );
  };

  const sections: { value: Section; label: string }[] = [
    { value: 'company', label: t('tabs.company') },
    { value: 'reservation', label: t('tabs.reservation') },
    { value: 'policies', label: t('tabs.policies') },
    { value: 'channels', label: t('tabs.channels') },
    { value: 'tax', label: t('tabs.tax') },
  ];

  const Wrapper = write ? FormScreen : Screen;
  return (
    <Wrapper
      footer={
        write ? (
          <>
            {message ? <Text tone="danger">{message}</Text> : null}
            <Button title={t('save_bar.save')} size="lg" loading={save.isPending} onPress={submit} />
          </>
        ) : undefined
      }>
      <ProfileCard />
      <Readiness v={version} />
      {conflict ? (
        <Card>
          <Text variant="headline">{t('conflict.title')}</Text>
          <Text tone="muted">{t('conflict.description')}</Text>
          <Button
            title={t('conflict.reload')}
            variant="outline"
            icon="refresh"
            onPress={() => void current.refetch()}
          />
        </Card>
      ) : null}
      <Chips options={sections} value={section} onChange={setSection} />
      {section === 'company' ? (
        <Card title={t('sections.company')}>
          {(['legal_name', 'tax_number', 'tax_office', 'phone', 'email'] as const).map((k) => (
            <Input
              key={k}
              label={t(`fields.${k}`)}
              value={s.company[k]}
              onChangeText={(v) => company(k, v)}
              editable={write}
              error={err(`company.${k}`)}
              hint={k === 'tax_number' ? t('fields.tax_number_hint') : undefined}
              keyboardType={
                k === 'tax_number'
                  ? 'number-pad'
                  : k === 'phone'
                    ? 'phone-pad'
                    : k === 'email'
                      ? 'email-address'
                      : 'default'
              }
              autoCapitalize={k === 'email' ? 'none' : 'sentences'}
            />
          ))}
          <TextArea
            label={t('fields.address')}
            value={s.company.address}
            onChangeText={(v) => company('address', v)}
            editable={write}
            error={err('company.address')}
          />
        </Card>
      ) : null}
      {section === 'reservation' ? (
        <>
          <Card title={t('sections.reservation')}>
            <Text variant="footnote" tone="muted">
              {t('sections.reservation_desc')}
            </Text>
            <Select
              label={t('fields.approval_mode')}
              value={s.reservation.approval_mode || null}
              placeholder={t('fields.approval_mode_placeholder')}
              disabled={!write}
              error={err('reservation.approval_mode')}
              options={(['auto', 'staff'] as const).map((m) => ({ value: m, label: t(`approval_modes.${m}`) }))}
              onChange={(v) => reservation({ approval_mode: v })}
            />
            {MINUTES.map((m) => (
              <Input
                key={m.field}
                label={t(`fields.${m.field}`)}
                hint={t(`fields.${m.hint}`)}
                value={minutes[m.field]}
                onChangeText={(v) => setMinutes((p) => ({ ...p, [m.field]: v }))}
                keyboardType="number-pad"
                editable={write}
                error={err(`reservation.${m.field}`)}
              />
            ))}
            <Input
              label={t('fields.reference_prefix')}
              hint={t('fields.reference_prefix_hint')}
              value={s.reservation.reference_prefix ?? ''}
              onChangeText={(v) => reservation({ reference_prefix: v.toUpperCase() })}
              autoCapitalize="characters"
              editable={write}
              error={err('reservation.reference_prefix')}
            />
          </Card>
          <Card title={t('sections.payment')}>
            <Select
              label={t('fields.prepayment_rule')}
              value={s.payment.prepayment_rule}
              disabled={!write}
              options={(['none', 'fixed', 'percent'] as const).map((r) => ({
                value: r,
                label: t(`prepayment_rules.${r}`),
              }))}
              onChange={(v) =>
                payment({ prepayment_rule: v, prepayment_value: v === 'none' ? '' : s.payment.prepayment_value })
              }
            />
            {s.payment.prepayment_rule !== 'none' ? (
              <Input
                label={t(
                  s.payment.prepayment_rule === 'fixed' ? 'fields.prepayment_amount' : 'fields.prepayment_percent',
                )}
                value={s.payment.prepayment_value}
                onChangeText={(v) => payment({ prepayment_value: v.replace(',', '.') })}
                keyboardType="decimal-pad"
                editable={write}
                error={err('payment.prepayment_value')}
              />
            ) : null}
            <SwitchRow
              label={t('fields.full_payment_allowed')}
              description={t('fields.full_payment_allowed_hint')}
              value={s.payment.full_payment_allowed}
              onChange={(v) => payment({ full_payment_allowed: v })}
              disabled={!write}
            />
          </Card>
        </>
      ) : null}
      {section === 'policies' ? (
        <Card title={t('sections.policies')}>
          {(['cancellation', 'no_show', 'early_return', 'extension', 'fuel', 'mileage'] as const).map((k) => (
            <TextArea
              key={k}
              label={t(`fields.${k}`)}
              value={s.policies[k]}
              onChangeText={(v) => policy(k, v)}
              editable={write}
              error={err(`policies.${k}`)}
            />
          ))}
          <Input
            label={t('fields.extra_hour_fee')}
            hint={t('fields.extra_hour_fee_hint')}
            value={s.policies.extra_hour_fee}
            onChangeText={(v) => policy('extra_hour_fee', v.replace(',', '.'))}
            keyboardType="decimal-pad"
            editable={write}
            error={err('policies.extra_hour_fee')}
          />
        </Card>
      ) : null}
      {section === 'channels' ? (
        <Card title={t('sections.channels')}>
          {s.sales_channels.map((c, i) => (
            <SwitchRow
              key={c.code}
              label={t(`channels.${c.code}`)}
              description={t(`channels.${c.code}_hint`)}
              value={c.is_active}
              disabled={!write}
              onChange={(on) =>
                setS((p) => ({
                  ...p,
                  sales_channels: p.sales_channels.map((x, j) => (j === i ? { ...x, is_active: on } : x)),
                }))
              }
            />
          ))}
        </Card>
      ) : null}
      {section === 'tax' ? (
        <Card title={t('sections.tax')}>
          <InfoRow
            label={t('fields.default_vat_rate')}
            value={s.tax.default_vat_rate ? `%${s.tax.default_vat_rate}` : ''}
          />
          {s.tax.invoice_item_mappings.map((m) => (
            <InfoRow
              key={m.item_type}
              label={t(`invoice_items.${m.item_type}`)}
              value={[m.account_code, m.vat_rate ? `%${m.vat_rate}` : ''].filter(Boolean).join(' · ')}
            />
          ))}
          <PanelLink page="general" />
        </Card>
      ) : null}
    </Wrapper>
  );
}
