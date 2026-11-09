import { useLocalSearchParams } from 'expo-router';

import { VehicleFormScreen } from '@/features/vehicles/vehicle-form-screen';

export default function EditVehicle() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <VehicleFormScreen uuid={uuid} />;
}
