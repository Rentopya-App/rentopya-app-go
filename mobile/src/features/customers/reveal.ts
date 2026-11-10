import { useEffect, useState } from 'react';
import { create } from 'zustand';

import type { CustomerRevealed } from './api';
import { secondsLeft } from './lib';

type Entry = { data: CustomerRevealed; expiresAt: number };

/**
 * Revealed plaintext of the customer being looked at: memory only (never the
 * query cache, never storage), dropped when `display_seconds` run out, on
 * "Şimdi gizle" or when the customer page closes. Same rule as the panel.
 */
const useRevealStore = create<{ byCustomer: Record<string, Entry> }>(() => ({ byCustomer: {} }));

export function keepRevealed(data: CustomerRevealed, now = Date.now()) {
  useRevealStore.setState((s) => ({
    byCustomer: { ...s.byCustomer, [data.customer_uuid]: { data, expiresAt: now + data.display_seconds * 1000 } },
  }));
}

export function hideRevealed(customerUuid: string) {
  useRevealStore.setState((s) => {
    if (!s.byCustomer[customerUuid]) return s;
    const next = { ...s.byCustomer };
    delete next[customerUuid];
    return { byCustomer: next };
  });
}

/** The revealed values while the window is open, with the seconds left (ticks every second). */
export function useRevealed(customerUuid: string) {
  const entry = useRevealStore((s) => s.byCustomer[customerUuid]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!entry) return;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= entry.expiresAt) hideRevealed(customerUuid);
    }, 1000);
    return () => clearInterval(id);
  }, [entry, customerUuid]);
  const left = entry ? secondsLeft(entry.expiresAt, now) : 0;
  return { revealed: entry && left > 0 ? entry.data : null, secondsLeft: left };
}
