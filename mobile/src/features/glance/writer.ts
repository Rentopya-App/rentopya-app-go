import { requireOptionalNativeModule } from 'expo';
import type { Widget } from 'expo-widgets';
import { Platform } from 'react-native';

import { buildTimeline, serializeSummary, type TodaySummary } from './summary';

/** App-target inline module (`app-intents/GlanceModule.swift`): the App Group copy Siri reads. */
type GlanceModule = {
  setSummary(json: string): boolean;
  clearSummary(): void;
};

let widget: Widget<TodaySummary> | null | undefined;
let glance: GlanceModule | null | undefined;

/**
 * The Home Screen widget, loaded lazily. iOS only: Android has no widget yet
 * and the web none at all; null too where the native module is missing (Expo Go).
 */
function getWidget(): Widget<TodaySummary> | null {
  if (widget !== undefined) return widget;
  widget = null;
  if (Platform.OS !== 'ios' || !requireOptionalNativeModule('ExpoWidgets')) return widget;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    widget = require('@/widgets/today-widget').default as Widget<TodaySummary>;
  } catch (error) {
    if (__DEV__) console.warn('Widget failed to load', error);
    widget = null;
  }
  return widget;
}

function getGlance(): GlanceModule | null {
  if (glance === undefined) {
    glance = Platform.OS === 'ios' ? requireOptionalNativeModule<GlanceModule>('RentopyaGlance') : null;
  }
  return glance;
}

/** True where a widget or Siri can read the summary (an iOS build with the targets). */
export const glanceAvailable = () => getWidget() !== null || getGlance() !== null;

let lastKey = '';

/**
 * Writes the summary to the App Group: the widget's timeline (which reloads
 * it) and the copy the App Intents answer from. An unchanged board skips the
 * widget reload (WidgetKit's daily budget); Siri's copy is always rewritten so
 * its "last updated" stays true. A no-op on Android, web and Expo Go.
 */
export function writeSummary(summary: TodaySummary, now = Date.now()) {
  const w = getWidget();
  const g = getGlance();
  if (!w && !g) return;
  const { json, key } = serializeSummary(summary);
  try {
    g?.setSummary(json);
    if (w && key !== lastKey) {
      w.updateTimeline(buildTimeline(summary, now));
      lastKey = key;
    }
  } catch (error) {
    if (__DEV__) console.warn('Glance summary write failed', error);
  }
}

/** Sign-out or another organization: the widget shows the signed-out card, Siri knows nothing. */
export function clearSummary(signedOut: TodaySummary) {
  const w = getWidget();
  const g = getGlance();
  try {
    g?.clearSummary();
    if (w) {
      const { key } = serializeSummary(signedOut);
      if (key !== lastKey) w.updateSnapshot(signedOut);
      lastKey = key;
    }
  } catch (error) {
    if (__DEV__) console.warn('Glance summary clear failed', error);
  }
}
