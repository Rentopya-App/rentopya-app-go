import { create } from 'zustand';

import { setActiveOrganization, setSessionExpiredHandler, setTenantAccessLostHandler } from '@/core/api/client';
import { queryClient } from '@/core/query';
import { readJSON, storage, writeJSON } from '@/core/storage';
import { unregisterPush } from '@/features/push/push';

import { type ApiTokens, fetchMe, logout, type Me } from './api';
import { type MeOrganization, organizationPreference, pickOrganization } from './organization';
import { clearTokens, fromApi, loadTokens, setTokens } from './tokens';

type Status = 'loading' | 'signedOut' | 'signedIn';

type Session = {
  status: Status;
  /** Last known session; cached so the app renders before the network answers. */
  me: Me | null;
  /** Organization every `/v1/tenant/*` call is made for; null until one is picked. */
  organization: MeOrganization | null;
  /** Set when the picked organization stopped working (removed, suspended, expired). */
  lostOrganization: { uuid: string; name: string; code: string } | null;
  hydrate: () => Promise<void>;
  signIn: (tokens: ApiTokens) => Promise<void>;
  refreshMe: () => Promise<Me>;
  selectOrganization: (slug: string) => void;
  /** Drops the picked organization (membership gone); the picker opens. */
  leaveOrganization: (code: string) => void;
  signOut: (opts?: { remote?: boolean }) => Promise<void>;
};

const ME_KEY = 'session.me';
const preference = organizationPreference(storage);

function activate(organization: MeOrganization | null) {
  setActiveOrganization(organization?.slug ?? null);
  return organization;
}

export const useSession = create<Session>((set, get) => ({
  status: 'loading',
  me: null,
  organization: null,
  lostOrganization: null,

  hydrate: async () => {
    const tokens = await loadTokens();
    const me = tokens ? readJSON<Me>(ME_KEY) : null;
    const organization = activate(me ? pickOrganization(me.organizations, preference.get()) : null);
    set({ status: tokens && me ? 'signedIn' : 'signedOut', me, organization });
  },

  signIn: async (tokens) => {
    await setTokens(fromApi(tokens));
    const me = await fetchMe();
    writeJSON(ME_KEY, me);
    const organization = activate(pickOrganization(me.organizations, preference.get()));
    set({ status: 'signedIn', me, organization, lostOrganization: null });
  },

  refreshMe: async () => {
    const me = await fetchMe();
    writeJSON(ME_KEY, me);
    // Roles and permissions may have changed; a removed membership drops the selection.
    const previous = get().organization;
    // A membership that just failed is never picked again on its own; the member can still choose it.
    const lost = get().lostOrganization;
    const candidates = lost ? me.organizations?.filter((o) => o.uuid !== lost.uuid) : me.organizations;
    const organization = activate(pickOrganization(candidates, previous?.slug ?? preference.get()));
    if (previous && previous.uuid !== organization?.uuid) queryClient.clear();
    set({ me, organization });
    return me;
  },

  selectOrganization: (slug) => {
    const organization = pickOrganization(get().me?.organizations, slug);
    if (!organization || organization.slug !== slug) return;
    preference.set(slug);
    activate(organization);
    // Every cached list belongs to the previous organization.
    queryClient.clear();
    set({ organization, lostOrganization: null });
  },

  leaveOrganization: (code) => {
    const current = get().organization;
    if (!current) return;
    preference.clear();
    activate(null);
    queryClient.clear();
    set({ organization: null, lostOrganization: { uuid: current.uuid, name: current.name, code } });
    // The membership list is stale too: refresh it for the picker.
    void get()
      .refreshMe()
      .catch(() => undefined);
  },

  signOut: async ({ remote = true } = {}) => {
    // While the access token still works: this phone stops getting the member's pushes.
    if (remote) await unregisterPush();
    if (remote) await logout().catch(() => undefined);
    await clearTokens();
    storage.remove(ME_KEY);
    activate(null);
    queryClient.clear();
    set({ status: 'signedOut', me: null, organization: null, lostOrganization: null });
  },
}));

setSessionExpiredHandler(() => {
  if (useSession.getState().status === 'signedIn') void useSession.getState().signOut({ remote: false });
});

setTenantAccessLostHandler((slug, code) => {
  // Only the organization still picked; a late answer for a previous one changes nothing.
  if (useSession.getState().organization?.slug === slug) useSession.getState().leaveOrganization(code);
});
