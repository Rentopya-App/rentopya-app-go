import { cva, type VariantProps } from 'class-variance-authority';
import { Children, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text as RNText, type TextProps } from 'react-native';

import { cn } from './cn';

/**
 * Type scale in iOS points, Plus Jakarta Sans like the panel (weights are families,
 * see `cn`). Dynamic Type still scales every variant.
 */
const text = cva('font-sans text-foreground', {
  variants: {
    variant: {
      largeTitle: 'text-[34px] leading-[41px] font-sans-bold tracking-tight',
      title: 'text-[22px] leading-[28px] font-sans-semibold',
      headline: 'text-[17px] leading-[22px] font-sans-semibold',
      body: 'text-[17px] leading-[22px]',
      callout: 'text-[15px] leading-[20px]',
      footnote: 'text-[13px] leading-[18px]',
      /** Uppercased in JS (see `upper`): CSS uppercase ignores the locale (Turkish i → İ). */
      caption: 'text-[11px] leading-[13px] tracking-wide',
      /** Big figures (money, counts): tabular digits so rows never shift. */
      figure: 'text-[28px] leading-[34px] font-sans-bold tracking-tight tabular-nums',
    },
    tone: {
      default: '',
      muted: 'text-muted-foreground',
      primary: 'text-primary',
      danger: 'text-destructive',
      success: 'text-success',
      onPrimary: 'text-primary-foreground',
    },
  },
  defaultVariants: { variant: 'body', tone: 'default' },
});

export type TextVariant = NonNullable<VariantProps<typeof text>['variant']>;

/** Locale-aware uppercase for string children (RN textTransform is not). */
function upper(children: ReactNode, lang: string): ReactNode {
  return Children.map(children, (c) => (typeof c === 'string' ? c.toLocaleUpperCase(lang) : c));
}

export function Text({
  variant,
  tone,
  className,
  children,
  ...props
}: TextProps & VariantProps<typeof text> & { className?: string }) {
  const { i18n } = useTranslation();
  return (
    <RNText className={cn(text({ variant, tone }), className)} {...props}>
      {variant === 'caption' ? upper(children, i18n.language) : children}
    </RNText>
  );
}
