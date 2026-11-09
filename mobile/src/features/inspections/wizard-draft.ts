import { useCallback, useState } from 'react';

import { readJSON, storage, writeJSON } from '@/core/storage';

/**
 * What the wizard keeps on the device per form, so leaving the app (camera,
 * a call, the OS killing it in the background) brings the person back to the
 * same step with what they typed: the step, and text not yet sent (km, notes,
 * reasons, the signer name). The form itself lives on the server.
 */
export type WizardDraft = {
  step: number;
  values: Record<string, string>;
};

const key = (uuid: string) => `inspection.wizard.${uuid}`;

export function readDraft(uuid: string): WizardDraft {
  const d = readJSON<WizardDraft>(key(uuid));
  return {
    step: typeof d?.step === 'number' ? d.step : 0,
    values: d?.values && typeof d.values === 'object' ? d.values : {},
  };
}

export function clearDraft(uuid: string) {
  storage.remove(key(uuid));
}

/** Draft of one form: the step and local text values, written through on every change. */
export function useWizardDraft(uuid: string | null) {
  const [draft, setDraft] = useState<{ uuid: string | null; d: WizardDraft }>(() => ({
    uuid,
    d: uuid ? readDraft(uuid) : { step: 0, values: {} },
  }));
  let current = draft;
  if (draft.uuid !== uuid) {
    current = { uuid, d: uuid ? readDraft(uuid) : { step: 0, values: {} } };
    setDraft(current);
  }
  const update = useCallback(
    (fn: (d: WizardDraft) => WizardDraft) =>
      setDraft((prev) => {
        if (!prev.uuid) return prev;
        const next = fn(prev.d);
        writeJSON(key(prev.uuid), next);
        return { uuid: prev.uuid, d: next };
      }),
    [],
  );
  const setStep = useCallback((step: number) => update((d) => ({ ...d, step })), [update]);
  const setValue = useCallback(
    (name: string, value: string | null) =>
      update((d) => {
        const values = { ...d.values };
        if (value === null) delete values[name];
        else values[name] = value;
        return { ...d, values };
      }),
    [update],
  );
  return { step: current.d.step, values: current.d.values, setStep, setValue };
}
