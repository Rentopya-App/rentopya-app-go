import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';

/** Signed-in shell: the tabs, and later the pushed detail screens of each module. */
export default function AppLayout() {
  const { t } = useTranslation();
  return (
    <Stack screenOptions={{ headerBackTitle: t('common:back'), headerShadowVisible: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
