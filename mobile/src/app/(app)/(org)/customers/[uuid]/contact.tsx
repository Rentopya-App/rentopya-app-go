import { useLocalSearchParams } from 'expo-router';

import { ContactScreen } from '@/features/customers/sub-screens';

/** `?contact=<uuid>` edits that contact; without it a new one. */
export default function CustomerContact() {
  const { uuid, contact } = useLocalSearchParams<{ uuid: string; contact?: string }>();
  return <ContactScreen uuid={uuid} contactUuid={contact} />;
}
