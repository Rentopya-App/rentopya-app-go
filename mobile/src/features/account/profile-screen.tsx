import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formErrors } from '@/core/api/form-errors';
import { useSession } from '@/core/auth/session';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { useUpdateProfile } from './api';

/**
 * Name and surname (`PATCH /v1/auth/profile`), like the panel's profile form.
 * The e-mail is shown read-only: the API does not change it here, and the
 * profile has no phone field.
 */
export function ProfileScreen() {
  const { t } = useTranslation('account');
  const user = useSession((s) => s.me?.user);
  const [name, setName] = useState(user?.name ?? '');
  const [surname, setSurname] = useState(user?.surname ?? '');
  const save = useUpdateProfile();
  const err = formErrors(save.error);
  const ok = name.trim().length > 0 && surname.trim().length > 0;
  const changed = name.trim() !== (user?.name ?? '') || surname.trim() !== (user?.surname ?? '');

  return (
    <>
      <Stack.Screen options={{ title: t('profile.edit_title') }} />
      <FormScreen
        footer={
          <>
            {err.message ? (
              <Text variant="footnote" tone="danger">
                {err.message}
              </Text>
            ) : null}
            <Button
              title={t('common:save')}
              size="lg"
              disabled={!ok || !changed}
              loading={save.isPending}
              onPress={() =>
                save.mutate(
                  { name: name.trim(), surname: surname.trim() },
                  {
                    onSuccess: () => {
                      toast.success(t('profile.save_success'));
                      router.back();
                    },
                  },
                )
              }
            />
          </>
        }>
        <Input
          label={t('profile.first_name')}
          value={name}
          onChangeText={setName}
          autoComplete="given-name"
          textContentType="givenName"
          error={err.fields.name || (name.trim() ? undefined : t('common:required'))}
        />
        <Input
          label={t('profile.last_name')}
          value={surname}
          onChangeText={setSurname}
          autoComplete="family-name"
          textContentType="familyName"
          error={err.fields.surname || (surname.trim() ? undefined : t('common:required'))}
        />
        <Input
          label={t('profile.email')}
          icon="mail"
          value={user?.email ?? ''}
          editable={false}
          hint={t('profile.email_hint')}
        />
      </FormScreen>
    </>
  );
}
