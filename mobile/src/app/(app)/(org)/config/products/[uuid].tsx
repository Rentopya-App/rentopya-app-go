import { useLocalSearchParams } from 'expo-router';

import { ProductScreen } from '@/features/config/detail-screens';

export default function ProductRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ProductScreen uuid={uuid} />;
}
