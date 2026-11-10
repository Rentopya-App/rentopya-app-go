import { useLocalSearchParams } from 'expo-router';

import { RatePlanScreen } from '@/features/config/detail-screens';

export default function RatePlanRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <RatePlanScreen uuid={uuid} />;
}
