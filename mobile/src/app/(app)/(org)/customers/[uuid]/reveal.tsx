import { useLocalSearchParams } from 'expo-router';

import { RevealScreen } from '@/features/customers/sub-screens';

export default function CustomerReveal() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <RevealScreen uuid={uuid} />;
}
