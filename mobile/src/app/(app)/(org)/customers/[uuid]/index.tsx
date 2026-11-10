import { useLocalSearchParams } from 'expo-router';

import { CustomerScreen } from '@/features/customers/customer-screen';

/** `?tab=drivers|consents|documents|activity` opens that tab. */
export default function CustomerRoute() {
  const { uuid, tab } = useLocalSearchParams<{ uuid: string; tab?: string }>();
  return <CustomerScreen uuid={uuid} initialTab={tab} />;
}
