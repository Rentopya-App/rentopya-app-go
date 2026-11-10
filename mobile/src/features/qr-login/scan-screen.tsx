import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Input } from '@/ui/input';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { parseQrLogin } from './lib';

/**
 * "QR ile web'e giriş": reads the QR on the panel's sign-in page
 * (`{panel}/login/qr/{id}`) and opens the approval. The link can also be
 * pasted when the camera is not available. The panel shows the code on a
 * screen, so no torch is offered.
 */
export function QrScanScreen() {
  const { t } = useTranslation('qr_login');
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [link, setLink] = useState('');
  const locked = useRef(false);

  const open = (id: string) => router.replace({ pathname: '/login/qr/[id]', params: { id } });

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    const id = parseQrLogin(data);
    if (id) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      open(id);
      return;
    }
    toast.error(t('scan_unknown'));
    // Let the camera move off the code before reading again.
    setTimeout(() => (locked.current = false), 1500);
  };

  const typedId = parseQrLogin(link);
  const manual = (
    <View className="gap-3">
      <Input
        label={t('manual_label')}
        value={link}
        onChangeText={setLink}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://…/login/qr/…"
        returnKeyType="go"
        error={link.trim() && !typedId ? t('manual_invalid') : undefined}
        onSubmitEditing={() => typedId && open(typedId)}
      />
      <Button title={t('manual_open')} icon="signIn" disabled={!typedId} onPress={() => typedId && open(typedId)} />
    </View>
  );

  if (!permission) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Stack.Screen options={{ title: t('scan_title') }} />
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View className="flex-1 gap-4 bg-background px-4 pt-4">
        <Stack.Screen options={{ title: t('scan_title') }} />
        <EmptyState
          icon="qr"
          title={t('camera_needed_title')}
          body={t('camera_needed_body')}
          action={
            permission.canAskAgain
              ? { title: t('camera_allow'), onPress: () => void requestPermission() }
              : { title: t('camera_settings'), onPress: () => void Linking.openSettings() }
          }
        />
        {manual}
      </View>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <Stack.Screen options={{ title: t('scan_title') }} />
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={onScanned}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="size-64 rounded-3xl border-4 border-white/80" />
        <Text variant="callout" className="mt-4 px-8 text-center text-white">
          {t('scan_hint')}
        </Text>
      </View>
      <View className="absolute inset-x-4 gap-3" style={{ bottom: insets.bottom + 16 }}>
        <View className="rounded-xl bg-background p-4">{manual}</View>
      </View>
    </View>
  );
}
