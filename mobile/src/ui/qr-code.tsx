import qrcodeGenerator from 'qrcode-generator';
import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

/**
 * A QR code drawn with SVG (black on white, whatever the theme, so every
 * scanner reads it). One path for all dark modules keeps it light.
 */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label?: string }) {
  const { count, d } = useMemo(() => {
    const qr = qrcodeGenerator(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let path = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
    }
    return { count: n, d: path };
  }, [value]);
  const quiet = 2;
  const box = count + quiet * 2;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="self-center overflow-hidden rounded-md bg-white p-1">
      <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${box} ${box}`}>
        <Rect x={-quiet} y={-quiet} width={box} height={box} fill="#FFFFFF" />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}
