import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { BrandMark } from '@/ui/brand';
import { Button } from '@/ui/button';
import { Input } from '@/ui/input';
import { brandIn, riseIn } from '@/ui/motion';
import { Text } from '@/ui/text';

const AwareScrollView = withUniwind(KeyboardAwareScrollView);

/**
 * Sign-in placeholder: the brand, the e-mail and password fields and the
 * button, in their final layout. `/v1/auth/login`, MFA and the session store
 * arrive with the auth layer; until then the button stays off.
 */
export function SignInScreen() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <SafeAreaView className="flex-1 bg-background">
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
          <Input
            label={t('email')}
            icon="mail"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
          />
          <Input
            label={t('password')}
            icon="password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
          />
          <Text variant="footnote" tone="muted" accessibilityLiveRegion="polite">
            {t('not_ready')}
          </Text>
          <Button icon="signIn" title={t('sign_in')} size="lg" disabled />
          {router.canGoBack() ? (
            <Button title={t('common:close')} variant="ghost" onPress={() => router.back()} />
          ) : null}
        </Animated.View>
      </AwareScrollView>
    </SafeAreaView>
  );
}
