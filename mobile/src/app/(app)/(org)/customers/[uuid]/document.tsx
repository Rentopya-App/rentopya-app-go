import { useLocalSearchParams } from 'expo-router';

import { DocumentScreen } from '@/features/customers/sub-screens';

/** `?doc=<uuid>` uploads (or replaces) the file of that document; without it a new document. */
export default function CustomerDocument() {
  const { uuid, doc } = useLocalSearchParams<{ uuid: string; doc?: string }>();
  return <DocumentScreen uuid={uuid} docUuid={doc} />;
}
