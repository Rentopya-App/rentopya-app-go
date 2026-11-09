import { NativeTabs } from 'expo-router/native-tabs';
import { useTranslation } from 'react-i18next';

import { useTabTint } from '@/features/shell/tab-tint';

/** Company panel tabs (native). Module tabs join here, hidden when the member's role cannot use them. */
export default function Tabs() {
  const { t } = useTranslation('nav');
  const tint = useTabTint();
  return (
    <NativeTabs tintColor={tint}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
        <NativeTabs.Trigger.Label>{t('home')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="menu">
        <NativeTabs.Trigger.Icon sf="line.3.horizontal" md="menu" />
        <NativeTabs.Trigger.Label>{t('menu')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
