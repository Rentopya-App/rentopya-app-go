import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { Can, Permission } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { useUploadQueue } from '@/features/uploads';
import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { EmptyState } from '@/ui/empty-state';
import { FormScreen } from '@/ui/screen';
import { Skeleton } from '@/ui/skeleton';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { problemText, useInspection, useStartInspection, useUpdateDraft } from './api';
import { CompleteStep } from './complete-step';
import { DamageStep } from './damage-step';
import { KabisBadge } from './kabis-badge';
import {
  boundStep,
  stepState,
  stepsOf,
  type Inspection,
  type InspectionDraftRequest,
  type InspectionKind,
  type WizardStep,
} from './model';
import { Notice } from './parts';
import { PhotosStep } from './photos-step';
import { SignatureStep } from './signature-step';
import { ReadingsStep, ReviewStep, VerifyStep } from './steps';
import { WizardContext, type WizardContextValue } from './wizard-context';
import { useWizardDraft } from './wizard-draft';

/** Steps both wizards share; a wizard adds its own (handover: amounts, return: charges). */
const COMMON: Partial<Record<WizardStep, () => ReactNode>> = {
  verify: () => <VerifyStep />,
  readings: () => <ReadingsStep />,
  damages: () => <DamageStep />,
  photos: () => <PhotosStep />,
  review: () => <ReviewStep />,
  signature: () => <SignatureStep />,
};

export type WizardProps = {
  kind: InspectionKind;
  /** Steps of this kind only (amounts, charges). */
  extraSteps?: Partial<Record<WizardStep, () => ReactNode>>;
  /** Shown under the "done" card of a finalized form (the return's review and charges). */
  finished?: (ins: Inspection) => ReactNode;
};

/**
 * The handover / return wizard of a rental (`/field/handover|return/{rental}`),
 * step for step the panel's `InspectionWizard`: it starts (or resumes) the
 * rental's form on the server, keeps the current step and unsent text on the
 * device, queues photos and the signature for upload, and needs a connection
 * for everything else.
 */
export function InspectionWizardScreen(props: WizardProps) {
  const { t } = useTranslation('inspections');
  return (
    <>
      <Stack.Screen options={{ title: t(props.kind === 'handover' ? 'wizard.title_handover' : 'wizard.title_return') }} />
      <Can perm={Permission.TenantRentalsWrite} fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
        <Wizard {...props} />
      </Can>
    </>
  );
}

function Wizard({ kind, extraSteps, finished }: WizardProps) {
  const { t } = useTranslation('inspections');
  const { rentalUuid } = useLocalSearchParams<{ rentalUuid: string }>();
  const orgSlug = useSession((s) => s.organization?.slug ?? '');
  const started = useStartInspection(rentalUuid, kind);
  const uuid = started.data?.uuid ?? null;
  const live = useInspection(uuid, started.data);
  const ins = live.data ?? started.data;
  const update = useUpdateDraft(uuid ?? '');
  const queue = useUploadQueue(uuid);
  const draft = useWizardDraft(uuid);
  const [scrollLocked, setScrollLocked] = useState(false);
  const steps = stepsOf(kind);
  const step = boundStep(draft.step, kind);
  const current = steps[step];

  const commit = useCallback(
    async (patch: InspectionDraftRequest) => {
      if (!queue.online) {
        toast.error(t('offline.needs_connection'));
        return false;
      }
      try {
        await update.mutateAsync(patch);
        return true;
      } catch (e) {
        toast.error(problemText(e));
        return false;
      }
    },
    [queue.online, t, update],
  );

  const goto = useCallback(
    (next: number) => {
      draft.setStep(Math.max(0, Math.min(steps.length - 1, next)));
    },
    [draft, steps.length],
  );

  const ctx = useMemo<WizardContextValue | null>(
    () =>
      ins
        ? {
            ins,
            readOnly: ins.status !== 'draft',
            online: queue.online,
            locked: ins.status !== 'draft' || !queue.online,
            commit,
            values: draft.values,
            setValue: draft.setValue,
            queue,
            orgSlug,
            setScrollLocked,
            goto: (s: WizardStep) => goto(steps.indexOf(s)),
          }
        : null,
    [commit, draft.setValue, draft.values, goto, ins, orgSlug, queue, steps],
  );

  if (started.isError) {
    const offline = isApiError(started.error, 'NETWORK_ERROR');
    return (
      <EmptyState
        icon={offline ? 'offline' : 'error'}
        title={offline ? t('offline.start_title') : t('wizard.start_failed')}
        body={offline ? t('offline.start_body') : problemText(started.error)}
        action={{ title: t('common:retry'), icon: 'refresh', onPress: () => void started.refetch() }}
      />
    );
  }
  if (!ins || !ctx) {
    return (
      <View className="flex-1 gap-3 bg-background p-4">
        <Skeleton className="h-20" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </View>
    );
  }

  const render = extraSteps?.[current] ?? COMMON[current];
  const pendingUploads = queue.pending;

  return (
    <WizardContext.Provider value={ctx}>
      <Stack.Screen
        options={{
          title: `${t(kind === 'handover' ? 'wizard.title_handover' : 'wizard.title_return')} · ${ins.rental.reference}`,
        }}
      />
      <FormScreen
        // A new step starts at the top.
        key={current}
        scrollEnabled={!scrollLocked}
        refreshControl={<RefreshControl refreshing={live.isRefetching} onRefresh={() => void live.refetch()} />}
        footer={
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              icon="back"
              title={t('wizard.back')}
              disabled={step === 0}
              onPress={() => goto(step - 1)}
              className="flex-1"
            />
            {step < steps.length - 1 ? (
              <Button
                icon="forward"
                title={t('wizard.next')}
                onPress={() => goto(step + 1)}
                className="flex-1"
                testID="wizard-next"
              />
            ) : null}
          </View>
        }>
        <View className="gap-2 px-1">
          <Text variant="callout" tone="muted" numberOfLines={1}>
            {`${ins.rental.vehicle.plate} · ${ins.rental.customer.display_name}`}
          </Text>
          <View className="flex-row flex-wrap items-center gap-1.5">
            {ins.version > 1 ? <StatusPill label={`v${ins.version}`} /> : null}
            {!queue.online ? <StatusPill label={t('offline.offline')} tone="problem" /> : null}
            {pendingUploads > 0 ? (
              <StatusPill label={t('queue.pending', { count: pendingUploads })} tone="progress" />
            ) : null}
            {queue.failed > 0 ? <StatusPill label={t('queue.failed', { count: queue.failed })} tone="problem" /> : null}
            <KabisBadge rentalUuid={ins.rental.uuid} />
          </View>
          <Text variant="headline" testID="wizard-step">
            {`${t('wizard.step_of', { step: step + 1, total: steps.length })} · ${t(`steps.${current}`)}`}
          </Text>
          <View className="flex-row gap-1" accessibilityRole="progressbar">
            {steps.map((s, i) => (
              <View
                key={s}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  i === step ? 'bg-primary' : stepState(s, ins) === 'done' ? 'bg-success' : 'bg-muted',
                )}
              />
            ))}
          </View>
        </View>
        {!queue.online && ins.status === 'draft' ? (
          <Notice tone="warning" icon="offline" title={t('offline.offline')} body={t('offline.banner')} />
        ) : null}
        {current === 'complete' ? <CompleteStep finished={finished} /> : render ? render() : null}
      </FormScreen>
    </WizardContext.Provider>
  );
}
