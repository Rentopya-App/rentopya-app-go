import type { components } from '@/core/api/schema';

export type DepositMethod = components['schemas']['SecurityDepositInput']['method'];

export type DepositForm = {
  method: DepositMethod;
  amount: string;
  cashAccountUuid: string;
  posReference: string;
  note: string;
};

export type DepositBuild =
  | { ok: true; body: components['schemas']['SecurityDepositInput'] }
  | { ok: false; error: 'amount' | 'cash_account' | 'pos_reference' };

/**
 * `POST /v1/tenant/finance/deposits` body from the sheet, with the panel's
 * rules: a positive amount; cash and bank transfer name the till / bank
 * account; a POS provision names its slip number.
 */
export function depositPayload(
  rentalUuid: string,
  f: DepositForm,
  parseAmount: (text: string) => string | null,
): DepositBuild {
  const amount = parseAmount(f.amount);
  if (!amount) return { ok: false, error: 'amount' };
  const account = f.method === 'cash' || f.method === 'bank_transfer';
  if (account && !f.cashAccountUuid) return { ok: false, error: 'cash_account' };
  const ref = f.posReference.trim();
  if (f.method === 'pos_preauth' && !ref) return { ok: false, error: 'pos_reference' };
  return {
    ok: true,
    body: {
      rental_uuid: rentalUuid,
      method: f.method,
      amount,
      cash_account_uuid: account ? f.cashAccountUuid : undefined,
      pos_reference: f.method === 'pos_preauth' ? ref : undefined,
      note: f.note.trim() || undefined,
    },
  };
}
