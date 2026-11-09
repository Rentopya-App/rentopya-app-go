import { File, Paths } from 'expo-file-system';

import { api, orgHeader } from '@/core/api/client';
import { toApiError } from '@/core/api/errors';

import type { VehicleDocument } from './api';

/** Safe file name in the cache: the document uuid plus the extension of its content type. */
function cacheName(doc: VehicleDocument) {
  const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[
    doc.file?.content_type ?? 'application/pdf'
  ];
  return `vehicle-document-${doc.uuid}.${ext}`;
}

/**
 * Opens the scanned file of a vehicle document. The API streams it
 * (`tenant.document.download`, recorded in the vehicle's activity); storage
 * keys never reach the app. The bytes go to the cache and the system preview
 * (Quick Look on iOS, the default viewer on Android) shows them.
 */
export async function openDocumentFile(vehicleUuid: string, doc: VehicleDocument) {
  const r = await api.GET('/v1/tenant/vehicles/{uuid}/documents/{documentUuid}/file', {
    params: { header: orgHeader(), path: { uuid: vehicleUuid, documentUuid: doc.uuid } },
    parseAs: 'arrayBuffer',
  });
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  const file = new File(Paths.cache, cacheName(doc));
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(r.data as unknown as ArrayBuffer));
  await file.preview();
}
