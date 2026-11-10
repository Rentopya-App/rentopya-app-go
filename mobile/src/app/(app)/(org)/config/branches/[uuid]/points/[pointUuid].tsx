import { useLocalSearchParams } from 'expo-router';

import { ServicePointEditScreen } from '@/features/config/edit-screens';

export default function ServicePointEditRoute() {
  const { uuid, pointUuid } = useLocalSearchParams<{ uuid: string; pointUuid: string }>();
  return <ServicePointEditScreen uuid={uuid} pointUuid={pointUuid} />;
}
