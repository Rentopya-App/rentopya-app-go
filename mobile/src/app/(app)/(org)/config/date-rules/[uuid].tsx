import { useLocalSearchParams } from 'expo-router';

import { DateRuleScreen } from '@/features/config/detail-screens';

export default function DateRuleRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <DateRuleScreen uuid={uuid} />;
}
