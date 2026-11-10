import { errorMessage } from '@/core/i18n';

import { isApiError } from './errors';

/**
 * Field messages of a failed save: the API's `details[].field` mapped to the
 * form, plus one message for everything else (shown above the save button).
 */
export function formErrors(e: unknown): { fields: Record<string, string>; message?: string } {
  if (!e) return { fields: {} };
  if (!isApiError(e)) return { fields: {}, message: errorMessage(undefined) };
  const fields = e.fieldErrors();
  return { fields, message: Object.keys(fields).length ? undefined : errorMessage(e.code, e.message) };
}
