import { useTranslation } from 'react-i18next';
import { Alert, Platform, Pressable, View } from 'react-native';

import type { PhotoMeta } from '@/features/uploads/machine';
import { Button } from '@/ui/button';
import { Card } from '@/ui/card';
import { cn } from '@/ui/cn';
import { Icon } from '@/ui/icon';
import { StatusPill } from '@/ui/status-pill';
import { Text } from '@/ui/text';
import { toast } from '@/ui/toast';

import { evidenceVersion, problemText, useDeletePhoto, useMediaLinks } from './api';
import { latestCompleted, photoSlots } from './model';
import { PhotoThumb } from './parts';
import { useCapture } from './use-capture';
import { useWizard } from './wizard-context';

/**
 * Step 5: the template's required photos (and the free extra slot). A slot is
 * done when one of its photos is uploaded and verified by the server; until
 * then the local capture is shown with its queue state. A return shows the
 * handover photo of the same slot next to the new one.
 */
export function PhotosStep() {
  const { t } = useTranslation('inspections');
  const { ins, readOnly, locked, queue } = useWizard();
  const capture = useCapture();
  const remove = useDeletePhoto(ins.uuid);
  const links = useMediaLinks(ins.uuid, evidenceVersion({ photos: ins.photos, signature: null })).data ?? {};
  const baseLinks =
    useMediaLinks(ins.baseline?.uuid, evidenceVersion(ins.baseline ? { photos: ins.baseline.photos, signature: null } : null))
      .data ?? {};
  const slots = photoSlots(ins, t('photos.extra'));
  const required = ins.readiness.required_slots.length;
  const done = required - ins.readiness.missing_slots.length;

  return (
    <Card title={`${t('photos.title')} · ${done}/${required}`}>
      {slots.map((slot) => {
        const latest = latestCompleted(ins.photos, slot.key);
        const jobs = queue.jobs.filter((j) => j.kind === 'photo' && (j.meta as PhotoMeta).slot === slot.key);
        const local = jobs[jobs.length - 1];
        const failed = jobs.some((j) => j.state === 'failed');
        const base = ins.baseline ? latestCompleted(ins.baseline.photos, slot.key) : null;
        const ok = !!latest;
        const now = local?.localPath ?? (latest ? links[latest.uuid] : null);
        return (
          <View
            key={slot.key}
            className={cn(
              'gap-3 rounded-lg border p-3',
              slot.required && !ok ? 'border-warning/60' : 'border-border',
            )}>
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 font-sans-semibold">{slot.label}</Text>
              {failed ? (
                <StatusPill label={t('photos.failed')} tone="problem" />
              ) : local ? (
                <StatusPill label={t('photos.in_queue')} tone="progress" />
              ) : ok ? (
                <StatusPill label={t('photos.done')} tone="done" />
              ) : slot.required ? (
                <StatusPill label={t('photos.required')} tone="problem" />
              ) : null}
            </View>
            <View className="flex-row gap-2">
              {ins.baseline ? (
                <View className="flex-1 gap-1">
                  <Text variant="footnote" tone="muted">
                    {t('photos.at_handover')}
                  </Text>
                  <PhotoThumb uri={base ? baseLinks[base.uuid] : null} label={`${slot.label} · ${t('photos.at_handover')}`} />
                </View>
              ) : null}
              <View className="flex-1 gap-1">
                {ins.baseline ? (
                  <Text variant="footnote" tone="muted">
                    {t('photos.now')}
                  </Text>
                ) : null}
                <PhotoThumb uri={now} label={slot.label} />
              </View>
            </View>
            {latest && !local ? (
              <Text variant="footnote" tone="muted" numberOfLines={1}>
                {`SHA-256 ${latest.sha256.slice(0, 16)}…`}
              </Text>
            ) : null}
            {!readOnly ? (
              <View className="flex-row items-center gap-2">
                <Button
                  icon="camera"
                  variant={ok ? 'outline' : 'primary'}
                  title={ok || local ? t('photos.retake') : t('photos.take')}
                  onPress={() => void capture.take({ slot: slot.key, label: slot.label })}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  icon="photos"
                  title={t('photos.more')}
                  onPress={() => capture.choose({ slot: slot.key, label: slot.label })}
                />
                {latest && !locked ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('photos.remove')}
                    hitSlop={8}
                    className="size-11 items-center justify-center"
                    onPress={() => {
                      const run = () => remove.mutate(latest.uuid, { onError: (e) => toast.error(problemText(e)) });
                      if (Platform.OS === 'web') return run();
                      Alert.alert(t('photos.remove_confirm'), undefined, [
                        { text: t('common:cancel'), style: 'cancel' },
                        { text: t('photos.remove'), style: 'destructive', onPress: run },
                      ]);
                    }}>
                    <Icon name="trash" tone="destructive" size={20} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
