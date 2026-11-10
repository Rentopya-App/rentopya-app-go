import { useLocalSearchParams } from 'expo-router';

import { CancelDepositScreen } from '@/features/finance/deposits-screens';

export default function DepositCancelRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <CancelDepositScreen uuid={uuid} />;
}
