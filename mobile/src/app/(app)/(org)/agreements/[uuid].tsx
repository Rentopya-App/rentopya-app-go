import { useLocalSearchParams } from 'expo-router';

import { AgreementScreen } from '@/features/customers/agreements-screens';

export default function AgreementRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <AgreementScreen uuid={uuid} />;
}
