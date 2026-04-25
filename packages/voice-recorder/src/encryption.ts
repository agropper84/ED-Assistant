/** Encrypt binary data with AES-256-GCM using Web Crypto API (browser-native) */
export async function encryptAudioBlob(audioBlob: Blob, keyBase64: string): Promise<{ encrypted: Blob; ivBase64: string }> {
  const keyBytes = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new Uint8Array(await audioBlob.arrayBuffer());
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const encrypted = new Blob([new Uint8Array(ciphertext)], { type: 'application/octet-stream' });
  const ivBase64 = btoa(Array.from(iv).map(b => String.fromCharCode(b)).join(''));
  return { encrypted, ivBase64 };
}
