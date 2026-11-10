import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Image, Linking, Platform, View } from 'react-native';

import { getTokens } from '@/core/auth/tokens';
import { Can, type PermissionSlug } from '@/core/auth/permissions';
import { useSession } from '@/core/auth/session';
import { API_URL, WEB_URL } from '@/core/config';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { panelUrl, statusTone, type PanelPage } from './lib';

/** Renders the screen only with the panel page's permission. */
export function Gate({ perm, children }: { perm: PermissionSlug | PermissionSlug[]; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Can perm={perm} fallback={<EmptyState icon="security" title={t('common:forbidden')} />}>
      {children}
    </Can>
  );
}

/** "Panelde aç": editors the app does not carry (templates, site, webhooks) open the web panel page. */
export function PanelLink({ page, suffix, label }: { page: PanelPage; suffix?: string; label?: string }) {
  const { t } = useTranslation('settings_app');
  const slug = useSession((s) => s.organization?.slug);
  if (!slug) return null;
  return (
    <Button
      title={label ?? t('open_in_panel')}
      variant="outline"
      icon="externalLink"
      onPress={() => Linking.openURL(panelUrl(WEB_URL, slug, page, suffix)).catch(() => toast.error(t('open_failed')))}
    />
  );
}

/** Asks before a destructive or sensitive step; resolves true on the action button. */
export function confirmAction(opts: {
  title: string;
  body?: string;
  action: string;
  cancel: string;
  destructive?: boolean;
}) {
  if (Platform.OS === 'web') {
    const ok = typeof globalThis.confirm === 'function' ? globalThis.confirm(opts.body ?? opts.title) : true;
    return Promise.resolve(ok);
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      opts.title,
      opts.body,
      [
        { text: opts.cancel, style: 'cancel', onPress: () => resolve(false) },
        { text: opts.action, style: opts.destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function Pill({ status, label }: { status: string; label: string }) {
  return <StatusPill label={label} tone={statusTone(status)} />;
}

/** Label / value line inside a card. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text variant="footnote" tone="muted" className="shrink-0">
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text variant="callout" className="flex-1 text-right" selectable>
          {value || '—'}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/**
 * Image from an API-owned path (`/v1/organizations/{uuid}/logo?v=…`), loaded
 * with the member's Bearer token; the app never builds a storage key.
 */
export function ApiImage({ path, size = 72 }: { path: string; size?: number }) {
  const token = getTokens()?.access;
  if (!token) return <View style={{ width: size, height: size }} className="rounded-md bg-muted" />;
  const uri = path.startsWith('http') ? path : `${API_URL}${path}`;
  return (
    <Image
      source={{ uri, headers: { Authorization: `Bearer ${token}` } }}
      resizeMode="contain"
      style={{ width: size, height: size }}
      className="rounded-md bg-muted"
      accessibilityIgnoresInvertColors
    />
  );
}
