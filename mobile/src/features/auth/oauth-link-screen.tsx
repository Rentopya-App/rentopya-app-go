import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { isApiError } from '@/core/api/errors';
import type { ApiTokens } from '@/core/auth/api';
import { useSession } from '@/core/auth/session';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { FormScreen } from '@/ui/screen';
import { Text } from '@/ui/text';

import { createFromLink, requestLinkCode, verifyLink } from './oauth';

type Step = 'choose' | 'email' | 'code';

/**
 * The provider hid the e-mail (Apple private relay) and no account has this
 * identity yet. The person either proves an existing account with a code
 * sent to its e-mail (`/v1/auth/oauth/link/request` → `/verify`), or creates
 * a new one (`/link/create`, only when registration is open). The ticket
 * from the sign-in error is valid for 15 minutes.
 */
export function OAuthLinkScreen() {
  const { t } = useTranslation('auth');
  const { ticket = '', register } = useLocalSearchParams<{ ticket: string; register?: string }>();
  const [step, setStep] = useState<Step>('choose');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);

  // The root guard leaves the public screens once the session exists.
  const done = (tokens: ApiTokens) => useSession.getState().signIn(tokens);
  const onError = (e: Error) => {
    if (isApiError(e, 'MFA_REQUIRED')) setNeedsTotp(true);
  };

  const send = useMutation({
    mutationFn: () => requestLinkCode(ticket, email),
    onSuccess: () => setStep('code'),
  });
  const verify = useMutation({
    mutationFn: () => verifyLink({ ticket, email, code, totpCode: needsTotp ? totp : undefined }),
    onSuccess: done,
    onError,
  });
  const create = useMutation({
    mutationFn: () => createFromLink(ticket, needsTotp ? totp : undefined),
    onSuccess: done,
    onError,
  });

  const failed = step === 'choose' ? create.error : step === 'email' ? send.error : verify.error;
  const expired = isApiError(failed, 'INVALID_LINK_TICKET');
  const error = failed && !isApiError(failed, 'MFA_REQUIRED') ? apiErrorMessage(failed) : undefined;
  const totpInput = needsTotp ? (
    <Input
      label={t('totp_code')}
      icon="security"
      hint={t('totp_hint')}
      value={totp}
      onChangeText={setTotp}
      autoFocus
      autoCapitalize="none"
      keyboardType="number-pad"
      textContentType="oneTimeCode"
      autoComplete="one-time-code"
    />
  ) : null;

  const footer = expired ? (
    <Button icon="refresh" title={t('link_restart')} size="lg" onPress={() => router.back()} />
  ) : step === 'email' ? (
    <Button
      icon="mail"
      title={t('link_send')}
      size="lg"
      loading={send.isPending}
      disabled={!email.includes('@')}
      onPress={() => send.mutate()}
    />
  ) : step === 'code' ? (
    <Button
      icon="check"
      title={t('link_confirm')}
      size="lg"
      loading={verify.isPending}
      disabled={code.trim().length < 6 || (needsTotp && !totp.trim())}
      onPress={() => verify.mutate()}
    />
  ) : needsTotp ? (
    <Button
      icon="add"
      title={t('link_create')}
      size="lg"
      loading={create.isPending}
      disabled={!totp.trim()}
      onPress={() => create.mutate()}
    />
  ) : null;

  return (
    <FormScreen footer={footer}>
      <Card>
        <Text variant="headline">{t('link_title')}</Text>
        <Text tone="muted">{t('link_body')}</Text>
      </Card>

      {step === 'choose' ? (
        <View className="gap-3">
          <Button
            title={t('link_existing')}
            icon="user"
            variant="outline"
            size="lg"
            onPress={() => {
              setNeedsTotp(false);
              create.reset();
              setStep('email');
            }}
          />
          {register === '1' ? (
            <Button
              title={t('link_create')}
              icon="add"
              size="lg"
              loading={create.isPending}
              onPress={() => create.mutate()}
            />
          ) : (
            <Text variant="footnote" tone="muted">
              {t('link_no_register')}
            </Text>
          )}
          {totpInput}
        </View>
      ) : step === 'email' ? (
        <Input
          label={t('email')}
          icon="mail"
          hint={t('link_email_hint')}
          value={email}
          onChangeText={setEmail}
          autoFocus
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="send"
          onSubmitEditing={() => email.includes('@') && send.mutate()}
        />
      ) : (
        <View className="gap-4">
          <Input
            label={t('link_code')}
            hint={t('link_code_hint', { email: email.trim() })}
            value={code}
            onChangeText={setCode}
            autoFocus={!needsTotp}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
          />
          {totpInput}
          <Button
            icon="refresh"
            title={t('link_resend')}
            variant="ghost"
            loading={send.isPending}
            onPress={() => send.mutate()}
          />
        </View>
      )}

      {error ? (
        <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </FormScreen>
  );
}
