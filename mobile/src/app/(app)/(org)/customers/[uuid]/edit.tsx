import { useLocalSearchParams } from 'expo-router';

import { CustomerFormScreen } from '@/features/customers/customer-form-screen';

export default function EditCustomer() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <CustomerFormScreen uuid={uuid} />;
}
