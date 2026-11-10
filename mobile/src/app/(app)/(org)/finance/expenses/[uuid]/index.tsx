import { useLocalSearchParams } from 'expo-router';

import { ExpenseScreen } from '@/features/fleet-ops/expense-screens';

export default function Expense() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ExpenseScreen uuid={uuid} />;
}
