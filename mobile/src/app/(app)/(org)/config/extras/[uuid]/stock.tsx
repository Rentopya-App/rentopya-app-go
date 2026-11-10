import { useLocalSearchParams } from 'expo-router';

import { ExtraStockScreen } from '@/features/config/edit-screens';

export default function ExtraStockRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ExtraStockScreen uuid={uuid} />;
}
