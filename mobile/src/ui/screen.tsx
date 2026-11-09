import type { ReactNode } from 'react';
import { View, type ScrollViewProps } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { cn } from './cn';

const AwareScrollView = withUniwind(KeyboardAwareScrollView);

/**
 * Scrollable screen body under a native large-title header. The header
 * collapses natively because the scroll view adjusts its insets. The focused
 * input is always scrolled above the keyboard (react-native-keyboard-controller).
 */
export function Screen({ children, className, ...props }: ScrollViewProps & { className?: string }) {
  return (
    <AwareScrollView
      bottomOffset={24}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      className="flex-1 bg-background"
      contentContainerClassName={cn('gap-4 px-4 pb-10 pt-2', className)}
      {...props}>
      {children}
    </AwareScrollView>
  );
}

/**
 * Form screen: scrollable fields with a bottom action bar that rides on top
 * of the keyboard instead of hiding behind it, and respects the home
 * indicator when the keyboard is closed.
 */
export function FormScreen({
  children,
  footer,
  className,
  ...props
}: ScrollViewProps & { className?: string; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-background">
      <AwareScrollView
        // Leave room for the footer above the focused field.
        bottomOffset={footer ? 96 : 24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        className="flex-1"
        contentContainerClassName={cn('gap-4 px-4 pt-2', footer ? 'pb-6' : 'pb-10', className)}
        {...props}>
        {children}
      </AwareScrollView>
      {footer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            className="gap-2 border-t border-border bg-background px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
            {footer}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  );
}
