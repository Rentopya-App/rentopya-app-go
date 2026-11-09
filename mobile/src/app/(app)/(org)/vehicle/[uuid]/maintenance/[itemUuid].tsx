import { useLocalSearchParams } from 'expo-router';

import { CompleteMaintenanceScreen } from '@/features/vehicles/action-screens';

export default function CompleteMaintenance() {
  const { uuid, itemUuid } = useLocalSearchParams<{ uuid: string; itemUuid: string }>();
  return <CompleteMaintenanceScreen uuid={uuid} itemUuid={itemUuid} />;
}
