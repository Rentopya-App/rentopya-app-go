import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { ReceiptFile } from './api';
import { checkReceipt, receiptName, receiptType } from './model';

export type PickResult =
  | { ok: true; file: ReceiptFile }
  | { ok: false; reason: 'cancelled' | 'denied' | 'too_large' | 'bad_type' | 'failed' };

/**
 * The receipt photo: the camera, or the photo library. The web preview has
 * no camera here, so it opens the file picker. Nothing is uploaded here;
 * the form sends the file after the expense is saved.
 */
export async function pickReceipt(source: 'camera' | 'library'): Promise<PickResult> {
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
      // A re-encoded JPEG keeps receipts readable and well under the 10 MB limit.
      quality: 0.7,
      exif: false,
      allowsEditing: false,
    };
    const result = useLibrary
      ? await ImagePicker.launchImageLibraryAsync(options)
      : await ImagePicker.launchCameraAsync(options);
    if (result.canceled || !result.assets?.length) return { ok: false, reason: 'cancelled' };
    const asset = result.assets[0];
    const check = checkReceipt(asset.mimeType, asset.fileSize);
    if (check !== 'ok') return { ok: false, reason: check };
    const type = receiptType(asset.mimeType);
    return { ok: true, file: { uri: asset.uri, type, name: receiptName(type, new Date()) } };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
