import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Rect, Text as SvgText } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

import { Text } from '@/ui/text';

import { countByZone, markerPoint, SHAPES, toPosition, VIEW_H, VIEW_W, viewPoint, zoneAt, type Zone } from './diagram';
import type { InspectionDamage } from './model';

function color(v: unknown, fallback: string) {
  return typeof v === 'string' ? v : fallback;
}

/**
 * The panel's vehicle diagram (same shapes and viewBox): tap where the damage
 * is; the tapped panel becomes the zone and the spot is kept as the marker.
 * Damages of this form are filled red dots, those of the handover record
 * (a return's baseline) amber rings.
 */
export function VehicleDiagram({
  damages,
  baseline = [],
  selected,
  disabled,
  onTap,
}: {
  damages: InspectionDamage[];
  baseline?: InspectionDamage[];
  selected?: string | null;
  disabled?: boolean;
  onTap: (zone: Zone, pos: { pos_x: number; pos_y: number }) => void;
}) {
  const { t } = useTranslation('inspections');
  const [box, setBox] = useState({ w: 0, h: 0 });
  const fg = color(useCSSVariable('--color-foreground'), '#141527');
  const muted = color(useCSSVariable('--color-muted'), '#f1f5f9');
  const primary = color(useCSSVariable('--color-primary'), '#2e358c');
  const danger = color(useCSSVariable('--color-destructive'), '#e7000b');
  const warning = color(useCSSVariable('--color-warning'), '#e17100');
  const own = countByZone(damages);
  const old = countByZone(baseline);

  return (
    <View className="items-center gap-3">
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={t('diagram.label')}
        accessibilityHint={t('diagram.hint')}
        onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        // Responder events carry the tap position inside the view on every platform.
        onStartShouldSetResponder={() => !disabled}
        onResponderRelease={(e) => {
          const [x, y] = viewPoint(e.nativeEvent.locationX, e.nativeEvent.locationY, box.w, box.h);
          const zone = zoneAt(x, y);
          if (zone) onTap(zone, toPosition(x, y));
        }}
        style={{ width: '78%', maxWidth: 300, aspectRatio: VIEW_W / VIEW_H }}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} pointerEvents="none">
          {SHAPES.map((s) => {
            const fill = own[s.zone] ? `${danger}40` : old[s.zone] ? `${warning}33` : muted;
            const active = selected === s.zone;
            const common = {
              fill,
              stroke: active ? primary : `${fg}66`,
              strokeWidth: active ? 3 : 1.2,
            };
            return (
              <G key={s.zone}>
                {s.kind === 'rect' ? (
                  <Rect x={s.x} y={s.y} width={s.w} height={s.h} rx={s.r ?? 2} {...common} />
                ) : (
                  <Ellipse cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} {...common} />
                )}
              </G>
            );
          })}
          {baseline.map((d) => {
            const [x, y] = markerPoint(d);
            return <Circle key={`b-${d.uuid}`} cx={x} cy={y} r={6} fill="none" stroke={warning} strokeWidth={2.2} />;
          })}
          {damages.map((d, i) => {
            const [x, y] = markerPoint(d);
            return (
              <G key={d.uuid}>
                <Circle cx={x} cy={y} r={7.5} fill={danger} />
                <SvgText x={x} y={y + 3.5} fontSize={10} fontWeight="bold" fill="#ffffff" textAnchor="middle">
                  {String(i + 1)}
                </SvgText>
              </G>
            );
          })}
        </Svg>
      </View>
      <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-1">
        <View className="flex-row items-center gap-1.5">
          <View className="size-2.5 rounded-full bg-destructive" />
          <Text variant="footnote" tone="muted">
            {t('diagram.this_form')}
          </Text>
        </View>
        {baseline.length > 0 ? (
          <View className="flex-row items-center gap-1.5">
            <View className="size-2.5 rounded-full border-2 border-warning" />
            <Text variant="footnote" tone="muted">
              {t('diagram.handover')}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
