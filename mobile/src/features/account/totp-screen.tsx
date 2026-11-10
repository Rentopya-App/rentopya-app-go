import { useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, View } from 'react-native';

import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { Input } from '@/ui/input';
import { QrCode } from '@/ui/qr-code';
import { QueryState } from '@/ui/query-state';
import { Screen } from '@/ui/screen';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { totpApi, useTotpStatus } from './api';
import { confirmAction } from './confirm';
import { groupSecret, isCodeReady, normalizeCode, parseOtpauth } from './lib';

type Setup = { secret: string; otpauthUrl: string };

/**
 * Authenticator 2FA (`/v1/auth/totp*`), like the panel: start the setup
 * (QR of the otpauth URI, the key to type, or straight into an
 * authenticator app on this phone), confirm with a code, keep the recovery
 * codes; turning it off asks for a code or a recovery code.
 */
export function TotpScreen() {
  const { t } = useTranslation('account');
  const qc = useQueryClient();
  const status = useTotpStatus();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['account', 'totp'] });

  const begin = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await totpApi.setup();
      setSetup({ secret: r.secret, otpauthUrl: r.otpauth_url });
      setCode('');
      setRecovery(null);
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const confirm = async () => {
    setPending(true);
    setError(null);
    try {
      const r = await totpApi.confirm(normalizeCode(code));
      setRecovery(r.recovery_codes);
      setSetup(null);
      setCode('');
      await refresh();
      toast.success(t('totp.confirm_success'));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const disable = async () => {
    const ok = await confirmAction({
      title: t('totp.disable_title'),
      body: t('totp.disable_description'),
      action: t('totp.disable'),
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    setError(null);
    try {
      await totpApi.disable(normalizeCode(code));
      setCode('');
      await refresh();
      toast.success(t('totp.disable_success'));
    } catch (e) {
      setError(apiErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const parsed = setup ? parseOtpauth(setup.otpauthUrl) : null;
  const codeInput = (label: string) => (
    <Input
      label={label}
      icon="key"
      value={code}
      onChangeText={(v) => {
        setCode(v);
        setError(null);
      }}
      keyboardType="number-pad"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      placeholder={t('totp.code_placeholder')}
      error={error ?? undefined}
    />
  );

  return (
    <>
      <Stack.Screen options={{ title: t('totp.title') }} />
      <Screen>
        <Text tone="muted" className="px-1">
          {t('totp.description')}
        </Text>
        <QueryState query={status} rows={2}>
          {(s) => (
            <>
              <View className="flex-row px-1">
                <StatusPill
                  label={s.enabled ? t('totp.status_on') : t('totp.status_off')}
                  tone={s.enabled ? 'done' : 'neutral'}
                />
              </View>

              {recovery ? (
                <Card title={t('totp.recovery_title')}>
                  <Text variant="callout" tone="muted">
                    {t('totp.recovery_hint')}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {recovery.map((c) => (
                      <Text key={c} selectable className="w-[47%] font-mono text-[15px]">
                        {c}
                      </Text>
                    ))}
                  </View>
                  <Button title={t('totp.recovery_done')} variant="outline" onPress={() => setRecovery(null)} />
                </Card>
              ) : null}

              {setup ? (
                <Card title={t('totp.setup_title')}>
                  <Text variant="callout">{t('totp.setup_scan_hint')}</Text>
                  <QrCode value={setup.otpauthUrl} size={200} label={t('totp.qr_alt')} />
                  <Button
                    title={t('totp.open_app')}
                    icon="externalLink"
                    variant="outline"
                    onPress={() =>
                      void Linking.openURL(setup.otpauthUrl).catch(() => toast.error(t('totp.open_app_failed')))
                    }
                  />
                  <View className="gap-1">
                    <Text variant="footnote" tone="muted">
                      {t('totp.manual_secret')}
                    </Text>
                    <Text selectable className="font-mono text-[17px] tracking-wider">
                      {groupSecret(setup.secret)}
                    </Text>
                    {parsed ? (
                      <Text variant="footnote" tone="muted">
                        {t('totp.manual_details', {
                          issuer: parsed.issuer || '—',
                          account: parsed.account || '—',
                          digits: parsed.digits,
                          period: parsed.period,
                        })}
                      </Text>
                    ) : null}
                  </View>
                  {codeInput(t('totp.confirm_code'))}
                  <Button
                    title={t('totp.confirm')}
                    size="lg"
                    disabled={!isCodeReady(code)}
                    loading={pending}
                    onPress={() => void confirm()}
                  />
                  <Button
                    title={t('common:cancel')}
                    variant="ghost"
                    disabled={pending}
                    onPress={() => {
                      setSetup(null);
                      setCode('');
                      setError(null);
                    }}
                  />
                </Card>
              ) : s.enabled ? (
                <Card title={t('totp.disable_title')}>
                  <Text variant="callout" tone="muted">
                    {t('totp.disable_description')}
                  </Text>
                  {codeInput(t('totp.confirm_code'))}
                  <Button
                    title={t('totp.disable')}
                    variant="destructive"
                    disabled={!isCodeReady(code)}
                    loading={pending}
                    onPress={() => void disable()}
                  />
                </Card>
              ) : (
                <Button
                  title={t('totp.enable')}
                  icon="security"
                  size="lg"
                  loading={pending}
                  onPress={() => void begin()}
                />
              )}
            </>
          )}
        </QueryState>
      </Screen>
    </>
  );
}
