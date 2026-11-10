import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useTenantContext } from '@/core/tenant';
import { PushRegistration } from '@/features/push/push-notifications';

// A deep link (`rentopya://vehicle/{uuid}`) opens on top of the tabs, so back leads home.
export const unstable_settings = { initialRouteName: '(tabs)' };

/**
 * Company panel screens of the picked organization: the tabs, and later the
 * pushed detail screens of each module. Loads `/v1/tenant/context` (roles,
 * permissions, branch scope, features) up front; a membership that is gone
 * answers 403 there and the API client returns the member to the picker.
 */
export default function OrgLayout() {
  const { t } = useTranslation();
  useTenantContext();
  return (
    <>
      <PushRegistration />
      <Stack screenOptions={{ headerBackTitle: t('common:back'), headerShadowVisible: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
