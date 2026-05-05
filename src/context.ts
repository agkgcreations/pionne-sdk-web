import type { PionneContexts, PionneEvent } from './types';

const SDK_NAME = 'pionne.web';
const SDK_VERSION = '0.1.0';

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
  return {
    contexts: {
      app: {
        url: window.location.href,
        referrer: document.referrer || undefined,
        initial_url: initialUrl,
      },
      browser: {
        online: navigator.onLine,
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
    },
  };
}
