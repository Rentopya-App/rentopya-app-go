import { AppIntentsHandler } from '@/features/intents/handler';

import { useGlanceSessionGuard } from './use-glance';

/**
 * iOS glanceable surfaces in the root shell: clears the widget / Siri summary
 * on sign-out and routes Siri / Shortcuts actions. Renders nothing.
 */
export function GlanceHost() {
  useGlanceSessionGuard();
  return <AppIntentsHandler />;
}
