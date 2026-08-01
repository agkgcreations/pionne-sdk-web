import {
  gatherDynamicContext,
  gatherStaticContext,
  mergeContexts,
  resolveClientHints,
} from './context';
import { captureScreenshot } from './screenshot';
import {
  type FeedbackContext,
  type FeedbackPayload,
  sendFeedback as _sendFeedback,
} from './feedback';
import { RateLimiter, validateEndpoint, validateToken } from './security';
import {
  endSession as _endSession,
  flipFromEvent,
  getCurrentSessionId,
  startSession as _startSession,
} from './sessions';
import type {
  GeoContext,
  Level,
  Mechanism,
  MechanismType,
  PionneEvent,
  PionneOptions,
} from './types';

export type {
  FeedbackPayload,
  GeoContext,
  Level,
  Mechanism,
  MechanismType,
  PionneEvent,
  PionneOptions,
};

const DEFAULT_ENDPOINT = 'https://pionne.agkgcreations.fr/api/ingest';
const DEFAULT_GEO_ENDPOINT = 'https://ipapi.co/json/';
const DEFAULT_MAX_STACK = 50;

type ResolvedConfig = Required<
  Omit<
    PionneOptions,
    | 'beforeSend'
    | 'userIdAnon'
    | 'tags'
    | 'release'
    | 'releaseHealth'
    | 'maxEventsPerSecond'
    // Screenshot knobs stay optional: only `captureScreenshot` gets a default, the rest
    // are forwarded as-is so the screenshot module keeps ownership of its own defaults.
    | 'screenshotQuality'
    | 'screenshotMask'
    | 'screenshot'
  >
> & {
  beforeSend?: PionneOptions['beforeSend'];
  userIdAnon?: string;
  tags?: Record<string, string>;
  release?: string;
  screenshotQuality?: number;
  screenshotMask?: string;
  screenshot?: PionneOptions['screenshot'];
};

let config: ResolvedConfig | null = null;
let staticContext: Partial<PionneEvent> = {};
let onError: ((ev: ErrorEvent) => void) | null = null;
let onRejection: ((ev: PromiseRejectionEvent) => void) | null = null;
let rateLimiter: RateLimiter | null = null;
let droppedByRateLimit = 0;

function isLocalhost(): boolean {
  if (typeof location === 'undefined') return false;
  const h = location.hostname;
  return (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h.endsWith('.local')
  );
}

function parseStack(error: Error, max: number): string[] {
  if (!error.stack) return [];
  return error.stack
    .split('\n')
    .slice(0, max)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildEvent(
  err: unknown,
  level: Level,
  mechanism: MechanismType,
  handled: boolean,
  extra?: Partial<PionneEvent>,
): PionneEvent | null {
  if (!config || !config.enabled) return null;
  const e = err instanceof Error ? err : new Error(String(err));

  const dynamic = gatherDynamicContext();
  const merged = mergeContexts(staticContext, dynamic);

  const event: PionneEvent = {
    ...merged,
    // Sent on every event: the sibling SDKs fill this column (`react_native`, `process.platform`)
    // and browser events were the only ones landing without it. Placed before `...extra` so an
    // integration can still override it.
    platform: 'web',
    exception_type: e.name || 'Error',
    message: e.message || null,
    stack: parseStack(e, config.maxStackFrames),
    level,
    release: config.release,
    environment: config.environment,
    user_id_anon: config.userIdAnon,
    tags: config.tags,
    mechanism: { type: mechanism, handled },
    ...extra,
  };

  // `beforeSend` is NOT applied here — it runs in `send()`, once the screenshot is attached.
  // It is documented as the last hook before sending and is the natural place to scrub or
  // drop personal data; showing it an event without the picture would defeat that purpose.
  return event;
}

/** Hard ceiling on the screenshot: past this, the event leaves without a picture. */
const SCREENSHOT_TIMEOUT_MS = 1200;

/**
 * Attach a screenshot when asked, then ship. The event is NEVER held hostage by the
 * renderer: on failure, on timeout, or with no renderer installed, it goes out as-is.
 * A crash report that arrives without a picture beats a picture that never arrives.
 */
function send(event: PionneEvent): void {
  if (!config) return;
  if (config.captureScreenshot && !event.screenshot) {
    const shot = captureScreenshot({
      quality: config.screenshotQuality,
      mask: config.screenshotMask,
      render: config.screenshot,
    });
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), SCREENSHOT_TIMEOUT_MS),
    );
    Promise.race([shot, timeout])
      .then((uri) => {
        if (uri) event.screenshot = uri;
      })
      .catch(() => undefined)
      .then(() => shipFiltered(event));
    return;
  }
  shipFiltered(event);
}

/** Apply `beforeSend` — with the screenshot already attached — then ship, unless dropped. */
function shipFiltered(event: PionneEvent): void {
  if (!config) return;
  if (config.beforeSend) {
    let result: PionneEvent | null = null;
    try {
      result = config.beforeSend(event);
    } catch {
      // A throwing hook must not take the report down with it: send the event untouched.
      result = event;
    }
    if (!result) return;
    ship(result);
    return;
  }
  ship(event);
}

function ship(event: PionneEvent): void {
  if (!config) return;
  if (rateLimiter && !rateLimiter.allow()) {
    droppedByRateLimit++;
    if (isLocalhost() && droppedByRateLimit % 50 === 1 && typeof console !== 'undefined') {
      console.warn(`[Pionne] rate-limit reached (${droppedByRateLimit} events dropped). Bump maxEventsPerSecond if intentional.`);
    }
    return;
  }
  const body = JSON.stringify(event);
  // sendBeacon is more reliable when the page is unloading (e.g. crash on
  // navigation). Falls back to fetch with keepalive otherwise.
  if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' });
      // Beacon doesn't let us set custom headers; use ?token=… as a fallback
      // — the API accepts both `X-Pionne-Token` header AND query string.
      const url = `${config.endpoint}?token=${encodeURIComponent(config.token)}`;
      const ok = navigator.sendBeacon(url, blob);
      if (ok) return;
    } catch {
      // fall through to fetch
    }
  }
  if (typeof fetch === 'function') {
    fetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pionne-Token': config.token,
      },
      body,
      keepalive: true,
      mode: 'cors',
      credentials: 'omit',
    })
      .then(async (res) => {
        // 401/403/422 = permanent config issues that retries won't fix.
        // We surface them once per session, even in prod, so the dev sees
        // a misconfigured token / bundle / validation without having to
        // open the network tab.
        if (!res.ok && (res.status === 401 || res.status === 403 || res.status === 422)) {
          if (!warnedPermFailure) {
            warnedPermFailure = true;
            let raw = '';
            try { raw = await res.text(); } catch { /* ignore */ }
            type ErrorEnvelope = { message?: string; expected_format?: string };
            let parsed: ErrorEnvelope | null = null;
            try { parsed = JSON.parse(raw) as ErrorEnvelope; } catch { /* not JSON */ }
            const sentAppId = (event as { app_id?: string }).app_id ?? '<unset>';
            const serverMsg = parsed?.message ?? raw.slice(0, 200);
            if (typeof console !== 'undefined') {
              if (res.status === 403 && /bundle\s*id/i.test(serverMsg)) {
                console.warn(
                  `[Pionne] Bundle ID mismatch — your project rejects events from app_id="${sentAppId}". ` +
                  `Server expected "${parsed?.expected_format ?? 'unknown'}" (1st char masked for safety). ` +
                  `Fix it in your Pionne project Settings → Bundle ID, or clear the field to disable the check. ` +
                  `Subsequent rejections will be silent for this session.`,
                );
              } else if (res.status === 401) {
                console.warn(
                  `[Pionne] Token rejected (401). Check that the project token (starts with "pio_live_…") matches. ` +
                  `Server said: ${serverMsg}. Subsequent rejections will be silent for this session.`,
                );
              } else if (res.status === 422) {
                console.warn(
                  `[Pionne] Event rejected (422 validation): ${serverMsg}. ` +
                  `Sent app_id="${sentAppId}". Subsequent rejections will be silent for this session.`,
                );
              } else {
                console.warn(
                  `[Pionne] Event rejected (status=${res.status}): ${serverMsg}. ` +
                  `Sent app_id="${sentAppId}". Subsequent rejections will be silent for this session.`,
                );
              }
            }
          }
        }
      })
      .catch(() => {
        // Network errors stay silent — transient, not a config problem.
      });
  }
}

// Flag that gates the permanent-failure warning to one log per session.
// Reset on `Pionne.uninstall()` to allow re-warning after a re-init.
let warnedPermFailure = false;

/**
 * Fire-and-forget IP→geo lookup. Mutates `staticContext.contexts.geo` once it
 * resolves so subsequent events carry the location. Failures are silent — a
 * monitoring SDK must never crash or stall the host page.
 */
function fetchGeography(endpoint: string): void {
  if (typeof fetch !== 'function') return;
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), 4000)
    : null;
  fetch(endpoint, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: controller?.signal,
    credentials: 'omit',
    mode: 'cors',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      if (!data || typeof data !== 'object') return;
      const d = data as Record<string, unknown>;
      const geo: GeoContext = {};
      if (typeof d.city === 'string') geo.city = d.city;
      if (typeof d.region === 'string') geo.region = d.region;
      if (typeof d.country_name === 'string') geo.country = d.country_name;
      else if (typeof d.country === 'string') geo.country = d.country;
      if (typeof d.country_code === 'string') geo.country_code = d.country_code;
      if (Object.keys(geo).length === 0) return;
      const ctx = staticContext.contexts ?? {};
      staticContext.contexts = { ...ctx, geo };
    })
    .catch(() => {
      // Best-effort: silently ignore lookup failures.
    })
    .finally(() => {
      if (timeout) clearTimeout(timeout);
    });
}

function installUncaughtErrorHandler(): void {
  if (typeof window === 'undefined') return;
  onError = (ev: ErrorEvent) => {
    const err =
      ev.error instanceof Error
        ? ev.error
        : new Error(ev.message || 'Unknown error');
    const event = buildEvent(err, 'error', 'onerror', false);
    if (event) {
      send(event);
      flipFromEvent(event.level, event.mechanism?.type ?? 'onerror');
    }
  };
  window.addEventListener('error', onError);
}

function installRejectionHandler(): void {
  if (typeof window === 'undefined') return;
  onRejection = (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const err =
      reason instanceof Error ? reason : new Error(String(reason));
    const event = buildEvent(err, 'error', 'onunhandledrejection', false);
    if (event) {
      send(event);
      flipFromEvent(event.level, event.mechanism?.type ?? 'onunhandledrejection');
    }
  };
  window.addEventListener('unhandledrejection', onRejection);
}

export const Pionne = {
  /**
   * Initialise the SDK. Call this once, as early as possible — ideally
   * before your app code runs (e.g. top of `main.tsx` / `_app.tsx`).
   */
  init(options: PionneOptions): void {
    try {
      if (!options?.token || !validateToken(options.token)) {
        if (isLocalhost() && typeof console !== 'undefined') {
          console.warn('[Pionne] Missing or invalid token (expected pio_live_<≥16 chars>, no placeholders).');
        }
        return;
      }
      const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
      if (!validateEndpoint(endpoint, isLocalhost())) {
        if (typeof console !== 'undefined') {
          console.warn('[Pionne] Refusing non-HTTPS endpoint in production:', endpoint);
        }
        return;
      }
      const rps = options.maxEventsPerSecond ?? 10;
      rateLimiter = rps > 0 ? new RateLimiter(rps, rps) : null;

    const autoContext = options.autoContext ?? true;
    staticContext = autoContext ? gatherStaticContext() : {};

    // Client Hints resolve asynchronously — they refine the UA-derived guesses (real OS
    // version, full browser version, CPU architecture) as soon as the browser answers.
    // Events fired before that keep the UA values rather than waiting: a crash at boot is
    // the one you least want to delay. Same best-effort contract as the geo lookup.
    if (autoContext) {
      resolveClientHints()
        .then((patch) => {
          if (!patch || Object.keys(patch).length === 0) return;
          const ctx = staticContext.contexts ?? {};
          staticContext.contexts = {
            ...ctx,
            os: { ...(ctx.os ?? {}), ...(patch.os ?? {}) },
            browser: { ...(ctx.browser ?? {}), ...(patch.browser ?? {}) },
            device: { ...(ctx.device ?? {}), ...(patch.device ?? {}) },
          };
          // Flat mirror, kept in sync for server-side filtering.
          if (patch.os?.version) staticContext.os_version = patch.os.version;
        })
        .catch(() => {
          // Monitoring must never surface its own failures.
        });
    }

    // Built as a const first, then published to the module-level `config`: assigning and
    // reading a mutable binding across async closures is what cost the narrowing above.
    const cfg: ResolvedConfig = {
      token: options.token,
      endpoint: options.endpoint ?? DEFAULT_ENDPOINT,
      release: options.release,
      environment:
        options.environment ?? (isLocalhost() ? 'development' : 'production'),
      enabled: options.enabled ?? true,
      captureUncaughtErrors: options.captureUncaughtErrors ?? true,
      captureUnhandledRejections: options.captureUnhandledRejections ?? true,
      autoContext,
      beforeSend: options.beforeSend,
      userIdAnon: options.userIdAnon,
      tags: options.tags,
      maxStackFrames: options.maxStackFrames ?? DEFAULT_MAX_STACK,
      captureScreenshot: options.captureScreenshot ?? false,
      screenshotQuality: options.screenshotQuality,
      screenshotMask: options.screenshotMask,
      screenshot: options.screenshot,
      sendGeography: options.sendGeography ?? false,
      geographyEndpoint: options.geographyEndpoint ?? DEFAULT_GEO_ENDPOINT,
    };
    config = cfg;

    if (cfg.captureUncaughtErrors) installUncaughtErrorHandler();
    if (cfg.captureUnhandledRejections) installRejectionHandler();
    if (cfg.sendGeography) fetchGeography(cfg.geographyEndpoint);

    // Release Health — open a session unless the host opted out.
    if (options.releaseHealth !== false) {
      _startSession({
        endpoint: cfg.endpoint,
        token: cfg.token,
        release: cfg.release,
        environment: cfg.environment,
        appVersion: staticContext.app_version,
        osName: staticContext.os_name,
        userIdAnon: cfg.userIdAnon,
      });
    }
    } catch (e) {
      if (typeof console !== 'undefined') {
        console.warn('[Pionne] init failed silently — monitoring disabled.', e);
      }
      config = null;
    }
  },

  /**
   * Manually capture an exception. Safe to call before init() (no-op).
   */
  captureException(err: unknown, extra?: Partial<PionneEvent>): void {
    const event = buildEvent(
      err,
      extra?.level ?? 'error',
      'manual',
      true,
      extra,
    );
    if (event) send(event);
  },

  /**
   * Capture a string message (useful for non-error events).
   */
  captureMessage(message: string, extra?: Partial<PionneEvent>): void {
    const event = buildEvent(
      new Error(message),
      extra?.level ?? 'info',
      'manual',
      true,
      { exception_type: 'Message', ...extra },
    );
    if (event) send(event);
  },

  /**
   * Set / update the anonymous user id sent with every event.
   */
  setUser(userIdAnon: string | null): void {
    if (!config) return;
    config.userIdAnon = userIdAnon ?? undefined;
  },

  /**
   * Merge tags applied to every event. Pass null to clear.
   */
  setTags(tags: Record<string, string> | null): void {
    if (!config) return;
    config.tags = tags ?? undefined;
  },

  /**
   * Toggle reporting at runtime (e.g. after user opts out).
   */
  setEnabled(enabled: boolean): void {
    if (!config) return;
    config.enabled = enabled;
  },

  /**
   * Detach all auto handlers. Useful in tests / hot-reload scenarios.
   * The instance can be re-initialised by calling `init()` again.
   */
  uninstall(): void {
    if (typeof window !== 'undefined') {
      if (onError) window.removeEventListener('error', onError);
      if (onRejection) window.removeEventListener('unhandledrejection', onRejection);
    }
    onError = null;
    onRejection = null;
    config = null;
    staticContext = {};
    warnedPermFailure = false;
  },

  // ─── Release Health ───────────────────────────────────────────────────

  /** Manually end the current session (status='exited'). */
  endSession(): void {
    _endSession();
  },

  /** UUID of the current open session (for diagnostics). */
  getSessionId(): string | null {
    return getCurrentSessionId();
  },

  // ─── User Feedback ────────────────────────────────────────────────────

  /** Send feedback to /api/events/{id}/feedback (or /api/feedback). */
  async captureFeedback(payload: FeedbackPayload): Promise<{ ok: boolean; status: number }> {
    if (!config) return { ok: false, status: 0 };
    return _sendFeedback(
      {
        endpoint: config.endpoint,
        token: config.token,
        appVersion: staticContext.app_version,
      },
      payload,
    );
  },

  /** Returns the wired-up {endpoint, token} for power users rolling their own UI. */
  getFeedbackContext(): FeedbackContext | null {
    if (!config) return null;
    return {
      endpoint: config.endpoint,
      token: config.token,
      appVersion: staticContext.app_version,
    };
  },
};
