/**
 * Screenshot on crash — the browser counterpart of `react-native-view-shot`.
 *
 * ## What this is NOT
 *
 * The browser has no way to photograph the screen. `getDisplayMedia()` exists but pops a
 * "share your screen" permission dialog, which is out of the question for crash reporting.
 * What we do instead is REDRAW the DOM into a canvas — a reconstruction, not a capture.
 * It is very close to what the user saw, with known blind spots:
 *
 * - **cross-origin iframes render blank** — a Stripe card field will be an empty box;
 * - images served without CORS headers are skipped;
 * - some CSS filters, `backdrop-filter` and canvas/WebGL content may differ.
 *
 * Say it plainly in your own docs: on the page that matters most — payment — the
 * reconstruction is the least faithful.
 *
 * ## Why the renderer is not bundled
 *
 * The SDK is ~7 KB gzipped and has no dependencies; a DOM-to-image renderer is an order of
 * magnitude bigger. So it is loaded ON DEMAND and only if the host installed it, or if the
 * host passes its own `screenshot()` function. Nobody pays for a feature they don't enable.
 *
 * ## Privacy — read this before turning it on
 *
 * A screenshot of a real page can contain names, addresses, an IBAN, an ID document. Sending
 * it to a monitoring backend turns error reporting into personal-data processing. Sensitive
 * fields are therefore masked BEFORE rendering, not blurred after: what is masked never
 * reaches the image. Defaults cover passwords and payment autocomplete fields; add your own
 * with `screenshotMask`, or mark elements with `data-pionne-mask`.
 */

/** Elements always masked, whatever the host configures. */
const ALWAYS_MASKED =
  '[data-pionne-mask],input[type="password"],[autocomplete*="cc-"],[autocomplete="one-time-code"]';

export interface ScreenshotOptions {
  /** JPEG quality, 0–1. Default 0.5 — legibility matters, fidelity does not. */
  quality?: number;
  /** Downscale so the widest side fits this. Default 1280. */
  maxWidth?: number;
  /** Extra CSS selector for elements to mask, on top of the built-in list. */
  mask?: string;
  /** Host-supplied renderer. When absent, `modern-screenshot` is loaded if installed. */
  render?: (node: HTMLElement, opts: { quality: number }) => Promise<string>;
}

/** Hide sensitive nodes, run `fn`, then restore them — even if `fn` throws. */
async function withMasked<T>(mask: string | undefined, fn: () => Promise<T>): Promise<T> {
  const selector = mask ? `${ALWAYS_MASKED},${mask}` : ALWAYS_MASKED;
  let nodes: HTMLElement[] = [];
  try {
    nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  } catch {
    // An invalid host selector must not cost us the screenshot — fall back to the built-ins.
    nodes = Array.from(document.querySelectorAll<HTMLElement>(ALWAYS_MASKED));
  }
  const previous = nodes.map((n) => n.style.visibility);
  nodes.forEach((n) => {
    n.style.visibility = 'hidden';
  });
  try {
    return await fn();
  } finally {
    // Restoring in `finally` is not a detail: a throw here would leave the user staring at
    // a page with invisible fields, and the monitoring would have broken the app it watches.
    nodes.forEach((n, i) => {
      n.style.visibility = previous[i] ?? '';
    });
  }
}

let rendererMissingWarned = false;

/** Resolve a renderer: the host's, else `modern-screenshot` if it happens to be installed. */
async function resolveRenderer(
  opts: ScreenshotOptions,
): Promise<ScreenshotOptions['render'] | null> {
  if (opts.render) return opts.render;
  try {
    // The specifier goes through a variable ON PURPOSE. A literal would make TypeScript
    // demand the types and bundlers resolve the package at build time — turning an
    // optional peer into a hard dependency for everyone, including hosts that never
    // enable screenshots. This keeps it truly optional.
    const specifier = 'modern-screenshot';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      domToJpeg?: (node: HTMLElement, o: Record<string, unknown>) => Promise<string>;
    };
    if (typeof mod.domToJpeg !== 'function') return null;
    return (node, o) => mod.domToJpeg!(node, { quality: o.quality });
  } catch {
    if (!rendererMissingWarned && typeof console !== 'undefined') {
      rendererMissingWarned = true;
      console.warn(
        '[Pionne] captureScreenshot is on but no renderer is available. ' +
          'Run `npm i modern-screenshot`, or pass your own `screenshot()` to init().',
      );
    }
    return null;
  }
}

/**
 * Produce a JPEG data URI of the current page, or `null` if it cannot be done.
 * Never throws, never rejects: a crash report must survive a failed screenshot.
 */
export async function captureScreenshot(
  opts: ScreenshotOptions = {},
): Promise<string | null> {
  if (typeof document === 'undefined' || !document.body) return null;
  const render = await resolveRenderer(opts);
  if (!render) return null;

  const quality = opts.quality ?? 0.5;
  try {
    const uri = await withMasked(opts.mask, () =>
      render(document.body, { quality }),
    );
    return typeof uri === 'string' && uri.startsWith('data:') ? uri : null;
  } catch {
    return null;
  }
}
