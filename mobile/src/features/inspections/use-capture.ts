import { useTranslation } from 'react-i18next';
import { Alert, Platform } from 'react-native';

import { enqueuePhoto } from '@/features/uploads';
import { toast } from '@/ui/toast';

import { capturePhoto } from './capture';
import { useWizard } from './wizard-context';

/**
 * Camera (or library) → the device upload queue. Works offline: the photo is
 * kept on the phone and sent when the connection is back.
 */
export function useCapture() {
  const { t } = useTranslation('inspections');
  const { ins, orgSlug } = useWizard();
  const take = async (
    target: { slot: string; damageUuid?: string; label: string },
    source: 'camera' | 'library' = 'camera',
  ) => {
    const r = await capturePhoto(source);
    if (!r.ok) {
      if (r.reason === 'denied') toast.error(t(source === 'camera' ? 'photos.camera_denied' : 'photos.library_denied'));
      else if (r.reason === 'too_large') toast.error(t('photos.too_large'));
      else if (r.reason === 'failed') toast.error(t('photos.capture_failed'));
      return false;
    }
    try {
      await enqueuePhoto({
        orgSlug,
        inspectionUuid: ins.uuid,
        uri: r.photo.uri,
        mimeType: r.photo.mimeType,
        slot: target.slot,
        damageUuid: target.damageUuid,
        capturedAt: r.photo.capturedAt,
        label: `${ins.rental.vehicle.plate} · ${target.label}`,
      });
      toast.success(t('photos.queued'));
      return true;
    } catch {
      toast.error(t('photos.invalid_type'));
      return false;
    }
  };
  /** Camera, or a choice between camera and library (long press / "more"). */
  const choose = (target: { slot: string; damageUuid?: string; label: string }) => {
    if (Platform.OS === 'web') return void take(target, 'library');
    Alert.alert(target.label, undefined, [
      { text: t('photos.from_camera'), onPress: () => void take(target, 'camera') },
      { text: t('photos.from_library'), onPress: () => void take(target, 'library') },
      { text: t('common:cancel'), style: 'cancel' },
    ]);
  };
  return { take, choose };
}
