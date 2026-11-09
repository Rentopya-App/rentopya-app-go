/**
 * Web preview: expo-sqlite's synchronous kv-store needs a worker and
 * SharedArrayBuffer and times out in a plain browser tab, so the web build
 * keeps the same synchronous API on localStorage.
 */
const ls = (): Storage | undefined => (typeof localStorage === 'undefined' ? undefined : localStorage);

const Storage_ = {
  getItemSync: (key: string): string | null => ls()?.getItem(key) ?? null,
  setItemSync: (key: string, value: string) => ls()?.setItem(key, value),
  removeItemSync: (key: string) => ls()?.removeItem(key),
};

export default Storage_;
