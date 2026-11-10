import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Platform, View } from 'react-native';

import { errorMessage } from '@/core/i18n';
import { isApiError } from '@/core/api/errors';
import { Can, type PermissionSlug } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { WEB_URL } from '@/core/config';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { EmptyState } from '@/ui/empty-state';
import { SwitchRow } from '@/ui/fields';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { panelUrl, statusTone, type SectionKey } from './lib';

/** Screen body only with the permission of the panel page, else the forbidden state. */
export function Gate({ perm, children }: { perm: PermissionSlug | PermissionSlug[]; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Can perm={perm} fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
      {children}
    </Can>
  );
}

/** "Panelde aç": the panel page of the section (or record) in the browser, for editors the app leaves there. */
export function PanelButton({ section, uuid, title }: { section: SectionKey; uuid?: string; title?: string }) {
  const { t } = useTranslation('config_app');
  const slug = useSession((s) => s.organization?.slug);
  if (!slug) return null;
  return (
    <Button
      variant="outline"
      icon="externalLink"
      title={title ?? t('open_panel')}
      onPress={() => void WebBrowser.openBrowserAsync(panelUrl(WEB_URL, slug, section, uuid))}
    />
  );
}

/** One label / value line of a detail card. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text variant="callout" tone="muted" className="flex-1">
        {label}
      </Text>
      {typeof value === 'string' || typeof value === 'number' || empty ? (
        <Text variant="callout" className="flex-[1.4] text-right">
          {empty ? '—' : String(value)}
        </Text>
      ) : (
        <View className="flex-[1.4] items-end">{value}</View>
      )}
    </View>
  );
}

export function Pill({ status, label }: { status: string | null | undefined; label: string }) {
  return <StatusPill label={label} tone={statusTone(status)} />;
}

/** Detail screen: loads the record, renders its cards, the panel link last. */
export function DetailScreen<T>({
  title,
  perm,
  query,
  section,
  uuid,
  children,
}: {
  title: string;
  perm: PermissionSlug | PermissionSlug[];
  query: UseQueryResult<T>;
  section: SectionKey;
  uuid?: string;
  children: (data: T) => ReactNode;
}) {
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Gate perm={perm}>
        <Screen>
          <QueryState query={query}>
            {(data) => (
              <>
                {children(data)}
                <PanelButton section={section} uuid={uuid} />
              </>
            )}
          </QueryState>
        </Screen>
      </Gate>
    </>
  );
}

/** The API's message of a failed write, as a toast. */
export function toastError(e: unknown) {
  toast.error(errorMessage(isApiError(e) ? e.code : undefined, isApiError(e) ? e.message : undefined));
}

/**
 * Activate / deactivate switch of a record, behind the write permission;
 * read-only (disabled) without it. Asks before switching off.
 */
export function ActiveSwitch({
  value,
  perm,
  mutation,
  body,
  label,
  description,
}: {
  value: boolean;
  perm: PermissionSlug;
  mutation: UseMutationResult<unknown, unknown, any>;
  body: (on: boolean) => unknown;
  label?: string;
  description?: string;
}) {
  const { t } = useTranslation('config_app');
  const run = (on: boolean) =>
    mutation.mutate(body(on), {
      onSuccess: () => toast.success(t(on ? 'toast.activated' : 'toast.deactivated')),
      onError: toastError,
    });
  const change = (on: boolean) => {
    if (on || Platform.OS === 'web') return run(on);
    Alert.alert(t('deactivate_title'), t('deactivate_body'), [
      { text: t('common:cancel'), style: 'cancel' },
      { text: t('deactivate'), style: 'destructive', onPress: () => run(false) },
    ]);
  };
  return (
    <Can
      perm={perm}
      fallback={
        <SwitchRow label={label ?? t('active')} description={description} value={value} onChange={() => {}} disabled />
      }>
      <SwitchRow
        label={label ?? t('active')}
        description={description}
        value={value}
        onChange={change}
        disabled={mutation.isPending}
      />
    </Can>
  );
}

export { Card };
