import { File, Paths } from 'expo-file-system';

import { api, orgHeader } from '@/core/api/client';
import { toApiError } from '@/core/api/errors';

import type { CustomerDocument } from './api';
import { withStepUp } from './step-up';

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Opens the file of a customer document. The API streams it
 * (`tenant.document.download` + `tenant.customers.reveal`, every download is
 * recorded in the customer's activity); storage keys never reach the app. The
 * bytes go to the cache and the system preview shows them.
 */
export async function openDocumentFile(customerUuid: string, doc: CustomerDocument) {
  const data = await withStepUp(async () => {
    const r = await api.GET('/v1/tenant/customers/{uuid}/documents/{docUuid}/file', {
      params: { header: orgHeader(), path: { uuid: customerUuid, docUuid: doc.uuid } },
      parseAs: 'arrayBuffer',
    });
    if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
    return r.data as unknown as ArrayBuffer;
  });
  const file = new File(Paths.cache, `customer-document-${doc.uuid}.${EXT[doc.content_type] ?? 'bin'}`);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(data));
  await file.preview();
}
