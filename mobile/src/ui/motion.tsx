import { useState } from 'react';
import { Easing, ReduceMotion, withDelay, withSpring, withTiming } from 'react-native-reanimated';

/** Steps after this many items start together, so a long screen never waits on its tail. */
const MAX_STEPS = 8;
const STEP_MS = 45;
/** Mounts closer than this belong to one screen's first render. */
const BURST_MS = 120;

let burstAt = 0;
let burstStep = 0;

/**
 * Entering animation: fade in while rising a few points, after `step` steps.
 * Follows the system's reduce-motion setting (the item then simply appears).
 */
export function riseIn(step = 0, distance = 12) {
  const delay = Math.min(step, MAX_STEPS) * STEP_MS;
  return () => {
    'worklet';
    const timing = { duration: 340, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.System };
    return {
      initialValues: { opacity: 0, transform: [{ translateY: distance }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { ...timing, duration: 260 }), ReduceMotion.System),
        transform: [{ translateY: withDelay(delay, withTiming(0, timing), ReduceMotion.System) }],
      },
    };
  };
}

/**
 * Entering animation for a screen section (card, grouped list). Sections that
 * mount together rise one after another in mount order, with no wrapper view
 * and no index to pass; later mounts (a refetch, the next page) rise alone.
 */
export function useRiseIn() {
  const [entering] = useState(() => {
    const now = Date.now();
    if (now - burstAt > BURST_MS) burstStep = 0;
    burstAt = now;
    return riseIn(burstStep++);
  });
  return entering;
}

/** The brand mark on a welcome screen: grows in with a soft spring. */
export function brandIn() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.6 }] },
    animations: {
      opacity: withTiming(1, { duration: 240, reduceMotion: ReduceMotion.System }),
      transform: [{ scale: withSpring(1, { damping: 12, stiffness: 140, reduceMotion: ReduceMotion.System }) }],
    },
  };
}
