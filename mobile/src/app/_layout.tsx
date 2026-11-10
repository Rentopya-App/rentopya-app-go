import '@/global.css';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import { useSession } from '@/core/auth/session';
import { FONTS } from '@/core/fonts';
import { i18n } from '@/core/i18n';
import { applyThemePreference } from '@/core/preferences';
import { persistOptions, queryClient } from '@/core/query';
import { startUpdateChecks } from '@/core/updates';
import { GlanceHost } from '@/features/glance/host';
import { ErrorFallback } from '@/features/shell/error-fallback';
import { LaunchVeil } from '@/features/shell/launch-veil';
import { useNavigationTheme } from '@/features/shell/navigation-theme';
import { PushNotifications } from '@/features/push/push-notifications';
import { UpdateBanner } from '@/features/shell/update-banner';
import { Toaster } from '@/ui/toast';

// Keep the splash only until the fonts are ready (local, no network wait).
void SplashScreen.preventAutoHideAsync();
applyThemePreference();

// A render error must never reach React Native's fatal handler (release builds abort on it):
// each screen falls back on its own so navigation still works, and the root catches the rest.
export const ErrorBoundary = ErrorFallback;
export const unstable_settings = { screenErrorBoundary: ErrorFallback };

/**
 * Root shell. The token pair is read from the secure store before the splash
 * hides; `Stack.Protected` then shows the signed-in shell (`(app)`) or the
 * sign-in screens (`(public)`), and switches on sign-in / sign-out / a dead
 * refresh chain.
 */
export default function RootLayout() {
  const theme = useNavigationTheme();
  const status = useSession((s) => s.status);
  // Bundled with the app, so loading is local; on failure the system font stands in.
  const [fontsLoaded, fontError] = useFonts(FONTS);
  const fontsReady = fontsLoaded || !!fontError;

  // OTA: check on launch and each foreground (throttled); no-op in dev builds and Expo Go.
  useEffect(() => startUpdateChecks(), []);

  useEffect(() => {
    void useSession.getState().hydrate();
  }, []);

  useEffect(() => {
    if (fontsReady && status !== 'loading') void SplashScreen.hideAsync();
  }, [fontsReady, status]);

  if (!fontsReady || status === 'loading') return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <I18nextProvider i18n={i18n}>
          <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
            <ThemeProvider value={theme}>
              <StatusBar style="auto" />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Protected guard={status === 'signedIn'}>
                  <Stack.Screen name="(app)" />
                </Stack.Protected>
                <Stack.Protected guard={status === 'signedOut'}>
                  <Stack.Screen name="(public)" />
                </Stack.Protected>
              </Stack>
              <PushNotifications />
              <UpdateBanner />
              <GlanceHost />
              <Toaster />
              <LaunchVeil />
            </ThemeProvider>
          </PersistQueryClientProvider>
        </I18nextProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
