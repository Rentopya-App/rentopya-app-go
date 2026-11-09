// One module per weight: the package root would ship every weight and italic (Metro does not tree-shake).
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';

import { MATERIAL_FONT } from './material-font';

/**
 * The panel's typeface, Plus Jakarta Sans (frontend/src/app/layout.tsx). Family names are the
 * keys, matched by `--font-sans*` in global.css. On Android the icon font
 * loads with them, so no icon draws empty on the first frame.
 */
export const FONTS = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  ...(MATERIAL_FONT ? { [MATERIAL_FONT.name]: MATERIAL_FONT.font } : {}),
};
