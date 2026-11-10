import { router, Stack, useIsFocused } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, View } from 'react-native';

import { Permission, useCan } from '@/core/auth/permissions';
import { localDate } from '@/core/format';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { DateField } from '@/ui/date-field';
import { EmptyState } from '@/ui/empty-state';
import { FieldGroup, SwitchRow, TextArea } from '@/ui/fields';
import { Input } from '@/ui/input';
import { QueryState } from '@/ui/query-state';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen } from '@/ui/screen';
import { Select } from '@/ui/select';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import {
  type Customer,
  type CustomerContact,
  type CustomerDriver,
  type DriverEligibility,
  useCreateDocument,
  useCustomer,
  useCustomerContacts,
  useCustomerDocuments,
  useCustomerDrivers,
  useDriverEligibility,
  useRecordConsent,
  useRevealCustomer,
  useSaveContact,
  useSaveDriver,
  useUploadDocumentFile,
} from './api';
import {
  CONSENT_SOURCES,
  consentKey,
  consentRequest,
  contactRequest,
  type ConsentChannel,
  type ConsentValues,
  type ContactValues,
  DOCUMENT_TYPES,
  type DocumentType,
  docTypeKey,
  driverFormDefaults,
  driverRequest,
  type DriverValues,
  eligibilityKey,
  type Errors,
  identityKey,
  type PickedFile,
  sourceKey,
  validateConsent,
  validateContact,
  validateDriver,
  validateEligibility,
  validReason,
} from './lib';
import { CountrySelect, DayInput, Footer, useFormErrors } from './parts';
import { pickDocumentPhoto } from './pick-file';
import { keepRevealed } from './reveal';
import { StepUpHost } from './step-up';

const NO_DRIVER = '__none__';

/** Screens of one customer: loaded, writable (not anonymized) and allowed. */
function WithCustomer({
  uuid,
  write = true,
  children,
}: {
  uuid: string;
  write?: boolean;
  children: (c: Customer) => ReactNode;
}) {
  const { t } = useTranslation('customers');
  const can = useCan();
  const query = useCustomer(uuid);
  if (!can(write ? Permission.TenantCustomersWrite : Permission.TenantCustomersRead))
    return <EmptyState icon="security" title={t('common:forbidden')} />;
  return (
    <QueryState query={query}>
      {(c) => (write && c.anonymized ? <EmptyState icon="security" title={t('anonymized_readonly')} /> : children(c))}
    </QueryState>
  );
}

// ---- Reveal ----

/** "Göster": the reason, then the plaintext for the API's display window (memory only). */
export function RevealScreen({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const can = useCan();
  const reveal = useRevealCustomer(uuid);
  const focused = useIsFocused();
  if (!can(Permission.TenantCustomersReveal)) return <EmptyState icon="security" title={t('common:forbidden')} />;
  return (
    <>
      <Stack.Screen options={{ title: t('reveal.title'), presentation: 'modal' }} />
      <StepUpHost active={focused} />
      <ReasonForm
        description={t('reveal.description')}
        label={t('reveal.reason')}
        submitTitle={t('reveal.confirm')}
        pending={reveal.isPending}
        error={reveal.error}
        onSubmit={(reason) => {
          if (!validReason(reason)) {
            toast.error(t('reveal.reason_short'));
            return;
          }
          reveal.mutate(reason, {
            onSuccess: (data) => {
              keepRevealed(data);
              router.back();
            },
          });
        }}>
        <Card>
          <Text variant="footnote">{t('reveal.audit_note')}</Text>
        </Card>
      </ReasonForm>
    </>
  );
}

// ---- Contact ----

export function ContactScreen({ uuid, contactUuid }: { uuid: string; contactUuid?: string }) {
  const { t } = useTranslation('customers');
  const contacts = useCustomerContacts(uuid);
  return (
    <>
      <Stack.Screen options={{ title: contactUuid ? t('contacts.edit_title') : t('contacts.create_title') }} />
      <WithCustomer uuid={uuid}>
        {() =>
          contactUuid ? (
            <QueryState query={contacts}>
              {(data) => {
                const contact = data.items.find((c) => c.uuid === contactUuid);
                return contact ? (
                  <ContactForm uuid={uuid} contact={contact} />
                ) : (
                  <EmptyState icon="customers" title={t('common:no_results')} />
                );
              }}
            </QueryState>
          ) : (
            <ContactForm uuid={uuid} />
          )
        }
      </WithCustomer>
    </>
  );
}

function ContactForm({ uuid, contact }: { uuid: string; contact?: CustomerContact }) {
  const { t } = useTranslation('customers');
  const save = useSaveContact(uuid);
  const [v, setV] = useState<ContactValues>({
    full_name: contact?.full_name ?? '',
    title: contact?.title ?? '',
    phone: '',
    email: '',
    is_primary: contact?.is_primary ?? false,
    note: contact?.note ?? '',
  });
  const [local, setLocal] = useState<Errors>({});
  const { field, message } = useFormErrors(local, save.error);
  const set = (patch: Partial<ContactValues>) => setV((s) => ({ ...s, ...patch }));
  const keep = contact ? t('form.keep_hint') : undefined;
  const submit = () => {
    const e = validateContact(v);
    setLocal(e);
    if (Object.keys(e).length) return;
    save.mutate(
      { contactUuid: contact?.uuid, body: contactRequest(v, !!contact) },
      {
        onSuccess: () => {
          toast.success(contact ? t('toast.contact_updated') : t('toast.contact_created'));
          router.back();
        },
      },
    );
  };
  return (
    <FormScreen
      footer={<Footer message={message} title={t('actions.save')} loading={save.isPending} onPress={submit} />}>
      <Input
        label={t('contacts.full_name')}
        value={v.full_name}
        onChangeText={(full_name) => set({ full_name })}
        maxLength={255}
        error={field('full_name')}
      />
      <Input
        label={t('contacts.title_field')}
        value={v.title}
        onChangeText={(title) => set({ title })}
        maxLength={128}
        error={field('title')}
      />
      <Input
        label={t('fields.phone')}
        value={v.phone}
        onChangeText={(phone) => set({ phone })}
        keyboardType="phone-pad"
        maxLength={32}
        placeholder={contact?.phone_masked || '0532 000 00 00'}
        hint={contact?.phone_masked ? keep : undefined}
        error={field('phone')}
      />
      <Input
        label={t('fields.email')}
        value={v.email}
        onChangeText={(email) => set({ email })}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={255}
        placeholder={contact?.email_masked || undefined}
        hint={contact?.email_masked ? keep : undefined}
        error={field('email')}
      />
      <SwitchRow label={t('contacts.is_primary')} value={v.is_primary} onChange={(is_primary) => set({ is_primary })} />
      <TextArea
        label={t('fields.note')}
        value={v.note}
        onChangeText={(note) => set({ note })}
        maxLength={2000}
        error={field('note')}
      />
    </FormScreen>
  );
}

// ---- Driver ----

export function DriverScreen({ uuid, driverUuid, self }: { uuid: string; driverUuid?: string; self?: boolean }) {
  const { t } = useTranslation('customers');
  const drivers = useCustomerDrivers(uuid);
  const title = driverUuid ? t('drivers.edit_title') : self ? t('drivers.self_title') : t('drivers.create_title');
  return (
    <>
      <Stack.Screen options={{ title }} />
      <WithCustomer uuid={uuid}>
        {(c) =>
          driverUuid ? (
            <QueryState query={drivers}>
              {(data) => {
                const driver = data.items.find((d) => d.uuid === driverUuid);
                return driver ? (
                  <DriverForm customer={c} driver={driver} self={false} />
                ) : (
                  <EmptyState icon="user" title={t('common:no_results')} />
                );
              }}
            </QueryState>
          ) : (
            <DriverForm customer={c} driver={null} self={!!self && c.customer_type === 'individual'} />
          )
        }
      </WithCustomer>
    </>
  );
}

function DriverForm({ customer, driver, self }: { customer: Customer; driver: CustomerDriver | null; self: boolean }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const save = useSaveDriver(customer.uuid);
  const [v, setV] = useState<DriverValues>(() => driverFormDefaults(driver, self));
  const [local, setLocal] = useState<Errors>({});
  const { field, message } = useFormErrors(local, save.error);
  const set = (patch: Partial<DriverValues>) => setV((s) => ({ ...s, ...patch }));
  const keep = driver ? t('form.keep_hint') : undefined;
  const submit = () => {
    const e = validateDriver(v);
    setLocal(e);
    if (Object.keys(e).length) {
      toast.error(t('common:check_fields'));
      return;
    }
    save.mutate(
      { driverUuid: driver?.uuid, body: driverRequest(v, driver) },
      {
        onSuccess: () => {
          toast.success(driver ? t('toast.driver_updated') : t('toast.driver_created'));
          router.back();
        },
      },
    );
  };
  return (
    <FormScreen
      footer={<Footer message={message} title={t('actions.save')} loading={save.isPending} onPress={submit} />}>
      <Text variant="footnote" tone="muted">
        {t('drivers.dialog_description')}
      </Text>
      {v.copy_from_customer ? (
        <Card>
          <Text variant="callout">{t('drivers.self_note', { name: customer.display_name })}</Text>
        </Card>
      ) : (
        <FieldGroup title={t('detail.identity')}>
          <Input
            label={t('fields.first_name')}
            value={v.first_name}
            onChangeText={(first_name) => set({ first_name })}
            maxLength={128}
            error={field('first_name')}
          />
          <Input
            label={t('fields.last_name')}
            value={v.last_name}
            onChangeText={(last_name) => set({ last_name })}
            maxLength={128}
            error={field('last_name')}
          />
          <Select
            label={t('fields.identity_type')}
            value={v.identity_type}
            options={(['tckn', 'passport', 'none'] as const).map((k) => ({ value: k, label: t(identityKey(k)) }))}
            onChange={(identity_type) => set({ identity_type })}
          />
          {v.identity_type !== 'none' ? (
            <Input
              label={t('fields.identity_number')}
              value={v.identity_number}
              onChangeText={(identity_number) => set({ identity_number })}
              keyboardType={v.identity_type === 'passport' ? 'default' : 'number-pad'}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              maxLength={32}
              placeholder={driver?.identity_type === v.identity_type ? driver.identity_masked : undefined}
              hint={driver?.identity_type === v.identity_type ? keep : undefined}
              error={field('identity_number')}
            />
          ) : null}
          <CountrySelect
            label={t('fields.nationality')}
            value={v.nationality}
            onChange={(nationality) => set({ nationality })}
            optional
            error={field('nationality')}
          />
          <Input
            label={t('fields.phone')}
            value={v.phone}
            onChangeText={(phone) => set({ phone })}
            keyboardType="phone-pad"
            maxLength={32}
            placeholder={driver?.phone_masked || '0532 000 00 00'}
            hint={driver?.phone_masked ? keep : undefined}
            error={field('phone')}
          />
          <Input
            label={t('fields.email')}
            value={v.email}
            onChangeText={(email) => set({ email })}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={255}
            placeholder={driver?.email_masked || undefined}
            hint={driver?.email_masked ? keep : undefined}
            error={field('email')}
          />
        </FieldGroup>
      )}
      <FieldGroup title={t('customers_app:licence_section')}>
        <DayInput
          label={t('drivers.birth_date')}
          hint={t('drivers.birth_date_hint')}
          value={v.birth_date}
          onChangeText={(birth_date) => set({ birth_date })}
          error={field('birth_date')}
        />
        <Input
          label={t('drivers.licence_number')}
          value={v.licence_number}
          onChangeText={(licence_number) => set({ licence_number })}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={32}
          placeholder={driver?.licence_masked || undefined}
          hint={driver?.licence_masked ? keep : undefined}
          error={field('licence_number')}
        />
        <Input
          label={t('drivers.licence_class')}
          value={v.licence_class}
          onChangeText={(licence_class) => set({ licence_class })}
          autoCapitalize="characters"
          maxLength={32}
          placeholder="B"
          error={field('licence_class')}
        />
        <DayInput
          label={t('drivers.licence_issued_on')}
          value={v.licence_issued_on}
          onChangeText={(licence_issued_on) => set({ licence_issued_on })}
          error={field('licence_issued_on')}
        />
        <DayInput
          label={t('drivers.licence_expires_on')}
          value={v.licence_expires_on}
          onChangeText={(licence_expires_on) => set({ licence_expires_on })}
          error={field('licence_expires_on')}
        />
        <CountrySelect
          label={t('drivers.licence_country')}
          hint={t('drivers.licence_country_hint')}
          value={v.licence_country}
          onChange={(licence_country) => set({ licence_country })}
          optional
          error={field('licence_country')}
        />
        <TextArea
          label={t('fields.note')}
          value={v.note}
          onChangeText={(note) => set({ note })}
          maxLength={2000}
          error={field('note')}
        />
      </FieldGroup>
    </FormScreen>
  );
}

// ---- Eligibility ----

/** Rental condition check of one driver against a minimum age and licence years. */
export function EligibilityScreen({ uuid, driverUuid }: { uuid: string; driverUuid: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const drivers = useCustomerDrivers(uuid);
  const check = useDriverEligibility(uuid);
  const [minAge, setMinAge] = useState('21');
  const [minYears, setMinYears] = useState('1');
  const [local, setLocal] = useState<Errors>({});
  const [result, setResult] = useState<DriverEligibility | null>(null);
  const { field, message } = useFormErrors(local, check.error);
  const driver = drivers.data?.items.find((d) => d.uuid === driverUuid);
  const submit = () => {
    const e = validateEligibility(minAge, minYears);
    setLocal(e);
    if (Object.keys(e).length) return;
    check.mutate(
      { driverUuid, minAge: Number(minAge), minYears: Number(minYears) },
      { onSuccess: (out) => setResult(out) },
    );
  };
  return (
    <>
      <Stack.Screen options={{ title: t('eligibility.title') }} />
      <WithCustomer uuid={uuid} write={false}>
        {() => (
          <FormScreen
            footer={
              <Footer message={message} title={t('eligibility.check')} loading={check.isPending} onPress={submit} />
            }>
            {driver ? <Text tone="muted">{t('eligibility.description', { name: driver.full_name })}</Text> : null}
            <Input
              label={t('eligibility.min_driver_age')}
              value={minAge}
              onChangeText={(s) => {
                setMinAge(s);
                setResult(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              error={field('min_driver_age')}
            />
            <Input
              label={t('eligibility.min_license_years')}
              value={minYears}
              onChangeText={(s) => {
                setMinYears(s);
                setResult(null);
              }}
              keyboardType="number-pad"
              maxLength={3}
              error={field('min_license_years')}
            />
            {result ? (
              <View
                className={
                  result.eligible
                    ? 'gap-1.5 rounded-lg border border-success bg-success/10 p-4'
                    : 'gap-1.5 rounded-lg border border-destructive bg-destructive/10 p-4'
                }>
                <StatusPill
                  label={result.eligible ? t('customers_app:eligible') : t('customers_app:not_eligible')}
                  tone={result.eligible ? 'done' : 'problem'}
                />
                <Text variant="headline">
                  {result.eligible ? t('eligibility.eligible') : t('eligibility.not_eligible')}
                </Text>
                {result.reasons.map((r) => (
                  <Text key={r} variant="callout">
                    • {t(eligibilityKey(r))}
                  </Text>
                ))}
                <Text variant="footnote" tone="muted">
                  {[
                    result.age != null ? `${t('drivers.age')}: ${t('drivers.years', { count: result.age })}` : null,
                    result.licence_years != null
                      ? `${t('drivers.licence_years')}: ${t('drivers.years', { count: result.licence_years })}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ) : null}
          </FormScreen>
        )}
      </WithCustomer>
    </>
  );
}

// ---- Consent ----

export function ConsentScreen({
  uuid,
  channel,
  action,
}: {
  uuid: string;
  channel: ConsentChannel;
  action: 'grant' | 'withdraw';
}) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const record = useRecordConsent(uuid);
  const granting = action === 'grant';
  const [v, setV] = useState<ConsentValues>({ source: 'counter', text_version: '', date: '', note: '' });
  const [local, setLocal] = useState<Errors>({});
  const { field, message } = useFormErrors(local, record.error);
  const set = (patch: Partial<ConsentValues>) => setV((s) => ({ ...s, ...patch }));
  const submit = () => {
    const e = validateConsent(v, granting);
    setLocal(e);
    if (Object.keys(e).length) return;
    record.mutate(consentRequest(channel, action, v), {
      onSuccess: () => {
        toast.success(granting ? t('toast.consent_granted') : t('toast.consent_withdrawn'));
        router.back();
      },
    });
  };
  return (
    <>
      <Stack.Screen
        options={{
          title: t(granting ? 'consents.grant_title' : 'consents.withdraw_title', { channel: t(consentKey(channel)) }),
        }}
      />
      <WithCustomer uuid={uuid}>
        {() => (
          <FormScreen
            footer={
              <Footer
                message={message}
                title={granting ? t('consents.grant') : t('consents.withdraw')}
                variant={granting ? 'primary' : 'destructive'}
                loading={record.isPending}
                onPress={submit}
              />
            }>
            <Text tone="muted">{t('consents.dialog_description')}</Text>
            <Select
              label={t('consents.source')}
              value={v.source}
              options={CONSENT_SOURCES.map((s) => ({ value: s, label: t(sourceKey(s)) }))}
              onChange={(source) => set({ source })}
              error={field('source')}
            />
            {granting ? (
              <Input
                label={t('consents.text_version')}
                hint={t('consents.text_version_hint')}
                value={v.text_version}
                onChangeText={(text_version) => set({ text_version })}
                placeholder="ETK-2026-01"
                autoCapitalize="characters"
                maxLength={64}
                error={field('text_version')}
              />
            ) : null}
            <DateField
              label={t('consents.date')}
              hint={t('consents.date_hint')}
              value={v.date || null}
              max={localDate(new Date())}
              onChange={(date) => set({ date })}
              onClear={() => set({ date: '' })}
              error={field('at')}
            />
            <TextArea
              label={t('fields.note')}
              value={v.note}
              onChangeText={(note) => set({ note })}
              maxLength={2000}
              error={field('note')}
            />
          </FormScreen>
        )}
      </WithCustomer>
    </>
  );
}

// ---- Document ----

/** Camera / library buttons and the picked photo's preview. */
function PhotoPicker({
  file,
  onPick,
  baseName,
  error,
}: {
  file: PickedFile | null;
  onPick: (f: PickedFile) => void;
  baseName: string;
  error?: string;
}) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const pick = async (source: 'camera' | 'library') => {
    const r = await pickDocumentPhoto(source, baseName);
    if (r.ok) onPick(r.file);
    else if (r.reason !== 'cancelled') toast.error(t(`customers_app:pick.${r.reason}`));
  };
  return (
    <View className="gap-2">
      <Text variant="footnote" tone="muted" className="font-sans-medium">
        {t('documents.file')}
      </Text>
      {file ? (
        <Image
          source={{ uri: file.uri }}
          accessibilityLabel={file.name}
          className="h-56 w-full rounded-lg border border-border bg-muted"
          resizeMode="contain"
        />
      ) : null}
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          title={t('customers_app:take_photo')}
          icon="camera"
          variant={file ? 'outline' : 'secondary'}
          onPress={() => void pick('camera')}
        />
        <Button
          className="flex-1"
          title={t('customers_app:choose_photo')}
          icon="photos"
          variant="outline"
          onPress={() => void pick('library')}
        />
      </View>
      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : (
        <Text variant="footnote" tone="muted">
          {t('customers_app:photo_hint')}
        </Text>
      )}
    </View>
  );
}

/**
 * "Belge ekle" (type, driver, validity, note and a photo), or with `docUuid`
 * the file of an existing document. The record and the file go through the
 * documents API exactly as on the panel; no storage key is built here.
 */
export function DocumentScreen({ uuid, docUuid }: { uuid: string; docUuid?: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  return (
    <>
      <Stack.Screen options={{ title: docUuid ? t('documents.upload_file') : t('documents.create_title') }} />
      <WithCustomer uuid={uuid}>
        {() => (docUuid ? <UploadForm uuid={uuid} docUuid={docUuid} /> : <DocumentForm uuid={uuid} />)}
      </WithCustomer>
    </>
  );
}

function DocumentForm({ uuid }: { uuid: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const create = useCreateDocument(uuid);
  const drivers = useCustomerDrivers(uuid);
  const [docType, setDocType] = useState<DocumentType>('identity');
  const [driver, setDriver] = useState(NO_DRIVER);
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const { field, message } = useFormErrors({}, create.error);
  const submit = () =>
    create.mutate(
      {
        body: {
          doc_type: docType,
          driver_uuid: driver === NO_DRIVER ? null : driver,
          valid_until: validUntil || null,
          note: note.trim(),
        },
        file,
      },
      {
        onSuccess: () => {
          toast.success(file ? t('toast.document_uploaded') : t('toast.document_created'));
          router.back();
        },
      },
    );
  return (
    <FormScreen
      footer={<Footer message={message} title={t('actions.save')} loading={create.isPending} onPress={submit} />}>
      <Text variant="footnote" tone="muted">
        {t('documents.file_hint')}
      </Text>
      <Select
        label={t('documents.doc_type')}
        value={docType}
        options={DOCUMENT_TYPES.map((d) => ({ value: d, label: t(docTypeKey(d)) }))}
        onChange={setDocType}
        error={field('doc_type')}
      />
      <Select
        label={t('documents.driver')}
        value={driver}
        options={[
          { value: NO_DRIVER, label: t('documents.no_driver') },
          ...(drivers.data?.items ?? []).map((d) => ({ value: d.uuid, label: d.full_name })),
        ]}
        onChange={setDriver}
        error={field('driver_uuid')}
      />
      <DateField
        label={t('documents.valid_until')}
        value={validUntil || null}
        onChange={setValidUntil}
        onClear={() => setValidUntil('')}
        error={field('valid_until')}
      />
      <TextArea label={t('fields.note')} value={note} onChangeText={setNote} maxLength={2000} error={field('note')} />
      <PhotoPicker file={file} onPick={setFile} baseName={docType} error={field('file')} />
    </FormScreen>
  );
}

function UploadForm({ uuid, docUuid }: { uuid: string; docUuid: string }) {
  const { t } = useTranslation(['customers', 'customers_app']);
  const docs = useCustomerDocuments(uuid);
  const upload = useUploadDocumentFile(uuid);
  const [file, setFile] = useState<PickedFile | null>(null);
  const { field, message } = useFormErrors({}, upload.error);
  return (
    <QueryState query={docs}>
      {(data) => {
        const doc = data.items.find((d) => d.uuid === docUuid);
        if (!doc) return <EmptyState icon="document" title={t('common:no_results')} />;
        return (
          <FormScreen
            footer={
              <Footer
                message={message}
                title={t('documents.upload')}
                disabled={!file}
                loading={upload.isPending}
                onPress={() =>
                  file &&
                  upload.mutate(
                    { docUuid, file },
                    {
                      onSuccess: () => {
                        toast.success(t('toast.document_uploaded'));
                        router.back();
                      },
                    },
                  )
                }
              />
            }>
            <Card>
              <Text variant="headline">{t(docTypeKey(doc.doc_type))}</Text>
              <Text variant="footnote" tone="muted">
                {[doc.driver?.full_name ?? t('documents.no_driver'), doc.has_file ? doc.file_name : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </Card>
            {doc.has_file ? <Text tone="muted">{t('customers_app:replace_note')}</Text> : null}
            <PhotoPicker file={file} onPick={setFile} baseName={doc.doc_type} error={field('file')} />
          </FormScreen>
        );
      }}
    </QueryState>
  );
}
