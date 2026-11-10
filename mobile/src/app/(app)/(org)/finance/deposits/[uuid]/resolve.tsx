import { useLocalSearchParams } from 'expo-router';

import { ResolveDepositScreen } from '@/features/finance/deposits-screens';

export default function DepositResolveRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ResolveDepositScreen uuid={uuid} />;
}
