import { useLocalSearchParams } from 'expo-router';

import { DriverScreen } from '@/features/customers/sub-screens';

/** `?driver=<uuid>` edits that driver; `?self=1` adds the customer as a driver. */
export default function CustomerDriver() {
  const { uuid, driver, self } = useLocalSearchParams<{ uuid: string; driver?: string; self?: string }>();
  return <DriverScreen uuid={uuid} driverUuid={driver} self={self === '1'} />;
}
