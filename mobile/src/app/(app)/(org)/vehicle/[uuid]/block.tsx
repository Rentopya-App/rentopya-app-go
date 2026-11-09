import { useLocalSearchParams } from 'expo-router';

import { BlockScreen } from '@/features/vehicles/action-screens';

/** `?quick=1`: "Bakıma al" (maintenance from now, open-ended). */
export default function VehicleBlock() {
  const { uuid, quick } = useLocalSearchParams<{ uuid: string; quick?: string }>();
  return <BlockScreen uuid={uuid} quick={quick === '1'} />;
}
