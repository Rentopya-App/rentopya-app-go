import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import { documentContentType, documentFileName, fileTooLarge, type PickedFile } from './lib';

export type PickResult =
  | { ok: true; file: PickedFile }
  | { ok: false; reason: 'cancelled' | 'denied' | 'too_large' | 'unsupported' | 'failed' };

/**
 * A photo of an identity card, licence or other paper for the document's
 * file: the camera, or the photo library. Nothing is uploaded here; the
 * screen sends the file through the documents API.
 */
export async function pickDocumentPhoto(source: 'camera' | 'library', baseName: string): Promise<PickResult> {
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
      // Below 1 the picker re-encodes as JPEG (also HEIC library photos).
      quality: 0.8,
      exif: false,
      allowsEditing: false,
    };
    const result = useLibrary
      ? await ImagePicker.launchImageLibraryAsync(options)
      : await ImagePicker.launchCameraAsync(options);
    if (result.canceled || !result.assets?.length) return { ok: false, reason: 'cancelled' };
    const asset = result.assets[0];
    const contentType = documentContentType(asset.mimeType, asset.fileName ?? asset.uri);
    if (!contentType) return { ok: false, reason: 'unsupported' };
    if (fileTooLarge(asset.fileSize)) return { ok: false, reason: 'too_large' };
    return {
      ok: true,
      file: {
        uri: asset.uri,
        name: documentFileName(baseName, contentType, Date.now()),
        contentType,
        size: asset.fileSize ?? null,
      },
    };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
