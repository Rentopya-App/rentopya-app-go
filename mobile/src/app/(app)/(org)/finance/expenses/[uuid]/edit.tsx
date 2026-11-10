import { useLocalSearchParams } from 'expo-router';

import { ExpenseFormScreen } from '@/features/fleet-ops/expense-screens';

export default function EditExpense() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ExpenseFormScreen uuid={uuid} />;
}
