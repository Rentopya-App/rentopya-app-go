import { router, Stack, type Href } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Permission, useCan } from '@/core/auth/permissions';
import { Chips } from '@/ui/chips';
import { EmptyState } from '@/ui/empty-state';
import { FieldGroup, SwitchRow, TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { type Customer, useCustomer, useSaveCustomer } from './api';
import {
  CUSTOMER_TYPES,
  customerFormDefaults,
  customerRequest,
  type CustomerFormValues,
  type Errors,
  IDENTITY_TYPES_BY_CUSTOMER,
  identityKey,
  NO_IDENTITY,
  typeKey,
  validateCustomer,
} from './lib';
import { CountrySelect, Footer, useFormErrors } from './parts';

/** "Yeni müşteri" / "Müşteriyi düzenle": the panel's form with the same checks (TCKN / VKN checksum, phone, tags). */
export function CustomerFormScreen({ uuid }: { uuid?: string }) {
  const { t } = useTranslation('customers');
  const can = useCan();
  const query = useCustomer(uuid ?? '');
  if (!can(Permission.TenantCustomersWrite)) return <EmptyState icon="security" title={t('common:forbidden')} />;
  if (!uuid) {
    return (
      <>
        <Stack.Screen options={{ title: t('create_title') }} />
        <CustomerForm />
      </>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title: t('edit_title') }} />
      <QueryState query={query}>
        {(c) =>
          c.anonymized ? <EmptyState icon="security" title={t('anonymized_readonly')} /> : <CustomerForm customer={c} />
        }
      </QueryState>
    </>
  );
}

function CustomerForm({ customer }: { customer?: Customer }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const mode = customer ? 'edit' : 'create';
  const save = useSaveCustomer(customer?.uuid);
  const [v, setV] = useState<CustomerFormValues>(() => customerFormDefaults(customer));
  const [local, setLocal] = useState<Errors>({});
  const { field, message } = useFormErrors(local, save.error);
  const set = (patch: Partial<CustomerFormValues>) => setV((s) => ({ ...s, ...patch }));
  const corporate = v.customer_type === 'corporate';
  const keep = mode === 'edit' ? t('form.keep_hint') : undefined;
  const storedIdentity = customer?.identity_type === v.identity_type && !!customer?.identity_masked;

  const submit = () => {
    const e = validateCustomer(v, mode, !!customer?.identity_type);
    setLocal(e);
    if (Object.keys(e).length) {
      toast.error(t('common:check_fields'));
      return;
    }
    save.mutate(customerRequest(v, mode, customer), {
      onSuccess: (saved) => {
        toast.success(customer ? t('toast.updated') : t('toast.created'));
        if (customer) router.back();
        else router.replace(`/customers/${saved.uuid}` as Href);
      },
    });
  };

  return (
    <FormScreen
      footer={<Footer message={message} title={t('actions.save')} loading={save.isPending} onPress={submit} />}>
      <FieldGroup title={t('form.section_party')}>
        <Chips
          options={CUSTOMER_TYPES.map((c) => ({ value: c, label: t(typeKey(c)) }))}
          value={v.customer_type}
          onChange={(customer_type) => {
            // An identity kind the new type does not allow falls back to its first one.
            const allowed = IDENTITY_TYPES_BY_CUSTOMER[customer_type];
            set({
              customer_type,
              identity_type:
                v.identity_type === NO_IDENTITY || allowed.includes(v.identity_type) ? v.identity_type : allowed[0],
            });
          }}
        />
        {corporate ? (
          <>
            <Input
              label={t('fields.company_title')}
              value={v.company_title}
              onChangeText={(company_title) => set({ company_title })}
              maxLength={255}
              error={field('company_title')}
            />
            <Input
              label={t('fields.tax_office')}
              value={v.tax_office}
              onChangeText={(tax_office) => set({ tax_office })}
              maxLength={128}
              error={field('tax_office')}
            />
          </>
        ) : (
          <>
            <Input
              label={t('fields.first_name')}
              value={v.first_name}
              onChangeText={(first_name) => set({ first_name })}
              maxLength={128}
              autoComplete="off"
              error={field('first_name')}
            />
            <Input
              label={t('fields.last_name')}
              value={v.last_name}
              onChangeText={(last_name) => set({ last_name })}
              maxLength={128}
              autoComplete="off"
              error={field('last_name')}
            />
          </>
        )}
      </FieldGroup>

      <FieldGroup title={t('form.section_identity')}>
        <Select
          label={t('fields.identity_type')}
          value={v.identity_type}
          options={[
            ...IDENTITY_TYPES_BY_CUSTOMER[v.customer_type].map((k) => ({
              value: k as string,
              label: t(identityKey(k)),
            })),
            { value: NO_IDENTITY, label: t(identityKey('none')) },
          ]}
          onChange={(identity_type) => set({ identity_type: identity_type as CustomerFormValues['identity_type'] })}
          error={field('identity_type')}
        />
        {v.identity_type !== NO_IDENTITY ? (
          <Input
            label={t('fields.identity_number')}
            value={v.identity_number}
            onChangeText={(identity_number) => set({ identity_number })}
            keyboardType={v.identity_type === 'passport' ? 'default' : 'number-pad'}
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={32}
            placeholder={storedIdentity ? customer?.identity_masked : undefined}
            hint={storedIdentity ? keep : t('form.identity_hint')}
            error={field('identity_number')}
          />
        ) : null}
        <CountrySelect
          label={corporate ? t('fields.country') : t('fields.nationality')}
          value={v.nationality}
          onChange={(nationality) => set({ nationality })}
          optional
          error={field('nationality')}
        />
      </FieldGroup>

      <FieldGroup title={t('form.section_contact')}>
        <Input
          label={t('fields.phone')}
          value={v.phone}
          onChangeText={(phone) => set({ phone })}
          keyboardType="phone-pad"
          autoComplete="off"
          maxLength={32}
          placeholder={customer?.phone_masked || '0532 000 00 00'}
          hint={customer?.phone_masked ? keep : t('form.phone_hint')}
          error={field('phone')}
        />
        <Input
          label={t('fields.email')}
          value={v.email}
          onChangeText={(email) => set({ email })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          maxLength={255}
          placeholder={customer?.email_masked || undefined}
          hint={customer?.email_masked ? keep : undefined}
          error={field('email')}
        />
      </FieldGroup>

      <FieldGroup title={t('form.section_billing')}>
        <TextArea
          label={t('fields.billing_address')}
          value={v.billing_address}
          onChangeText={(billing_address) => set({ billing_address })}
          maxLength={1000}
          error={field('billing_address')}
        />
        <Input
          label={t('fields.billing_district')}
          value={v.billing_district}
          onChangeText={(billing_district) => set({ billing_district })}
          maxLength={128}
          error={field('billing_district')}
        />
        <Input
          label={t('fields.billing_city')}
          value={v.billing_city}
          onChangeText={(billing_city) => set({ billing_city })}
          maxLength={128}
          error={field('billing_city')}
        />
        <Input
          label={t('fields.billing_postal_code')}
          value={v.billing_postal_code}
          onChangeText={(billing_postal_code) => set({ billing_postal_code })}
          keyboardType="number-pad"
          maxLength={16}
          error={field('billing_postal_code')}
        />
        <CountrySelect
          label={t('fields.billing_country')}
          value={v.billing_country}
          onChange={(billing_country) => set({ billing_country })}
          optional
          error={field('billing_country')}
        />
        <SwitchRow
          label={t('fields.e_invoice')}
          description={t('form.e_invoice_hint')}
          value={v.e_invoice}
          onChange={(e_invoice) => set({ e_invoice })}
        />
      </FieldGroup>

      <FieldGroup title={t('form.section_notes')}>
        <Input
          label={t('fields.tags')}
          value={v.tags}
          onChangeText={(tags) => set({ tags })}
          hint={t('form.tags_hint')}
          maxLength={1000}
          error={field('tags')}
        />
        <TextArea
          label={t('fields.note')}
          value={v.note}
          onChangeText={(note) => set({ note })}
          maxLength={5000}
          error={field('note')}
        />
      </FieldGroup>
      <Text variant="footnote" tone="muted">
        {t('form.encryption_note')}
      </Text>
    </FormScreen>
  );
}
