import { useLocalSearchParams } from 'expo-router';

import { ExtraScreen } from '@/features/config/detail-screens';

export default function ExtraRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ExtraScreen uuid={uuid} />;
}
