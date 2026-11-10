import { useLocalSearchParams } from 'expo-router';

import { EditTransferScreen } from '@/features/transfers/form-screen';

export default function EditTransferRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <EditTransferScreen uuid={uuid} />;
}
