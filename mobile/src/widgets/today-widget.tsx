import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { TodaySummary } from '@/features/glance/summary';

/**
 * "Rentopya · Bugün" Home Screen widget (small, medium): today's handovers
 * and returns and the next job (time, plate, customer initials, type).
 *
 * Runs in the widget runtime, not the app: everything (palette, helpers)
 * lives inside the function, only @expo/ui/swift-ui renders, and the props
 * arrive display-ready from `src/features/glance` (no network, no token).
 * Keep imports un-aliased; the runtime resolves components and modifiers by
 * their exported names. Each timeline entry's date decides "late" and whether
 * the numbers are another day's.
 */
const RentopyaToday = (props: TodaySummary, environment: WidgetEnvironment) => {
  'widget';
  const dark = environment.colorScheme === 'dark';
  // Brand: indigo #2E358C / ink #141527 (docs/brand.md); dark mode uses indigo light.
  const c = dark
    ? {
        bg: '#141527',
        card: '#22264A',
        text: '#F8FAFC',
        sub: '#C7CAF6',
        muted: '#7C83E0',
        brand: '#8E95EC',
        ok: '#00D492',
        late: '#FF6467',
      }
    : {
        bg: '#FFFFFF',
        card: '#ECEDF8',
        text: '#141527',
        sub: '#5A5F7A',
        muted: '#8A8FB0',
        brand: '#2E358C',
        ok: '#009966',
        late: '#E7000B',
      };
  const home = 'rentopya://';
  const ready = Boolean(props && props.v === 1);
  const at = environment.date ? new Date(environment.date).getTime() : Date.now();
  const stale = ready && props.state === 'ok' && props.dayEnd > 0 && at >= props.dayEnd;
  const L = ready ? props.labels : null;

  const root = (content: any, url: string) => (
    <VStack
      alignment="leading"
      spacing={0}
      modifiers={[
        frame({ maxWidth: 1000, maxHeight: 1000, alignment: 'topLeading' }),
        containerBackground(c.bg, 'widget'),
        widgetURL(url),
      ]}>
      {content}
    </VStack>
  );

  const brandRow = (title: string) => (
    <HStack spacing={6}>
      <Image systemName="car.fill" size={12} color={c.brand} />
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.sub), lineLimit(1)]}>{title}</Text>
      <Spacer />
    </HStack>
  );

  if (!ready || props.state !== 'ok' || stale) {
    const message = !ready ? 'Rentopya' : stale ? L!.stale : props.state === 'noAccess' ? L!.noAccess : L!.signedOut;
    return root(
      <VStack alignment="leading" spacing={8}>
        {brandRow(ready && props.org ? props.org : 'Rentopya')}
        <Spacer />
        <Image systemName={stale ? 'arrow.clockwise' : 'lock.fill'} size={18} color={c.muted} />
        <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(c.sub), lineLimit(3)]}>{message}</Text>
      </VStack>,
      home,
    );
  }

  const next = props.jobs[0];
  const late = Boolean(next && next.at < at);
  const typeLabel = (type: string) => (type === 'return' ? L!.return : L!.handover);
  const typeSymbol = (type: string) => (type === 'return' ? 'arrow.down.to.line' : 'arrow.up.right');
  const title = props.branch ? `${props.org} · ${props.branch}` : props.org;

  const count = (symbol: any, label: string, value: { total: number; done: number }, size: number) => (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={4}>
        <Image systemName={symbol} size={10} color={c.brand} />
        <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(c.sub), lineLimit(1)]}>{label}</Text>
      </HStack>
      <HStack spacing={3}>
        <Text
          modifiers={[font({ size, weight: 'bold', design: 'rounded' }), foregroundStyle(c.text), monospacedDigit()]}>
          {String(value.total)}
        </Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted), monospacedDigit(), lineLimit(1)]}>
          {`${value.done}/${value.total}`}
        </Text>
      </HStack>
    </VStack>
  );

  const nextBlock = (compact: boolean) =>
    next ? (
      <VStack alignment="leading" spacing={1}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(c.muted), lineLimit(1)]}>{L!.next}</Text>
          {late ? (
            <Text modifiers={[font({ size: 10, weight: 'bold' }), foregroundStyle(c.late), lineLimit(1)]}>
              {L!.late}
            </Text>
          ) : null}
        </HStack>
        <HStack spacing={5}>
          <Text
            modifiers={[
              font({ size: compact ? 13 : 15, weight: 'bold', design: 'rounded' }),
              foregroundStyle(late ? c.late : c.brand),
              monospacedDigit(),
            ]}>
            {next.time}
          </Text>
          <Image systemName={typeSymbol(next.type)} size={10} color={c.sub} />
          <Text modifiers={[font({ size: 11, weight: 'medium' }), foregroundStyle(c.sub), lineLimit(1)]}>
            {typeLabel(next.type)}
          </Text>
        </HStack>
        <Text
          modifiers={[
            font({ size: compact ? 12 : 13, weight: 'semibold' }),
            foregroundStyle(c.text),
            lineLimit(1),
            minimumScaleFactor(0.8),
          ]}>
          {next.initials ? `${next.plate} · ${next.initials}` : next.plate}
        </Text>
      </VStack>
    ) : (
      <HStack spacing={4}>
        <Image systemName="checkmark.circle.fill" size={11} color={c.ok} />
        <Text modifiers={[font({ size: 12 }), foregroundStyle(c.sub), lineLimit(2)]}>{L!.none}</Text>
      </HStack>
    );

  if (environment.widgetFamily === 'systemMedium') {
    return root(
      <HStack alignment="top" spacing={14}>
        <VStack alignment="leading" spacing={0} modifiers={[frame({ maxHeight: 1000, alignment: 'topLeading' })]}>
          {brandRow(title)}
          <Spacer />
          <HStack spacing={14}>
            {count('arrow.up.right', L!.handovers, props.handovers, 30)}
            {count('arrow.down.to.line', L!.returns, props.returns, 30)}
          </HStack>
          <Spacer />
          <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
            {`${props.day} · ${L!.updated} ${props.updatedTime}`}
          </Text>
        </VStack>
        <VStack
          alignment="leading"
          spacing={0}
          modifiers={[
            padding({ all: 10 }),
            frame({ maxWidth: 1000, maxHeight: 1000, alignment: 'leading' }),
            background(c.card),
            clipShape('roundedRectangle', 14),
          ]}>
          {next ? <Link destination={`rentopya://rentals/${next.id}`}>{nextBlock(false)}</Link> : nextBlock(false)}
          <Spacer />
          {props.jobs.length > 1 ? (
            <Text modifiers={[font({ size: 10 }), foregroundStyle(c.muted), lineLimit(1)]}>
              {`+${props.jobs.length - 1}`}
            </Text>
          ) : null}
        </VStack>
      </HStack>,
      home,
    );
  }

  // systemSmall: one tap target, the Today screen.
  return root(
    <VStack alignment="leading" spacing={0}>
      {brandRow(L!.title)}
      <Spacer />
      <HStack spacing={12}>
        {count('arrow.up.right', L!.handovers, props.handovers, 24)}
        {count('arrow.down.to.line', L!.returns, props.returns, 24)}
      </HStack>
      <Spacer />
      {nextBlock(true)}
    </VStack>,
    home,
  );
};

export default createWidget<TodaySummary>('RentopyaToday', RentopyaToday);
