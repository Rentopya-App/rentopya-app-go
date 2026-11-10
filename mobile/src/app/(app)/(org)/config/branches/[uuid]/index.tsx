import { useLocalSearchParams } from 'expo-router';

import { BranchScreen } from '@/features/config/detail-screens';

export default function BranchRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <BranchScreen uuid={uuid} />;
}
