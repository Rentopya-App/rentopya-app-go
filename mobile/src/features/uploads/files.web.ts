/** Web preview: no document directory; the capture's blob/data URI is kept as is. */
export async function keepFile(sourceUri: string): Promise<{ uri: string; size: number }> {
  const blob = await (await fetch(sourceUri)).blob();
  return { uri: sourceUri, size: blob.size };
}

export async function keepBase64(base64: string): Promise<{ uri: string; size: number }> {
  return { uri: `data:image/png;base64,${base64}`, size: Math.floor((base64.length * 3) / 4) };
}

export function fileExists(_uri: string) {
  return true;
}

export async function readBase64(uri: string) {
  if (uri.startsWith('data:')) return uri.slice(uri.indexOf(',') + 1);
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function removeFile(_uri: string) {}

export async function formPart(uri: string, name: string, type: string): Promise<unknown> {
  const blob = await (await fetch(uri)).blob();
  return new File([blob], name, { type });
}
