import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState } from 'react';
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
 * Step-up for settings writes that answer `403 STEP_UP_REQUIRED`, like the
 * panel's step-up engine: the password (or an authenticator code) gets a
 * short grant and the call is repeated once. Kept inside this feature until
 * the account module's shared prompt lands; the behaviour is the same.
 */
type Pending = { resolve: (ok: boolean) => void };

const useStepUpStore = create<{ pending: Pending | null; hosts: string[] }>(() => ({ pending: null, hosts: [] }));

const stepUpApi = {
  status: () => unwrap(api.GET('/v1/auth/step-up')),
  password: (password: string) => unwrap(api.POST('/v1/auth/step-up/password', { body: { password } })),
  totp: (code: string) => unwrap(api.POST('/v1/auth/step-up/totp', { body: { code } })),
};

function requestStepUp(): Promise<boolean> {
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

/** Runs `call`; on `STEP_UP_REQUIRED` asks for re-authentication and runs it once more. */
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
 * Mounted by each settings screen that writes; only the most recently mounted
 * one (the top of the stack) shows the prompt, so it never opens twice.
 */
export function StepUpHost() {
  const id = useId();
  useEffect(() => {
    useStepUpStore.setState((s) => ({ hosts: [...s.hosts, id] }));
    return () => useStepUpStore.setState((s) => ({ hosts: s.hosts.filter((h) => h !== id) }));
  }, [id]);
  const open = useStepUpStore((s) => !!s.pending && s.hosts[s.hosts.length - 1] === id);
  return open ? <StepUpSheet /> : null;
}

function StepUpSheet() {
  const { t } = useTranslation('settings_app');
  const insets = useSafeAreaInsets();
  const status = useQuery({ queryKey: ['org-settings', 'step-up'], queryFn: stepUpApi.status, staleTime: 0 });
  const methods = (status.data?.methods ?? ['password']).filter((m): m is Method => m === 'password' || m === 'totp');
  const [method, setMethod] = useState<Method>('password');
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active: Method = methods.includes(method) ? method : (methods[0] ?? 'password');
  const code = secret.replace(/\s+/g, '');
  const ready = active === 'password' ? secret.length > 0 : code.length >= 6;

  const verify = async () => {
    setPending(true);
    setError(null);
    try {
      if (active === 'password') await stepUpApi.password(secret);
      else await stepUpApi.totp(code);
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
          {status.data && methods.length === 0 ? (
            <Text tone="danger">{t('step_up.no_methods')}</Text>
          ) : (
            <Input
              key={active}
              label={t(active === 'password' ? 'step_up.password' : 'step_up.totp')}
              icon="password"
              value={secret}
              onChangeText={setSecret}
              secureTextEntry={active === 'password'}
              keyboardType={active === 'totp' ? 'number-pad' : 'default'}
              autoComplete={active === 'password' ? 'current-password' : 'one-time-code'}
              textContentType={active === 'password' ? 'password' : 'oneTimeCode'}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => ready && void verify()}
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
