import { useLocalSearchParams } from 'expo-router';

import { GroupScreen } from '@/features/config/detail-screens';

export default function GroupRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <GroupScreen uuid={uuid} />;
}
