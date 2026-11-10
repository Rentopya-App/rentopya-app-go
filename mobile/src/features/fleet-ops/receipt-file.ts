import { File, Paths } from 'expo-file-system';

import { api, orgHeader } from '@/core/api/client';
import { toApiError } from '@/core/api/errors';

import type { Expense } from './api';

const EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Opens the receipt / invoice of an expense. The API streams it from private
 * storage (`attachment.url` is an API path, never a storage URL); the bytes
 * go to the cache and the system preview shows them.
 */
export async function openReceipt(expense: Expense) {
  const r = await api.GET('/v1/tenant/finance/expenses/{uuid}/file', {
    params: { header: orgHeader(), path: { uuid: expense.uuid } },
    parseAs: 'arrayBuffer',
  });
  if (r.error !== undefined || !r.response.ok || !r.data) throw toApiError(r.response.status, r.error);
  const ext = EXT[expense.attachment?.content_type ?? ''] ?? 'bin';
  const file = new File(Paths.cache, `expense-receipt-${expense.uuid}.${ext}`);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(r.data as unknown as ArrayBuffer));
  await file.preview();
}
