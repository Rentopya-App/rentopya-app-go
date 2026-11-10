import { useLocalSearchParams } from 'expo-router';

import { VoidCollectionScreen } from '@/features/finance/collection-screen';

export default function CollectionVoidRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <VoidCollectionScreen uuid={uuid} />;
}
