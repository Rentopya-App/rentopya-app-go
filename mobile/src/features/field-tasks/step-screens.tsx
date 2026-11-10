import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Can, Permission, type PermissionSlug } from '@/core/auth/permissions';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { TextArea } from '@/ui/fields';
import { ReasonForm } from '@/ui/reason-form';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { stepErrorText, useFieldTaskStep } from './api';

const EXECUTORS: PermissionSlug[] = [Permission.TenantFieldTasksExecute, Permission.TenantFieldTasksAssign];

function Gate({ perm, children }: { perm: PermissionSlug[]; children: React.ReactNode }) {
  const { t } = useTranslation('field_tasks');
  return (
    <Can perm={perm} fallback={<EmptyState icon="security" title={t('common:forbidden')} body={t('forbidden')} />}>
      {children}
    </Can>
  );
}

/** `POST …/report-issue` with the issue (3-1000 characters); the task stays open. */
export function ReportIssueScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('field_tasks');
  const step = useFieldTaskStep(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('issue.title') }} />
      <Gate perm={EXECUTORS}>
        <ReasonForm
          description={t('issue.description')}
          label={t('fields.issue_note')}
          submitTitle={t('actions.report_issue')}
          destructive
          pending={step.isPending}
          error={null}
          onSubmit={(note) =>
            step.mutate(
              { step: 'report-issue', note },
              {
                onSuccess: () => {
                  toast.success(t('toast.issue_reported'));
                  router.back();
                },
                onError: (e) => toast.error(stepErrorText(e)),
              },
            )
          }
        />
      </Gate>
    </>
  );
}

/** `POST …/cancel` with the reason; planners only (`tenant.field_tasks.assign`). */
export function CancelTaskScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('field_tasks');
  const step = useFieldTaskStep(uuid);
  return (
    <>
      <Stack.Screen options={{ title: t('cancel.title') }} />
      <Gate perm={[Permission.TenantFieldTasksAssign]}>
        <ReasonForm
          description={t('cancel.description')}
          label={t('fields.reason')}
          submitTitle={t('actions.cancel')}
          destructive
          pending={step.isPending}
          error={null}
          onSubmit={(note) =>
            step.mutate(
              { step: 'cancel', note },
              {
                onSuccess: () => {
                  toast.success(t('toast.cancelled'));
                  router.back();
                },
                onError: (e) => toast.error(stepErrorText(e)),
              },
            )
          }
        />
      </Gate>
    </>
  );
}

/** `POST …/complete` with an optional note. Handover / return close through their form instead (409). */
export function CompleteTaskScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useTranslation('field_tasks');
  const step = useFieldTaskStep(uuid);
  const [note, setNote] = useState('');
  const submit = () =>
    step.mutate(
      { step: 'complete', note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(t('toast.completed'));
          router.back();
        },
        onError: (e) => toast.error(stepErrorText(e)),
      },
    );
  return (
    <>
      <Stack.Screen options={{ title: t('complete.title') }} />
      <Gate perm={EXECUTORS}>
        <FormScreen
          footer={
            <Button title={t('actions.complete')} size="lg" icon="check" loading={step.isPending} onPress={submit} />
          }>
          <Text tone="muted">{t('complete.description')}</Text>
          <TextArea
            label={`${t('fields.completion_note')} (${t('common:optional')})`}
            value={note}
            onChangeText={setNote}
            maxLength={1000}
          />
        </FormScreen>
      </Gate>
    </>
  );
}

/**
 * Placeholder of the rental's handover / return form (`/field/handover/…`,
 * `/field/return/…`) until the inspection wizard lands; same permission as
 * the panel's form (`tenant.rentals.write`).
 */
export function InspectionStubScreen({ kind }: { kind: 'handover' | 'return' }) {
  const { t } = useTranslation('field_tasks');
  return (
    <>
      <Stack.Screen
        options={{ title: t(kind === 'return' ? 'inspection.return_title' : 'inspection.handover_title') }}
      />
      <Gate perm={[Permission.TenantRentalsWrite]}>
        <EmptyState
          icon="car"
          title={t(kind === 'return' ? 'inspection.return_title' : 'inspection.handover_title')}
          body={t('inspection.coming')}
        />
      </Gate>
    </>
  );
}
