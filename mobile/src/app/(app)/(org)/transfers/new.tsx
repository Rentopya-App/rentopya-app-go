import { useLocalSearchParams } from 'expo-router';

import { NewTransferScreen } from '@/features/transfers/form-screen';

export default function NewTransferRoute() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  return <NewTransferScreen vehicle={vehicle} />;
}
