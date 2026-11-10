import { useLocalSearchParams } from 'expo-router';

import { DepositScreen } from '@/features/finance/deposits-screens';

export default function DepositRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <DepositScreen uuid={uuid} />;
}
