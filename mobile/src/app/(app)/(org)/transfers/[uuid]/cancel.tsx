import { useLocalSearchParams } from 'expo-router';

import { TransferActionScreen } from '@/features/transfers/action-screen';

export default function TransferCancelRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <TransferActionScreen uuid={uuid} action="cancel" />;
}
