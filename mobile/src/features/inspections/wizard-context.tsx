import { createContext, useContext } from 'react';

import type { useUploadQueue } from '@/features/uploads';

import type { Inspection, InspectionDraftRequest, WizardStep } from './model';

export type WizardContextValue = {
  ins: Inspection;
  /** Finalized or superseded: nothing changes any more. */
  readOnly: boolean;
  /** Last known connectivity (the upload queue's). */
  online: boolean;
  /** Server edits are not possible now (read-only or offline). Photos and the signature still queue. */
  locked: boolean;
  /** PATCH of draft fields; false (with a toast) when it did not save. */
  commit: (patch: InspectionDraftRequest) => Promise<boolean>;
  /** Text kept on the device until it is sent (survives backgrounding). */
  values: Record<string, string>;
  setValue: (name: string, value: string | null) => void;
  queue: ReturnType<typeof useUploadQueue>;
  orgSlug: string;
  /** Stops the screen from scrolling while the signature pad is drawn on. */
  setScrollLocked: (locked: boolean) => void;
  goto: (step: WizardStep) => void;
};

export const WizardContext = createContext<WizardContextValue | null>(null);

export function useWizard() {
  const v = useContext(WizardContext);
  if (!v) throw new Error('useWizard outside the wizard');
  return v;
}
