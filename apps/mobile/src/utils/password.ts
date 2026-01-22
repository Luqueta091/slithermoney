function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function hashPassword(value: string): Promise<string> {
  const trimmed = value.trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(trimmed);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(digest);
  }

  return btoa(unescape(encodeURIComponent(trimmed)));
}
