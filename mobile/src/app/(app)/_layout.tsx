import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/core/auth/session';
import { useUploadWorker } from '@/features/uploads';
import { toast } from '@/ui/toast';

/**
 * Signed-in shell. The cached session renders first; `/v1/auth/me` refreshes
 * it in the background (launch and foreground), so changed roles or a
 * removed membership show up. Company screens (`(org)`) need a picked
 * organization; until one is picked only the picker is reachable.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  const hasOrganization = useSession((s) => !!s.organization);
  const lost = useSession((s) => s.lostOrganization);
  useUploadWorker();

  useQuery({
    queryKey: ['me'],
    queryFn: () => useSession.getState().refreshMe(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (lost) toast.error(t('auth:org_lost', { name: lost.name }));
  }, [lost, t]);

  return (
    <Stack screenOptions={{ headerBackTitle: t('common:back'), headerShadowVisible: false }}>
      <Stack.Protected guard={hasOrganization}>
        <Stack.Screen name="(org)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen
        name="organizations"
        options={{
          title: t('auth:pick_org_title'),
          presentation: hasOrganization ? 'modal' : 'card',
          headerShown: hasOrganization,
        }}
      />
    </Stack>
  );
}
