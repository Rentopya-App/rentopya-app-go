import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Signed-out screens: sign-in (e-mail + password, 2FA code, Apple / Google) and the account-link choice. */
export default function PublicLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackTitle: t('common:back'), headerShadowVisible: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="oauth-link" options={{ title: t('auth:link_nav') }} />
    </Stack>
  );
}
