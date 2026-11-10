import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ComponentRef, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TextInput, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { isApiError } from '@/core/api/errors';
import { login } from '@/core/auth/api';
import { useSession } from '@/core/auth/session';
import { WEB_URL } from '@/core/config';
import { apiErrorMessage } from '@/core/i18n';
import { BrandMark } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { brandIn, riseIn } from '@/ui/motion';
import { Text } from '@/ui/text';

import { AppleButton } from './apple-button';
import { linkChoice } from './link-choice';
import { type NativeCredential, type NativeProvider, nativeSignIn } from './oauth';
import { requestAppleCredential, requestGoogleCredential, useSocialProviders } from './social';

const AwareScrollView = withUniwind(KeyboardAwareScrollView);

/** The provider credential waiting for the 2FA code. */
type Pending = { provider: NativeProvider; credential: NativeCredential };

/**
 * E-mail + password against `/v1/auth/login`. When the account has 2FA the
 * API answers `MFA_REQUIRED`; the same form then asks for the code and sends
 * everything again. Sign in with Apple (iOS) and Google sign in or create the
 * account through `/v1/auth/oauth/{provider}/native`; with 2FA the form asks
 * for the code and resends the same credential, and an Apple relay e-mail
 * opens the link-or-create choice (`/oauth-link`). Forgot password opens the
 * panel's page in the in-app browser. Passkey sign-in is web only for now.
 */
export function SignInScreen() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  const providers = useSocialProviders();

  const signIn = useMutation({
    mutationFn: async () => {
      const tokens = await login({ email, password, totpCode: needsTotp ? totp : undefined });
      await useSession.getState().signIn(tokens);
    },
    onError: (e) => {
      if (isApiError(e, 'MFA_REQUIRED')) setNeedsTotp(true);
    },
  });

  const social = useMutation({
    mutationFn: async (input: { provider: NativeProvider; credential?: NativeCredential; totp?: string }) => {
      const credential =
        input.credential ??
        (input.provider === 'apple' ? await requestAppleCredential() : await requestGoogleCredential());
      if (!credential) return;
      try {
        const tokens = await nativeSignIn(input.provider, credential, input.totp);
        await useSession.getState().signIn(tokens);
      } catch (e) {
        if (isApiError(e, 'MFA_REQUIRED')) {
          setPending({ provider: input.provider, credential });
          setNeedsTotp(true);
          return;
        }
        const choice = isApiError(e, 'OAUTH_LINK_CHOICE_REQUIRED') ? linkChoice(e.details) : null;
        if (choice) {
          setPending(null);
          setNeedsTotp(false);
          router.push({
            pathname: '/oauth-link',
            params: { ticket: choice.ticket, register: choice.registerAllowed ? '1' : '0' },
          });
          return;
        }
        throw e;
      }
    },
  });

  const cancelSocial = () => {
    setPending(null);
    setNeedsTotp(false);
    setTotp('');
    social.reset();
  };

  const startSocial = (provider: NativeProvider) => {
    setNeedsTotp(false);
    setTotp('');
    signIn.reset();
    social.mutate({ provider });
  };

  const failed = pending || social.error ? social.error : signIn.error;
  const error = failed && !isApiError(failed, 'MFA_REQUIRED') ? apiErrorMessage(failed) : undefined;
  const ready = pending ? !!totp.trim() : !!email.trim() && !!password && (!needsTotp || !!totp.trim());
  const busy = signIn.isPending || social.isPending;
  const submit = () => {
    if (!ready || busy) return;
    if (pending) social.mutate({ provider: pending.provider, credential: pending.credential, totp });
    else signIn.mutate();
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      {/* The focused field and the sign-in button stay above the keyboard. */}
      <AwareScrollView
        bottomOffset={96}
        contentContainerClassName="flex-grow justify-center gap-6 px-6 py-10"
        keyboardShouldPersistTaps="handled">
        <View className="items-center gap-3">
          <Animated.View entering={brandIn}>
            <BrandMark size={72} />
          </Animated.View>
          <Animated.View entering={riseIn(2)} className="items-center gap-3">
            <Text variant="largeTitle">{t('welcome_title')}</Text>
            <Text variant="callout" tone="muted" className="text-center">
              {t('welcome_body')}
            </Text>
          </Animated.View>
        </View>

        <Animated.View entering={riseIn(4)} className="gap-4">
          {pending ? (
            <Text variant="callout" tone="muted">
              {t('social_totp_hint')}
            </Text>
          ) : (
            <>
              <Input
                label={t('email')}
                icon="mail"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
              <Input
                ref={passwordRef}
                label={t('password')}
                icon="password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                returnKeyType={needsTotp ? 'next' : 'go'}
                onSubmitEditing={submit}
              />
            </>
          )}
          {needsTotp ? (
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
              returnKeyType="go"
              onSubmitEditing={submit}
            />
          ) : null}
          {error ? (
            <Text variant="footnote" tone="danger" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            icon="signIn"
            title={t('sign_in')}
            size="lg"
            loading={pending ? social.isPending : signIn.isPending}
            disabled={!ready || busy}
            onPress={submit}
          />
          {pending ? (
            <Button title={t('totp_cancel')} variant="ghost" onPress={cancelSocial} />
          ) : (
            <Button
              title={t('forgot_password')}
              variant="ghost"
              onPress={() => void WebBrowser.openBrowserAsync(`${WEB_URL}/forgot-password`)}
            />
          )}
          {(providers.apple || providers.google) && !pending ? (
            <>
              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-border" />
                <Text variant="footnote" tone="muted">
                  {t('or')}
                </Text>
                <View className="h-px flex-1 bg-border" />
              </View>
              {providers.apple ? (
                <AppleButton
                  loading={social.isPending && social.variables?.provider === 'apple'}
                  onPress={() => startSocial('apple')}
                />
              ) : null}
              {providers.google ? (
                <Button
                  title={t('continue_google')}
                  icon="user"
                  variant="outline"
                  size="lg"
                  loading={social.isPending && social.variables?.provider === 'google'}
                  disabled={busy}
                  onPress={() => startSocial('google')}
                />
              ) : null}
            </>
          ) : null}
        </Animated.View>
      </AwareScrollView>
    </SafeAreaView>
  );
}
