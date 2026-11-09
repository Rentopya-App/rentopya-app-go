import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Plus Jakarta Sans ships one file per weight, so weight is picked by family
 * (`font-sans-semibold`, see global.css) rather than `font-semibold`, which
 * Android and iOS ignore for custom fonts. Registered so the last one wins.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-family': [{ font: ['sans', 'sans-medium', 'sans-semibold', 'sans-bold'] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
