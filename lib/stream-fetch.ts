/**
 * Streaming fetch helper for generate routes.
 * Sends request with stream: true, reads the response as a text stream,
 * calls onChunk with partial text as it arrives.
 * Returns the full text when complete.
 */
export async function streamingGenerate(
  url: string,
  body: Record<string, any>,
  onChunk: (partialText: string) => void,
): Promise<{ success: boolean; note: string; error?: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });

  if (res.status === 401) {
    window.location.href = '/login';
    return { success: false, note: '', error: 'Not authenticated' };
  }

  if (!res.ok) {
    try {
      const data = await res.json();
      return { success: false, note: '', error: data.error || 'Generation failed' };
    } catch {
      return { success: false, note: '', error: `Server error (${res.status})` };
    }
  }

  const reader = res.body?.getReader();
  if (!reader) {
    return { success: false, note: '', error: 'Streaming not supported' };
  }

  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const cleanChunk = chunk.replace(/\n\n__STREAM_DONE__$/, '');
      fullText += cleanChunk;
      onChunk(fullText);
    }
  } finally {
    reader.releaseLock();
  }

  fullText = fullText.replace(/\n\n__STREAM_DONE__$/, '').trim();
  return { success: true, note: fullText };
}
