import { useLocalSearchParams } from 'expo-router';

import { StatusScreen } from '@/features/vehicles/action-screens';

export default function VehicleStatus() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <StatusScreen uuid={uuid} />;
}
