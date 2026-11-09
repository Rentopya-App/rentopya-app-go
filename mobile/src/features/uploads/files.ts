import { Directory, File, Paths } from 'expo-file-system';

/**
 * Queue files under the app's document directory (`uploads/`), which the OS
 * never purges (the camera's cache file may be gone after a restart).
 * `files.web.ts` keeps the capture's own URI in the web preview.
 */
function dir() {
  const d = new Directory(Paths.document, 'uploads');
  if (!d.exists) d.create({ idempotent: true, intermediates: true });
  return d;
}

/** Copies a capture into the queue directory; returns its URI and size in bytes. */
export async function keepFile(sourceUri: string, name: string): Promise<{ uri: string; size: number }> {
  const target = new File(dir(), name);
  if (target.exists) target.delete();
  await new File(sourceUri).copy(target);
  const kept = new File(dir(), name);
  return { uri: kept.uri, size: kept.size ?? 0 };
}

/** Writes a base64 payload (the signature PNG) into the queue directory. */
export async function keepBase64(base64: string, name: string): Promise<{ uri: string; size: number }> {
  const target = new File(dir(), name);
  if (target.exists) target.delete();
  target.create();
  await target.write(base64, { encoding: 'base64' });
  return { uri: target.uri, size: target.size ?? 0 };
}

export function fileExists(uri: string) {
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

export function readBase64(uri: string) {
  return new File(uri).base64();
}

export function removeFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

/** The multipart part React Native's fetch streams from disk. */
export async function formPart(uri: string, name: string, type: string): Promise<unknown> {
  return { uri, name, type };
}
