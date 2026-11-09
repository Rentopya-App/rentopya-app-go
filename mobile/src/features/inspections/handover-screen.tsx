import { AmountsStep } from './amounts-step';
import { InspectionWizardScreen } from './wizard-screen';

/** Mobile handover (TEC-1145): the panel's eight steps with the amounts / deposit step. */
export function HandoverWizardScreen() {
  return <InspectionWizardScreen kind="handover" extraSteps={{ amounts: () => <AmountsStep /> }} />;
}
