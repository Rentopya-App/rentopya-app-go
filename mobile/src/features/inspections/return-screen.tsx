import { ChargesStep } from './charges-step';
import { ReturnFinished } from './return-finish';
import { InspectionWizardScreen } from './wizard-screen';

/**
 * Mobile return (TEC-1146): the panel's eight return steps on the shared
 * wizard, with the charges step, and the review / charge decisions / return
 * check once the form is completed.
 */
export function ReturnWizardScreen() {
  return (
    <InspectionWizardScreen
      kind="return"
      extraSteps={{ charges: () => <ChargesStep /> }}
      finished={(ins) => <ReturnFinished ins={ins} />}
    />
  );
}
