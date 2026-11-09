import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/** Path of the kit's `rentopya-icon-colorful.svg` (docs/brand.md), never recoloured. */
const R =
  'M4012.2,827.508a113.754,113.754,0,1,0,0-227.508H3754.7c7.95,86.922,56.42,89.581,95.32,89.581h152.93a27.728,27.728,0,1,1,0,55.456h-170c-38.26,0-78.59,14.41-98.17,48.345s-28.32,81.521,18.5,129.4,65.83,68.362,81.09,83.893,27.19,21.33,48.37,21.33h69.71c9.57,0,19.51-1.03,8.54-15.64s-126.71-135.1-139.43-147.882-11.77-36.97,11.39-36.97H4012.2Zm4.27,42.658c12.71,12.779,122.75,127.584,133.73,142.194s1.04,15.64-8.54,15.64h-69.71c-21.17,0-33.11-5.8-48.37-21.33s-100.01-101.138-146.53-149.3h93.89C3981.16,857.369,4003.75,857.388,4016.47,870.166Z';

/** App icon tile: white "R" on the indigo → ink gradient, with the iOS corner radius. */
export function BrandMark({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 850 850" accessibilityLabel="Rentopya">
      <Defs>
        <LinearGradient id="rentopya-tile" x1="425" y1="850" x2="425" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#141527" />
          <Stop offset="1" stopColor="#2E358C" />
        </LinearGradient>
      </Defs>
      <Rect width={850} height={850} rx={191} fill="url(#rentopya-tile)" />
      <Path d={R} fill="#FFFFFF" fillRule="evenodd" transform="translate(-3512 -389)" />
    </Svg>
  );
}
