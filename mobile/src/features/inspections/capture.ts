import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { photoTooLarge } from './model';

export type Captured = { uri: string; mimeType: string | null; capturedAt: string };

export type CaptureResult =
  | { ok: true; photo: Captured }
  | { ok: false; reason: 'cancelled' | 'denied' | 'too_large' | 'failed' };

/**
 * Takes a photo for the form: the camera on a phone, the photo library when
 * asked (or when the device has no camera). The web preview has no camera
 * API here, so it opens the file picker. The image goes straight into the
 * upload queue; nothing is uploaded from this function.
 */
export async function capturePhoto(source: 'camera' | 'library' = 'camera'): Promise<CaptureResult> {
  const useLibrary = source === 'library' || Platform.OS === 'web';
  try {
    if (Platform.OS !== 'web') {
      const perm = useLibrary
        ? await ImagePicker.requestMediaLibraryPermissionsAsync()
        : await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      quality: 0.7,
      exif: false,
      allowsEditing: false,
    };
    const result = useLibrary
      ? await ImagePicker.launchImageLibraryAsync(options)
      : await ImagePicker.launchCameraAsync(options);
    if (result.canceled || !result.assets?.length) return { ok: false, reason: 'cancelled' };
    const asset = result.assets[0];
    if (photoTooLarge(asset.fileSize)) return { ok: false, reason: 'too_large' };
    return {
      ok: true,
      photo: { uri: asset.uri, mimeType: asset.mimeType ?? null, capturedAt: new Date().toISOString() },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
