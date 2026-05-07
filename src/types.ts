export type Level = 'fatal' | 'error' | 'warning' | 'info';

export type MechanismType = 'onerror' | 'onunhandledrejection' | 'manual';

export interface Mechanism {
  type: MechanismType;
  handled: boolean;
}

// =====================================================================
// CONTEXTS — same shape as the RN SDK so the API doesn't care which
// flavor of Pionne reported the event. Only fields available in the
// browser are filled in.
// =====================================================================

export interface BrowserContext {
  name?: string;
  version?: string;
  user_agent?: string;
  language?: string;
  online?: boolean;
}

export interface OsContext {
  name?: string;
  version?: string;
}

export interface DeviceContext {
  family?: string;
  type?: 'phone' | 'tablet' | 'desktop' | 'tv' | 'unknown';
  screen_width_pixels?: number;
  screen_height_pixels?: number;
  screen_density?: number;
  orientation?: 'portrait' | 'landscape';
  locale?: string;
  timezone?: string;
}

export interface AppContext {
  url?: string;
  referrer?: string;
  // First page hit for the current SPA session — useful when an error
  // happens after several client-side route changes.
  initial_url?: string;
}

export interface RuntimeContext {
  name?: string;
  version?: string;
  js_engine?: string;
}

export interface SdkContext {
  name: string;
  version: string;
}

export interface PionneContexts {
  browser?: BrowserContext;
  os?: OsContext;
  device?: DeviceContext;
  app?: AppContext;
  runtime?: RuntimeContext;
  sdk?: SdkContext;
}

// =====================================================================
// EVENT — must stay payload-compatible with the RN SDK / API.
// =====================================================================

export interface PionneEvent {
  exception_type: string;
  message?: string | null;
  stack?: string[];
  level?: Level;

  // Flat fields (kept for backward compat / quick filtering server-side).
  release?: string;
  environment?: string;
  app_version?: string;
  os_name?: string;
  os_version?: string;
  user_id_anon?: string;
  locale?: string;
  timezone?: string;

  contexts?: PionneContexts;
  mechanism?: Mechanism;
  breadcrumbs?: Array<Record<string, unknown>>;
  tags?: Record<string, string>;
}

// =====================================================================
// OPTIONS
// =====================================================================

export interface PionneOptions {
  /** Project token (starts with `pio_live_`). Required. */
  token: string;
  /** Override the ingest endpoint. Default: production Pionne. */
  endpoint?: string;
  /** App release / version (e.g. git SHA or semver). */
  release?: string;
  /** Environment label. Default: "development" on localhost, else "production". */
  environment?: string;
  /** Disable all reporting if false. Default: true. */
  enabled?: boolean;
  /** Auto-capture uncaught errors via window.onerror. Default: true. */
  captureUncaughtErrors?: boolean;
  /** Auto-capture unhandled promise rejections. Default: true. */
  captureUnhandledRejections?: boolean;
  /** Auto-detect browser + os + device + url context. Default: true. */
  autoContext?: boolean;
  /** Last hook before sending — return null to drop the event. */
  beforeSend?: (event: PionneEvent) => PionneEvent | null;
  /** Anonymous user id, included in every event. */
  userIdAnon?: string;
  /** Static tags merged into every event. */
  tags?: Record<string, string>;
  /** Maximum stack frames sent. Default: 50. */
  maxStackFrames?: number;
  /**
   * Release Health — open a session at init() and flip to crashed/errored
   * on uncaught errors. Used by the dashboard to compute crash-free user
   * rate per release. Default: true.
   */
  releaseHealth?: boolean;
  /**
   * Token-bucket rate limit on outgoing events (events per second).
   * Default: 10. Set to 0 to disable. Drops silently when exceeded —
   * protects against runaway loops and caps your monthly Pionne quota.
   */
  maxEventsPerSecond?: number;
}
