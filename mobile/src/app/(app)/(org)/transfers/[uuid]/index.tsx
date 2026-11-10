import { useLocalSearchParams } from 'expo-router';

import { TransferDetailScreen } from '@/features/transfers/detail-screen';

export default function TransferRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <TransferDetailScreen uuid={uuid} />;
}
