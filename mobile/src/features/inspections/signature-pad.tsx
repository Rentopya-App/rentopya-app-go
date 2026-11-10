import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button } from '@/ui/button';
import { cn } from '@/ui/cn';
import { Text } from '@/ui/text';

import type { SignatureCapture, SignaturePoint } from './signature-png';

const INK = '#111827';

function pathOf(stroke: SignaturePoint[]) {
  return stroke.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

function pressure(e: GestureResponderEvent) {
  const f = (e.nativeEvent as { force?: number }).force;
  return typeof f === 'number' && f > 0 && f <= 1 ? f : 0.5;
}

/**
 * Signature pad: finger or pen strokes as [x, y, pressure, t] points in pad
 * pixels (the panel's SignaturePad format), drawn as SVG paths on white
 * paper. The PNG is made from the same strokes (`signature-png.ts`), so what
 * the customer sees is what the API stores.
 */
export function SignaturePad({
  height = 200,
  disabled,
  onChange,
  onDrawing,
}: {
  height?: number;
  disabled?: boolean;
  onChange: (capture: SignatureCapture) => void;
  /** True while a finger is on the pad (the screen stops scrolling meanwhile). */
  onDrawing?: (drawing: boolean) => void;
}) {
  const { t } = useTranslation('inspections');
  const [width, setWidth] = useState(0);
  const [strokes, setStrokes] = useState<SignaturePoint[][]>([]);
  const started = useRef<number | null>(null);
  const live = useRef<SignaturePoint[] | null>(null);

  const emit = (next: SignaturePoint[][]) => {
    setStrokes(next);
    onChange({ width, height, strokes: next });
  };
  const point = (e: GestureResponderEvent): SignaturePoint => {
    const now = Date.now();
    started.current ??= now;
    const x = Math.min(width, Math.max(0, e.nativeEvent.locationX));
    const y = Math.min(height, Math.max(0, e.nativeEvent.locationY));
    return [x, y, pressure(e), now - started.current];
  };

  return (
    <View className="gap-2">
      <View
        accessibilityLabel={t('signature.placeholder')}
        onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          onDrawing?.(true);
          live.current = [point(e)];
          setStrokes((s) => [...s, live.current!]);
        }}
        onResponderMove={(e) => {
          if (!live.current) return;
          const p = point(e);
          const last = live.current[live.current.length - 1];
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1) return;
          live.current = [...live.current, p];
          const current = live.current;
          setStrokes((s) => [...s.slice(0, -1), current]);
        }}
        onResponderTerminate={() => onDrawing?.(false)}
        onResponderRelease={() => {
          onDrawing?.(false);
          const done = live.current;
          live.current = null;
          if (done) emit([...strokes.slice(0, -1), done]);
        }}
        className={cn(
          'overflow-hidden rounded-lg border-2 border-dashed border-border bg-white',
          disabled && 'opacity-50',
        )}
        style={{ height }}>
        {strokes.length === 0 ? (
          <View className="absolute inset-0 items-center justify-center" pointerEvents="none">
            <Text tone="muted">{t('signature.placeholder')}</Text>
          </View>
        ) : null}
        <Svg width="100%" height={height} pointerEvents="none">
          {strokes.map((s, i) =>
            s.length === 1 ? (
              <Circle key={i} cx={s[0][0]} cy={s[0][1]} r={1.6} fill={INK} />
            ) : (
              <Path
                key={i}
                d={pathOf(s)}
                stroke={INK}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            ),
          )}
        </Svg>
      </View>
      <View className="flex-row gap-2">
        <Button
          variant="outline"
          icon="back"
          title={t('signature.undo')}
          disabled={disabled || strokes.length === 0}
          onPress={() => emit(strokes.slice(0, -1))}
          className="flex-1"
        />
        <Button
          variant="outline"
          icon="trash"
          title={t('signature.clear')}
          disabled={disabled || strokes.length === 0}
          onPress={() => {
            started.current = null;
            emit([]);
          }}
          className="flex-1"
        />
      </View>
    </View>
  );
}
