import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formErrors } from '@/core/api/form-errors';
import { Button } from '@/ui/button';
import { SwitchRow } from '@/ui/fields';
import { QueryState } from '@/ui/query-state';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { type NotificationPreferences, useNotificationPreferences, useSaveNotificationPreferences } from './api';

const KEYS = ['email_enabled', 'inapp_enabled', 'realtime_enabled', 'push_enabled'] as const;

/**
 * The user's channels (`/v1/notification-preferences`), the panel's form.
 * `push_enabled` gates phone and browser pushes alike on the API; this
 * device's push registration is handled by the push module.
 */
export function NotificationPreferencesScreen() {
  const { t } = useTranslation('account');
  const prefs = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  // Only the switches the user moved; the rest follows the saved preferences.
  const [draft, setDraft] = useState<Partial<NotificationPreferences>>({});
  const values: NotificationPreferences | null = prefs.data ? { ...prefs.data, ...draft } : null;
  const err = formErrors(save.error);
  const changed = !!values && !!prefs.data && KEYS.some((k) => values[k] !== prefs.data[k]);

  return (
    <>
      <Stack.Screen options={{ title: t('preferences.title') }} />
      <FormScreen
        footer={
          <>
            {err.message ? (
              <Text variant="footnote" tone="danger">
                {err.message}
              </Text>
            ) : null}
            <Button
              title={t('preferences.save')}
              size="lg"
              disabled={!changed}
              loading={save.isPending}
              onPress={() =>
                values &&
                save.mutate(values, {
                  onSuccess: () => {
                    setDraft({});
                    toast.success(t('preferences.save_success'));
                  },
                })
              }
            />
          </>
        }>
        <Text tone="muted" className="px-1">
          {t('preferences.description')}
        </Text>
        <QueryState query={prefs} rows={4}>
          {() =>
            values ? (
              <>
                {KEYS.map((k) => {
                  const name = k.replace('_enabled', '');
                  return (
                    <SwitchRow
                      key={k}
                      label={t(`preferences.${name}`)}
                      description={t(`preferences.${name}_hint`)}
                      value={values[k]}
                      onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                    />
                  );
                })}
              </>
            ) : null
          }
        </QueryState>
      </FormScreen>
    </>
  );
}
