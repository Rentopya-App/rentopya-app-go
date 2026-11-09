import { useLocalSearchParams } from 'expo-router';

import { VehicleHistoryScreen } from '@/features/vehicles/history-screen';

export default function VehicleHistory() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <VehicleHistoryScreen uuid={uuid} />;
}
