/**
 * Streams a single chat request to /api/ai/chat (SSE).
 * Resolves with the full accumulated response text.
 * Calls onToken(chunk) for each streamed token.
 * Pass an AbortSignal via `signal` to cancel mid-stream.
 */
export async function streamChat({ model, messages, attachments = [], enableWebSearch = false, onToken, signal }) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, attachments, enable_web_search: enableWebSearch }),
    signal,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Server error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;
      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue; // malformed chunk — skip
      }
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.content) {
        fullText += parsed.content;
        onToken?.(parsed.content);
      }
    }
  }

  return fullText;
}
