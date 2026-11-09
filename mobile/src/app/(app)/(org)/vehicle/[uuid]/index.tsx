import { useLocalSearchParams } from 'expo-router';

import { VehicleScreen } from '@/features/vehicles/vehicle-screen';

/** Also the target of the QR label link `rentopya://vehicle/{uuid}`. */
export default function VehicleRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <VehicleScreen uuid={uuid} />;
}
