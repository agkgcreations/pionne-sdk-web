// Web feedback API — programmatic only (no built-in widget yet, the host
// site usually has its own design system). Roll your own UI and call
// Pionne.captureFeedback({ message, name?, email?, eventId? }).

export interface FeedbackContext {
  endpoint: string;
  token: string;
  appVersion?: string;
}

export interface FeedbackPayload {
  message: string;
  name?: string;
  email?: string;
  eventId?: number | string;
  url?: string;
}

function feedbackUrl(ingestEndpoint: string, eventId?: number | string): string {
  const base = ingestEndpoint.endsWith('/ingest')
    ? ingestEndpoint.slice(0, -'/ingest'.length)
    : ingestEndpoint.replace(/\/+$/, '');
  return eventId
    ? `${base}/events/${encodeURIComponent(String(eventId))}/feedback`
    : `${base}/feedback`;
}

export async function sendFeedback(
  ctx: FeedbackContext,
  payload: FeedbackPayload,
): Promise<{ ok: boolean; status: number }> {
  if (!payload?.message?.trim()) return { ok: false, status: 0 };
  const url = feedbackUrl(ctx.endpoint, payload.eventId);
  const body: Record<string, unknown> = {
    message: payload.message.trim(),
    name: payload.name?.trim() || undefined,
    email: payload.email?.trim() || undefined,
    url: payload.url ?? (typeof location !== 'undefined' ? location.href : undefined),
    app_version: ctx.appVersion,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pionne-Token': ctx.token,
      },
      body: JSON.stringify(body),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}
