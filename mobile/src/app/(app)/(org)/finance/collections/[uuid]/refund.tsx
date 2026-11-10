import { useLocalSearchParams } from 'expo-router';

import { RefundCollectionScreen } from '@/features/finance/collection-screen';

export default function CollectionRefundRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <RefundCollectionScreen uuid={uuid} />;
}
