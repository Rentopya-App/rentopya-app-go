import { api, orgHeader } from '@/core/api/client';
import { toApiError } from '@/core/api/errors';

import type { Expense } from './api';

/** Web build (previews only): the streamed file opens in a new tab from a blob URL. */
export async function openReceipt(expense: Expense) {
  const r = await api.GET('/v1/tenant/finance/expenses/{uuid}/file', {
    params: { header: orgHeader(), path: { uuid: expense.uuid }, query: { inline: '1' } },
    parseAs: 'blob',
  });
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  window.open(URL.createObjectURL(r.data as unknown as Blob), '_blank', 'noopener');
}
