import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { apiErrorMessage } from '@/core/i18n';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { findByPlate } from './api';
import { looksLikePlate, normalizePlate, parseScan } from './scan';

/** Vehicle labels are QR codes; plates printed as 1D / Data Matrix codes are read as text. */
const BARCODE_TYPES = ['qr', 'datamatrix', 'code128', 'code39'] as const;

/**
 * Finds a vehicle with the camera: a QR label (`rentopya://vehicle/{uuid}`)
 * opens it; plate text is searched, one hit opens the vehicle, several open
 * the list filtered by the plate. The plate can also be typed.
 */
export function ScanScreen() {
  const { t } = useTranslation('vehicles_app');
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [plate, setPlate] = useState('');
  const locked = useRef(false);

  const searchPlate = async (text: string) => {
    setBusy(true);
    try {
      const page = await findByPlate(text);
      if (page.total === 1 && page.items[0]) router.replace(`/vehicle/${page.items[0].uuid}`);
      else router.dismissTo({ pathname: '/vehicles', params: { q: text } });
    } catch (e) {
      toast.error(apiErrorMessage(e));
      locked.current = false;
    } finally {
      setBusy(false);
    }
  };

  const onScanned = ({ data }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    const result = parseScan(data);
    if (result.kind === 'vehicle') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/vehicle/${result.uuid}`);
      return;
    }
    if (result.kind === 'plate') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void searchPlate(result.plate);
      return;
    }
    toast.error(t('scan_unknown'));
    // Let the camera move off the code before reading again.
    setTimeout(() => (locked.current = false), 1500);
  };

  const typed = plate.trim();
  const manual = (
    <View className="gap-3">
      <Input
        label={t('plate_manual')}
        value={plate}
        onChangeText={setPlate}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        placeholder="34 ABC 123"
        onSubmitEditing={() => looksLikePlate(typed) && void searchPlate(normalizePlate(typed))}
      />
      <Button
        title={t('plate_search')}
        icon="search"
        disabled={!looksLikePlate(typed)}
        loading={busy}
        onPress={() => void searchPlate(normalizePlate(typed))}
      />
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
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={busy ? undefined : onScanned}
      />
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="size-64 rounded-3xl border-4 border-white/80" />
        <Text variant="callout" className="mt-4 px-8 text-center text-white">
          {t('scan_hint')}
        </Text>
      </View>
      <View className="absolute inset-x-4 gap-3" style={{ bottom: insets.bottom + 16 }}>
        <View className="flex-row justify-center">
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel={t('torch')}
            onPress={() => setTorch((v) => !v)}
            className="size-14 items-center justify-center rounded-full bg-black/50 active:opacity-70">
            <Icon name="flashlight" tone={torch ? 'warning' : 'primary-foreground'} size={24} />
          </Pressable>
        </View>
        <View className="rounded-xl bg-background p-4">{manual}</View>
      </View>
      {busy ? (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <ActivityIndicator colorClassName="accent-primary-foreground" />
        </View>
      ) : null}
    </View>
  );
}
