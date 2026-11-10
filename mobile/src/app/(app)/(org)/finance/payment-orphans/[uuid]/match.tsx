import { useLocalSearchParams } from 'expo-router';

import { MatchOrphanScreen } from '@/features/finance/payments-screens';

export default function PaymentOrphanMatchRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <MatchOrphanScreen uuid={uuid} />;
}
