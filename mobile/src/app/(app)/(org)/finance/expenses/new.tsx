import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '@/features/fleet-ops/expense-screens';

export default function NewExpense() {
  const { vehicle } = useLocalSearchParams<{ vehicle?: string }>();
  return <ExpenseFormScreen vehicle={vehicle} />;
}
