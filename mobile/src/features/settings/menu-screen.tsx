import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { APP_VERSION } from '@/core/config';
import { type Language, LANGUAGES, setLanguage } from '@/core/i18n';
import { type ThemePreference, usePreferences } from '@/core/preferences';
import { Chips } from '@/ui/chips';
import { List, ListRow, SectionHeader } from '@/ui/list';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/** Menu tab: account entry, app preferences (language, appearance) and the version. */
export function MenuScreen() {
  const { t, i18n } = useTranslation('settings');
  const theme = usePreferences((s) => s.theme);
  const setTheme = usePreferences((s) => s.setTheme);
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('theme_system') },
    { value: 'light', label: t('theme_light') },
    { value: 'dark', label: t('theme_dark') },
  ];

  return (
    <>
      <Stack.Screen options={{ title: t('title') }} />
      <Screen>
        <View>
          <SectionHeader title={t('section_account')} />
          <List>
            <ListRow icon="signIn" title={t('sign_in')} onPress={() => router.push('/sign-in')} last />
          </List>
        </View>
        <View>
          <SectionHeader title={t('section_app')} />
          <List>
            <View className="gap-2 border-b border-border px-4 py-3">
              <Text variant="footnote" tone="muted">
                {t('language')}
              </Text>
              <Chips<Language>
                options={LANGUAGES.map((l) => ({ value: l.code, label: l.name }))}
                value={i18n.language as Language}
                onChange={(l) => void setLanguage(l)}
              />
            </View>
            <View className="gap-2 px-4 py-3">
              <Text variant="footnote" tone="muted">
                {t('theme')}
              </Text>
              <Chips options={themes} value={theme} onChange={setTheme} />
            </View>
          </List>
        </View>
        <View>
          <SectionHeader title={t('section_about')} />
          <List>
            <ListRow
              icon="info"
              title={t('version')}
              trailing={
                <Text variant="callout" tone="muted">
                  {APP_VERSION}
                </Text>
              }
              last
            />
          </List>
        </View>
      </Screen>
    </>
  );
}
