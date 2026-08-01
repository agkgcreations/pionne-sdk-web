import type { PionneContexts, PionneEvent } from './types';

/** Injected at build time from package.json (see tsup.config.ts) — never edit by hand. */
declare const __SDK_VERSION__: string;

const SDK_NAME = 'pionne.web';
// Was hard-coded to '0.1.0' and had drifted five releases behind: every event shipped a
// version that no longer existed, which quietly poisons any filtering by SDK version.
const SDK_VERSION = typeof __SDK_VERSION__ === 'string' ? __SDK_VERSION__ : '0.0.0-dev';

/**
 * Detect browser name + version from the user agent. Crude but enough to
 * filter events in the dashboard ("only crashes on Safari < 16").
 */
function detectBrowser(ua: string): { name?: string; version?: string } {
  const tests: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).+Safari/, 'Safari'],
    [/Safari\/([\d.]+)/, 'Safari'],
  ];
  for (const [re, name] of tests) {
    const m = ua.match(re);
    if (m) return { name, version: m[1] };
  }
  return {};
}

function detectOs(ua: string): { name?: string; version?: string } {
  if (/Windows NT ([\d.]+)/.test(ua)) {
    return { name: 'Windows', version: RegExp.$1 };
  }
  if (/Mac OS X ([\d_]+)/.test(ua)) {
    return { name: 'macOS', version: RegExp.$1.replace(/_/g, '.') };
  }
  if (/Android ([\d.]+)/.test(ua)) {
    return { name: 'Android', version: RegExp.$1 };
  }
  if (/iPhone OS ([\d_]+)/.test(ua) || /CPU OS ([\d_]+)/.test(ua)) {
    return { name: 'iOS', version: RegExp.$1.replace(/_/g, '.') };
  }
  if (/Linux/.test(ua)) {
    return { name: 'Linux' };
  }
  return {};
}

function detectDeviceType(ua: string): 'phone' | 'tablet' | 'desktop' {
  if (/iPad|tablet/i.test(ua)) return 'tablet';
  if (/Mobi|Android|iPhone/.test(ua)) return 'phone';
  return 'desktop';
}

let initialUrl: string | undefined;

/**
 * Snapshot taken once at SDK init — fields that don't change for the
 * lifetime of the SPA session (UA, screen size, locale, initial URL).
 */
export function gatherStaticContext(): Partial<PionneEvent> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      contexts: { sdk: { name: SDK_NAME, version: SDK_VERSION } },
    };
  }

  const ua = navigator.userAgent;
  const browser = detectBrowser(ua);
  const os = detectOs(ua);
  const language =
    (navigator.languages && navigator.languages[0]) || navigator.language;
  let timezone: string | undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // ignore
  }

  initialUrl ??= window.location.href;

  const contexts: PionneContexts = {
    sdk: { name: SDK_NAME, version: SDK_VERSION },
    browser: {
      name: browser.name,
      version: browser.version,
      user_agent: ua,
      language,
      online: navigator.onLine,
    },
    os: { name: os.name, version: os.version },
    device: {
      type: detectDeviceType(ua),
      screen_width_pixels: window.screen?.width,
      screen_height_pixels: window.screen?.height,
      screen_density: window.devicePixelRatio,
      orientation:
        window.screen?.width != null && window.screen?.height != null
          ? window.screen.width >= window.screen.height
            ? 'landscape'
            : 'portrait'
          : undefined,
      locale: language,
      timezone,
      // Both are coarse by design and absent on Safari/Firefox — but when they are
      // there, they separate "the app is slow" from "this machine has 2 GB and 2 cores".
      memory_gb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
      cpu_cores: navigator.hardwareConcurrency,
    },
    runtime: {
      name: 'browser',
      js_engine: 'v8/jsc/spidermonkey',
    },
  };

  return {
    os_name: os.name,
    os_version: os.version,
    locale: language,
    timezone,
    contexts,
  };
}

/**
 * Per-event dynamic bits that change over the SPA session — current URL,
 * referrer, online state, etc. Cheap to recompute on every send.
 */
export function gatherDynamicContext(): Partial<PionneEvent> {
  if (typeof window === 'undefined') return {};
  // Connection type lives behind a vendor-prefixed, non-standard object.
  const conn = (
    navigator as Navigator & {
      connection?: { effectiveType?: string };
      mozConnection?: { effectiveType?: string };
      webkitConnection?: { effectiveType?: string };
    }
  );
  const network =
    conn.connection?.effectiveType ??
    conn.mozConnection?.effectiveType ??
    conn.webkitConnection?.effectiveType;

  return {
    contexts: {
      app: {
        url: window.location.href,
        referrer: document.referrer || undefined,
        initial_url: initialUrl,
      },
      browser: {
        online: navigator.onLine,
        network_type: network,
      },
      // Recomputed per event, NOT snapshotted at init: the user resizes, rotates,
      // opens the devtools. A layout bug reproduces at the size the window had when
      // it broke — a value captured minutes earlier would send us hunting elsewhere.
      device: {
        viewport_width_pixels: window.innerWidth,
        viewport_height_pixels: window.innerHeight,
        orientation:
          window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
      },
    },
  };
}

/**
 * Deep-merge two `contexts` blocks so dynamic fields (URL) override static
 * snapshot fields without dropping browser/device/os/sdk metadata.
 */
export function mergeContexts(
  base: Partial<PionneEvent>,
  extra: Partial<PionneEvent>,
): Partial<PionneEvent> {
  return {
    ...base,
    ...extra,
    contexts: {
      ...(base.contexts ?? {}),
      ...(extra.contexts ?? {}),
      browser: {
        ...(base.contexts?.browser ?? {}),
        ...(extra.contexts?.browser ?? {}),
      },
      app: {
        ...(base.contexts?.app ?? {}),
        ...(extra.contexts?.app ?? {}),
      },
      // `device` must be merged too, not replaced: the static snapshot holds the screen,
      // type and locale, the dynamic one holds the viewport. A plain spread of
      // `extra.contexts` would silently drop half of it — the half you look at first.
      device: {
        ...(base.contexts?.device ?? {}),
        ...(extra.contexts?.device ?? {}),
      },
    },
  };
}

// =====================================================================
// USER-AGENT CLIENT HINTS
// =====================================================================

/** Shape of the bits of `navigator.userAgentData` we use (not in lib.dom yet). */
interface UADataValues {
  platformVersion?: string;
  uaFullVersion?: string;
  architecture?: string;
  model?: string;
}
interface NavigatorUAData {
  getHighEntropyValues?(hints: string[]): Promise<UADataValues>;
}

/**
 * Ask the browser for what the User-Agent string no longer tells.
 *
 * The UA has been frozen for years: every macOS since Catalina reports `10_15_7`, and
 * Windows 10 and 11 both report `10.0`. So "os.version" read from the UA is, at best,
 * a decade-old constant — you cannot tell whether a bug only hits Windows 11, which is
 * exactly the question you ask when one user out of ten is affected. Chromium exposes
 * the real values through Client Hints, asynchronously and only on request.
 *
 * Best-effort by design: unsupported on Safari and Firefox, may reject on a strict
 * permissions policy. Failure leaves the UA-derived values in place.
 */
export function resolveClientHints(): Promise<Partial<PionneContexts>> {
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData })
    .userAgentData;
  if (!uaData?.getHighEntropyValues) return Promise.resolve({});
  return uaData
    .getHighEntropyValues([
      'platformVersion',
      'uaFullVersion',
      'architecture',
      'model',
    ])
    .then((v) => {
      const patch: Partial<PionneContexts> = {};
      if (v.platformVersion) patch.os = { version: v.platformVersion };
      if (v.uaFullVersion) patch.browser = { full_version: v.uaFullVersion };
      if (v.architecture || v.model) {
        patch.device = { architecture: v.architecture, model: v.model || undefined };
      }
      return patch;
    })
    .catch(() => ({}));
}
