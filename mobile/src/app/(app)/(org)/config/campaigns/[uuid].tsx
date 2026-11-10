import { useLocalSearchParams } from 'expo-router';

import { CampaignScreen } from '@/features/config/detail-screens';

export default function CampaignRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <CampaignScreen uuid={uuid} />;
}
