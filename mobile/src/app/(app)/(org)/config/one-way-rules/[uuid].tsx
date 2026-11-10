import { useLocalSearchParams } from 'expo-router';

import { OneWayRuleScreen } from '@/features/config/detail-screens';

export default function OneWayRuleRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <OneWayRuleScreen uuid={uuid} />;
}
