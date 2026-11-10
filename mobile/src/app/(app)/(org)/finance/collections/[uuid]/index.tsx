import { useLocalSearchParams } from 'expo-router';

import { CollectionScreen } from '@/features/finance/collection-screen';

export default function CollectionRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <CollectionScreen uuid={uuid} />;
}
