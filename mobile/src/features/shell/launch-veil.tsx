import { useEffect, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const LIGHT = { background: '#F8FAFC', icon: require('@/assets/images/splash-icon.png') };
const DARK = { background: '#020618', icon: require('@/assets/images/splash-icon-dark.png') };
/** Same size as the native splash (`imageWidth` 88 in app.json; the art is 400×393). */
const ICON = { width: 88, height: 86.4 };

/**
 * Hand-off from the native splash: the same icon on the same background sits
 * over the first screen, gives a small press, then grows and fades away to
 * reveal the app. Skipped when the system asks for reduced motion.
 */
export function LaunchVeil() {
  const reduced = useReducedMotion();
  const scheme = useColorScheme() === 'dark' ? DARK : LIGHT;
  const [done, setDone] = useState(reduced);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    const motion = { reduceMotion: ReduceMotion.Never };
    scale.value = withSequence(
      withTiming(0.86, { duration: 180, easing: Easing.out(Easing.quad), ...motion }),
      withTiming(7, { duration: 460, easing: Easing.in(Easing.cubic), ...motion }),
    );
    opacity.value = withDelay(
      300,
      withTiming(0, { duration: 340, easing: Easing.out(Easing.quad), ...motion }, (finished) => {
        if (finished) scheduleOnRN(setDone, true);
      }),
    );
  }, [reduced, scale, opacity]);

  const veil = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const icon = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  if (done) return null;
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.veil, { backgroundColor: scheme.background }, veil]}>
      <Animated.Image source={scheme.icon} style={[ICON, icon]} resizeMode="contain" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  veil: { alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
});
