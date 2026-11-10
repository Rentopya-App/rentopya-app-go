import { useLocalSearchParams } from 'expo-router';

import { EligibilityScreen } from '@/features/customers/sub-screens';

export default function DriverEligibility() {
  const { uuid, driver } = useLocalSearchParams<{ uuid: string; driver: string }>();
  return <EligibilityScreen uuid={uuid} driverUuid={driver} />;
}
