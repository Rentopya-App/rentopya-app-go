import { useLocalSearchParams } from 'expo-router';

import { VoidExpenseScreen } from '@/features/fleet-ops/expense-screens';

export default function VoidExpense() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <VoidExpenseScreen uuid={uuid} />;
}
