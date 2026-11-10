import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { api, unwrap } from '@/core/api/client';
import { isApiError } from '@/core/api/errors';
import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Chips } from '@/ui/chips';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Screen } from '@/ui/screen';
import { Text } from '@/ui/text';

/**
 * Step-up (re-authentication) for calls that answer `403 STEP_UP_REQUIRED`,
 * as the panel's step-up engine does: the password (or an authenticator code
 * when the account has one) gets a short grant from `/v1/auth/step-up/*`,
 * then the call is repeated once. Native passkey verification is not offered.
 */
type Pending = { resolve: (ok: boolean) => void };

const useStepUpStore = create<{ pending: Pending | null }>(() => ({ pending: null }));

/** Opens the prompt; resolves true once a grant was issued, false when dismissed. */
export function requestStepUp(): Promise<boolean> {
  return new Promise((resolve) => {
    useStepUpStore.getState().pending?.resolve(false);
    useStepUpStore.setState({ pending: { resolve } });
  });
}

function finish(ok: boolean) {
  const p = useStepUpStore.getState().pending;
  useStepUpStore.setState({ pending: null });
  p?.resolve(ok);
}

/** Runs `call`; on `STEP_UP_REQUIRED` asks for the password and runs it once more. */
export async function withStepUp<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (!isApiError(e, 'STEP_UP_REQUIRED')) throw e;
    if (!(await requestStepUp())) throw e;
    return call();
  }
}

type Method = 'password' | 'totp';

/**
 * Mount on the screens whose calls may need a step-up (renders nothing until
 * asked). Only the focused screen should mount it, so `active` turns it off
 * on screens under another one in the stack.
 */
export function StepUpHost({ active = true }: { active?: boolean }) {
  const open = useStepUpStore((s) => !!s.pending);
  if (!open || !active) return null;
  return <StepUpSheet />;
}

function StepUpSheet() {
  const { t } = useTranslation('customers_app');
  const insets = useSafeAreaInsets();
  const status = useQuery({
    queryKey: ['step-up-status'],
    staleTime: 0,
    queryFn: () => unwrap(api.GET('/v1/auth/step-up')),
  });
  const methods = (status.data?.methods ?? ['password']).filter((m): m is Method => m === 'password' || m === 'totp');
  const [method, setMethod] = useState<Method>('password');
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active: Method = methods.includes(method) ? method : (methods[0] ?? 'password');
  const code = secret.replace(/\D/g, '');
  const ready = active === 'password' ? secret.length > 0 : code.length === 6;

  const verify = async () => {
    setPending(true);
    setError(null);
    try {
      if (active === 'password') await unwrap(api.POST('/v1/auth/step-up/password', { body: { password: secret } }));
      else await unwrap(api.POST('/v1/auth/step-up/totp', { body: { code } }));
      finish(true);
    } catch (e) {
      setError(
        isApiError(e, 'INVALID_CREDENTIALS') || (isApiError(e) && e.status === 401)
          ? t(active === 'password' ? 'step_up.wrong_password' : 'step_up.wrong_code')
          : apiErrorMessage(e),
      );
      setPending(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => finish(false)}>
      <View className="flex-1 bg-background" style={{ paddingBottom: insets.bottom }}>
        <View className="flex-row items-center gap-3 border-b border-border px-4 py-3">
          <Icon name="security" tone="primary" size={20} />
          <Text variant="headline" className="flex-1" numberOfLines={1}>
            {t('step_up.title')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common:close')}
            onPress={() => finish(false)}
            hitSlop={10}>
            <Icon name="close" tone="muted-foreground" size={22} />
          </Pressable>
        </View>
        <Screen>
          <Text tone="muted">{t('step_up.description')}</Text>
          {methods.length > 1 ? (
            <Chips<Method>
              value={active}
              onChange={(m) => {
                setMethod(m);
                setSecret('');
                setError(null);
              }}
              options={methods.map((m) => ({ value: m, label: t(`step_up.method_${m}`) }))}
            />
          ) : null}
          {active === 'password' ? (
            <Input
              key="password"
              label={t('step_up.password')}
              icon="password"
              value={secret}
              onChangeText={setSecret}
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => ready && void verify()}
              error={error ?? undefined}
            />
          ) : (
            <Input
              key="totp"
              label={t('step_up.totp')}
              icon="password"
              value={secret}
              onChangeText={setSecret}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={7}
              autoFocus
              placeholder="000000"
              error={error ?? undefined}
            />
          )}
          <Button
            title={t('step_up.verify')}
            size="lg"
            disabled={!ready}
            loading={pending}
            onPress={() => void verify()}
          />
          <Text variant="footnote" tone="muted">
            {t('step_up.passkey_note')}
          </Text>
        </Screen>
      </View>
    </Modal>
  );
}
