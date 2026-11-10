import { useLocalSearchParams } from 'expo-router';

import { ConsentScreen } from '@/features/customers/sub-screens';
import { CONSENT_CHANNELS, type ConsentChannel } from '@/features/customers/lib';

export default function CustomerConsent() {
  const { uuid, channel, action } = useLocalSearchParams<{ uuid: string; channel: string; action: string }>();
  const ch: ConsentChannel = (CONSENT_CHANNELS as string[]).includes(channel) ? (channel as ConsentChannel) : 'sms';
  return <ConsentScreen uuid={uuid} channel={ch} action={action === 'withdraw' ? 'withdraw' : 'grant'} />;
}
