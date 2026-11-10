import { useLocalSearchParams } from 'expo-router';

import { SegmentScreen } from '@/features/config/detail-screens';

export default function SegmentRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <SegmentScreen uuid={uuid} />;
}
