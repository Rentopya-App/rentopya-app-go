import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { formErrors } from '@/core/api/form-errors';

import { Button } from './button';
import { TextArea } from './fields';
import { FormScreen } from './screen';
import { Text } from './text';

/**
 * A correction that needs a written reason (reverse a movement, reopen a
 * day, refund): what will happen, the reason box and one button. The API
 * keeps the original record and books the opposite one.
 */
export function ReasonForm({
  description,
  label,
  submitTitle,
  destructive,
  pending,
  error,
  onSubmit,
  children,
}: {
  description: string;
  label?: string;
  submitTitle: string;
  destructive?: boolean;
  pending: boolean;
  error: unknown;
  onSubmit: (reason: string) => void;
  /** Extra fields or a summary above the reason. */
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const err = formErrors(error);
  const ok = reason.trim().length >= 3;
  return (
    <FormScreen
      footer={
        <>
          {err.message ? (
            <Text variant="footnote" tone="danger">
              {err.message}
            </Text>
          ) : null}
          <Button
            title={submitTitle}
            size="lg"
            variant={destructive ? 'destructive' : 'primary'}
            disabled={!ok}
            loading={pending}
            onPress={() => onSubmit(reason.trim())}
          />
        </>
      }>
      <Text tone="muted">{description}</Text>
      {children}
      <TextArea
        label={label ?? t('common:reason')}
        hint={t('common:reason_hint')}
        value={reason}
        onChangeText={setReason}
        maxLength={500}
        error={err.fields.reason}
        autoFocus
      />
    </FormScreen>
  );
}
