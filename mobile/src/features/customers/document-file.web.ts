import { api, orgHeader } from '@/core/api/client';
import { toApiError } from '@/core/api/errors';

import type { CustomerDocument } from './api';
import { withStepUp } from './step-up';

/** Web build (previews only): the streamed file opens in a new tab from a blob URL. */
export async function openDocumentFile(customerUuid: string, doc: CustomerDocument) {
  const blob = await withStepUp(async () => {
    const r = await api.GET('/v1/tenant/customers/{uuid}/documents/{docUuid}/file', {
      params: { header: orgHeader(), path: { uuid: customerUuid, docUuid: doc.uuid } },
      parseAs: 'blob',
    });
    if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
    return r.data as unknown as Blob;
  });
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
