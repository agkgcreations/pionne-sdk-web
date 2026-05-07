// Release Health for the browser. Mirrors the React Native SDK behaviour:
// open a session at init() with status='ok', flip to 'crashed'/'errored'
// from the error handlers. We send via sendBeacon when available so the
// flip survives an immediate page unload (the most likely "crash" on web).

export type SessionStatus = 'ok' | 'crashed' | 'errored' | 'abnormal' | 'exited';

export interface SessionContext {
  endpoint: string;
  token: string;
  release?: string;
  environment?: string;
  appVersion?: string;
  osName?: string;
  userIdAnon?: string;
}

interface SessionState {
  id: string;
  startedAt: number;
  status: SessionStatus;
  ctx: SessionContext;
}

let current: SessionState | null = null;

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — same RFC4122 v4 layout.
  const hex = (n: number) => n.toString(16).padStart(2, '0');
  const bytes = new Array(16).fill(0).map(() => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.map(hex).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function sessionsUrl(ingestEndpoint: string): string {
  if (ingestEndpoint.endsWith('/ingest')) {
    return ingestEndpoint.slice(0, -'/ingest'.length) + '/sessions';
  }
  return ingestEndpoint.replace(/\/+$/, '') + '/sessions';
}

function postSession(state: SessionState, status: SessionStatus, durationMs?: number): void {
  const url = sessionsUrl(state.ctx.endpoint);
  const body = {
    session_id: state.id,
    status,
    release: state.ctx.release,
    environment: state.ctx.environment,
    app_version: state.ctx.appVersion,
    os_name: state.ctx.osName,
    user_id_anon: state.ctx.userIdAnon,
    duration_ms: durationMs,
  };
  for (const k of Object.keys(body) as (keyof typeof body)[]) {
    if (body[k] === undefined) delete body[k];
  }
  const json = JSON.stringify(body);

  // sendBeacon survives page unload — critical for the 'exited' flip on
  // beforeunload. Token has to be in the URL since beacon can't set headers.
  if (
    status !== 'ok' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function'
  ) {
    const beaconUrl = `${url}?token=${encodeURIComponent(state.ctx.token)}`;
    try {
      const blob = new Blob([json], { type: 'application/json' });
      navigator.sendBeacon(beaconUrl, blob);
      return;
    } catch {
      // fall through to fetch
    }
  }

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pionne-Token': state.ctx.token,
    },
    body: json,
    keepalive: true,
  }).catch(() => undefined);
}

export function startSession(ctx: SessionContext): string {
  current = { id: uuid(), startedAt: Date.now(), status: 'ok', ctx };
  postSession(current, 'ok');

  // Best-effort 'exited' on tab close. We use pagehide rather than
  // beforeunload because Safari/iOS doesn't always fire beforeunload.
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const onLeave = () => {
      if (!current || current.status !== 'ok') return;
      flipSession('exited');
    };
    window.addEventListener('pagehide', onLeave, { once: true });
  }

  return current.id;
}

export function flipSession(status: SessionStatus): void {
  if (!current) return;
  const rank: Record<SessionStatus, number> =
    { ok: 0, exited: 1, errored: 2, abnormal: 3, crashed: 4 };
  if (rank[status] <= rank[current.status]) return;
  current.status = status;
  postSession(current, status, Date.now() - current.startedAt);
}

export function endSession(status: SessionStatus = 'exited'): void {
  if (!current) return;
  flipSession(status);
  current = null;
}

export function getCurrentSessionId(): string | null {
  return current?.id ?? null;
}

export function flipFromEvent(level: 'fatal' | 'error' | 'warning' | 'info' | undefined, mechanismType: string): void {
  if (mechanismType === 'manual') return;
  if (level === 'fatal') flipSession('crashed');
  else if (level === 'error') flipSession('errored');
}
