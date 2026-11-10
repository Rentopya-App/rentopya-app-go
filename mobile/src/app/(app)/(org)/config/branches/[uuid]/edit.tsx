import { useLocalSearchParams } from 'expo-router';

import { BranchEditScreen } from '@/features/config/edit-screens';

export default function BranchEditRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <BranchEditScreen uuid={uuid} />;
}
