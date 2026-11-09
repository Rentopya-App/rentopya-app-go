import { useTranslation } from 'react-i18next';

import { formatMoney } from '@/core/format';
import { Card } from '@/ui/card';

import { DepositCard } from './deposit-card';
import { Facts, Notice } from './parts';
import { useWizard } from './wizard-context';

/**
 * Step 2 (handover): money from the reservation's payments (display only, as
 * the panel) and the deposit card with "Depozito al".
 */
export function AmountsStep() {
  const { t } = useTranslation('inspections');
  const { ins, locked } = useWizard();
  const a = ins.rental.amounts;
  const balance = Number(a.balance);
  return (
    <>
      <Card title={t('amounts.title')}>
        <Facts
          rows={[
            { label: t('amounts.total'), value: formatMoney(a.total, a.currency) },
            { label: t('amounts.paid'), value: formatMoney(a.paid, a.currency) },
            {
              label: t('amounts.balance'),
              value: formatMoney(a.balance, a.currency),
              tone: balance > 0 ? 'danger' : undefined,
            },
            { label: t('amounts.payment_status'), value: a.payment_status || '—' },
            { label: t('amounts.deposit'), value: a.deposit_amount ? formatMoney(a.deposit_amount, a.currency) : '—' },
            { label: t('amounts.deposit_status'), value: t(`deposit.status_${a.deposit_status}`) },
          ]}
        />
        {balance > 0 ? <Notice tone="warning" body={t('amounts.balance_hint')} /> : null}
      </Card>
      <DepositCard rentalUuid={ins.rental.uuid} locked={locked} />
    </>
  );
}
