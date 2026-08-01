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
  /**
   * Full version, e.g. `120.0.6099.109`. Chromium freezes the UA version to the
   * major number, so `version` alone cannot tell a patched build from a broken one.
   * Filled from User-Agent Client Hints when the browser supports them.
   */
  full_version?: string;
  user_agent?: string;
  language?: string;
  online?: boolean;
  /** Effective connection type reported by the Network Information API: `4g`, `3g`… */
  network_type?: string;
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
  /**
   * Size of the WINDOW, not of the screen — and this is usually the one that matters.
   * A 27" iMac reports a 2560px screen while the tab may be 900px wide; a layout bug
   * reproduces at the viewport size, never at the screen size.
   */
  viewport_width_pixels?: number;
  viewport_height_pixels?: number;
  screen_density?: number;
  orientation?: 'portrait' | 'landscape';
  locale?: string;
  timezone?: string;
  /** CPU architecture (`x86`, `arm`) — from Client Hints. Tells Apple Silicon from Intel. */
  architecture?: string;
  /** Device model, mostly meaningful on Android — from Client Hints. */
  model?: string;
  /** `navigator.deviceMemory`, in GB. Coarse by design (0.25 → 8). */
  memory_gb?: number;
  /** `navigator.hardwareConcurrency` — logical cores. */
  cpu_cores?: number;
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

export interface GeoContext {
  city?: string;
  region?: string;
  country?: string;
  country_code?: string;
}

export interface PionneContexts {
  browser?: BrowserContext;
  os?: OsContext;
  device?: DeviceContext;
  app?: AppContext;
  runtime?: RuntimeContext;
  sdk?: SdkContext;
  geo?: GeoContext;
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
  /**
   * Emitting platform — always `'web'` from this SDK. Its siblings already send one
   * (`react_native` for @pionne/react-native, `process.platform` for @pionne/node), so
   * browser events were the only ones arriving with an empty platform column, impossible
   * to tell apart at a glance in the dashboard.
   */
  platform?: string;
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
  /** JPEG data URI of the page when it broke. Same field name as the RN SDK. */
  screenshot?: string;
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
   * Attach a picture of the page to each event. **Off by default, and deliberately so.**
   *
   * Unlike the RN SDK — which asks the OS for a real snapshot — the browser has no way to
   * photograph the screen. The page is REDRAWN from the DOM, so cross-origin iframes come
   * out blank: a Stripe card field will be an empty box, on the very page you most want to
   * see. The renderer is not bundled either; install `modern-screenshot` or pass your own
   * `screenshot()`.
   *
   * Privacy: a screenshot of a real page can hold a name, an address, an IBAN. Sensitive
   * fields are masked BEFORE rendering (passwords, `cc-*` autocomplete, `data-pionne-mask`),
   * so masked content never reaches the image — but enabling this still means shipping user
   * data to your backend. Decide accordingly.
   */
  captureScreenshot?: boolean;
  /** JPEG quality for the screenshot, 0–1. Default: 0.5. */
  screenshotQuality?: number;
  /** Extra CSS selector of elements to mask, on top of the built-in list. */
  screenshotMask?: string;
  /** Custom renderer, if you'd rather not install one. Must resolve to a data URI. */
  screenshot?: (
    node: HTMLElement,
    opts: { quality: number },
  ) => Promise<string>;
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
  /**
   * Opt-in: resolve approximate user geography (city, region, country) once at
   * startup via a free IP→location lookup, and attach it to every event under
   * `contexts.geo`. Off by default for privacy.
   */
  sendGeography?: boolean;
  /**
   * Override the IP→geography endpoint. Must return JSON with at least
   * `city`, `region`, `country` (or `country_name`), and `country_code`
   * fields. Default: https://ipapi.co/json/.
   */
  geographyEndpoint?: string;
}
