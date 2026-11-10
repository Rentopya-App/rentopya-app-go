import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { deletionApi } from './api';
import { confirmAction } from './confirm';
import { lastOwnerOrganizations } from './lib';
import { isStepUpRequired, StepUpHost, withStepUp } from './step-up';

/**
 * "Hesabımı sil" (App Store 5.1.1(v); docs/design/account-deletion.md):
 * `POST /v1/auth/account/deactivate` closes the account, signs every device
 * out and keeps it restorable for 30 days through the e-mailed link. Confirm
 * with the e-mailed 6-digit code (as the panel does) or with the password
 * (step-up). The only owner of a company must hand over ownership first
 * (`409 LAST_ORGANIZATION_OWNER`).
 */
export function DeleteAccountScreen() {
  const { t } = useTranslation('account');
  const email = useSession((s) => s.me?.user.email ?? '');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<'code' | 'confirm' | 'password' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [owners, setOwners] = useState<{ name: string; slug: string | null }[]>([]);

  const fail = (e: unknown) => {
    if (isApiError(e, 'LAST_ORGANIZATION_OWNER')) {
      setOwners(lastOwnerOrganizations(e.details));
      setError(null);
      return;
    }
    if (isApiError(e, 'INVALID_EMAIL_CODE')) return setError(t('delete.invalid_code'));
    if (isStepUpRequired(e)) return setError(t('delete.step_up_cancelled'));
    setError(apiErrorMessage(e));
  };

  const done = async () => {
    toast.success(t('delete.success'));
    // Every refresh session is already gone on the API: clear this device only.
    await useSession.getState().signOut({ remote: false });
  };

  const sendCode = async () => {
    setPending('code');
    setError(null);
    try {
      await deletionApi.requestCode();
      setCodeSent(true);
      setOwners([]);
    } catch (e) {
      fail(e);
    } finally {
      setPending(null);
    }
  };

  const confirmWithCode = async () => {
    const ok = await confirmAction({
      title: t('delete.confirm_title'),
      body: t('delete.confirm_body'),
      action: t('delete.confirm'),
      destructive: true,
    });
    if (!ok) return;
    setPending('confirm');
    setError(null);
    try {
      await deletionApi.deactivate(code.trim());
      await done();
    } catch (e) {
      fail(e);
      setPending(null);
    }
  };

  const confirmWithPassword = async () => {
    const ok = await confirmAction({
      title: t('delete.confirm_title'),
      body: t('delete.confirm_body'),
      action: t('delete.confirm'),
      destructive: true,
    });
    if (!ok) return;
    setPending('password');
    setError(null);
    try {
      await withStepUp(() => deletionApi.deactivate());
      await done();
    } catch (e) {
      fail(e);
      setPending(null);
    }
  };

  const codeOk = /^\d{6,}$/.test(code.trim());

  return (
    <>
      <Stack.Screen options={{ title: t('delete.title') }} />
      <StepUpHost />
      <FormScreen
        footer={
          <>
            {error ? (
              <Text variant="footnote" tone="danger">
                {error}
              </Text>
            ) : null}
            {codeSent ? (
              <Button
                title={t('delete.confirm')}
                icon="trash"
                variant="destructive"
                size="lg"
                disabled={!codeOk || !!pending}
                loading={pending === 'confirm'}
                onPress={() => void confirmWithCode()}
              />
            ) : (
              <Button
                title={t('delete.send_code')}
                icon="mail"
                size="lg"
                disabled={!!pending}
                loading={pending === 'code'}
                onPress={() => void sendCode()}
              />
            )}
            <Button
              title={t('delete.with_password')}
              icon="password"
              variant="ghost"
              disabled={!!pending}
              loading={pending === 'password'}
              onPress={() => void confirmWithPassword()}
            />
          </>
        }>
        <Card>
          <View className="flex-row items-center gap-2">
            <Icon name="error" tone="destructive" size={20} />
            <Text variant="headline" className="flex-1">
              {t('delete.dialog_title')}
            </Text>
          </View>
          <Text variant="callout">{t('delete.description')}</Text>
          <Text variant="callout" tone="muted">
            {t('delete.restore_window')}
          </Text>
        </Card>
        {owners.length ? (
          <Card title={t('delete.last_owner_title')}>
            <Text variant="callout">{t('delete.last_owner_body')}</Text>
            {owners.map((o) => (
              <View key={o.slug ?? o.name} className="flex-row items-center gap-2">
                <Icon name="building" tone="primary" size={18} />
                <Text className="flex-1">{o.name}</Text>
              </View>
            ))}
          </Card>
        ) : null}
        {codeSent ? (
          <Input
            label={t('delete.code')}
            hint={t('delete.code_sent', { email })}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={6}
            placeholder="000000"
            autoFocus
          />
        ) : (
          <Text variant="callout" tone="muted" className="px-1">
            {t('delete.code_intro', { email })}
          </Text>
        )}
      </FormScreen>
    </>
  );
}
