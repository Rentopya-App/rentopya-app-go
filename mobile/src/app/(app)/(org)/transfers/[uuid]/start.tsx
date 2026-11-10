import { useLocalSearchParams } from 'expo-router';

import { TransferActionScreen } from '@/features/transfers/action-screen';

export default function TransferStartRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <TransferActionScreen uuid={uuid} action="start" />;
}
