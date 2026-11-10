import { useLocalSearchParams } from 'expo-router';

import { ChannelMappingScreen } from '@/features/config/channel-preview-screens';

export default function ChannelMappingRoute() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  return <ChannelMappingScreen uuid={uuid} />;
}
