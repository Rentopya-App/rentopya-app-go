import { useLocalSearchParams } from 'expo-router';

import { NewMaintenanceScreen } from '@/features/fleet-ops/maintenance-screens';

export default function NewMaintenance() {
  const { vehicle, kind } = useLocalSearchParams<{ vehicle?: string; kind?: string }>();
  return <NewMaintenanceScreen vehicle={vehicle} kind={kind} />;
}
