# @pionne/web

Error monitoring SDK for the browser — by [Pionne](https://pionne.agkgcreations.fr).

Auto-captures uncaught errors and unhandled promise rejections, ships rich client context (UA, OS, viewport, locale, URL), and survives page unloads via `navigator.sendBeacon`. ~3 KB gzipped, zero dependencies, no source maps required.

Works in any browser app — **plain JS, React, Vue, Svelte, Angular, Next.js, Astro, etc.**

## 🎫 Get your token

Sign up, create projects, and watch your error feed from the **[web dashboard](https://app.pionne.agkgcreations.fr)** or the **Pionne mobile app**.

1. **Open the [web dashboard](https://app.pionne.agkgcreations.fr)** — or download the app:
   - 🍎 [App Store](https://apps.apple.com/app/id6766753270) *(coming soon)*
   - [<img src="https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png" alt="Get it on Google Play" height="40"/>](https://play.google.com/store/apps/details?id=fr.agkgcreations.pionne)
2. Create your account (30 days free, no card required)
3. **+ New project** → pick **Web** → copy the token displayed (`pio_live_…`)
4. Paste it into `Pionne.init({ token })` below

⚠️ The token is only shown **once** at project creation — store it in an env var (`VITE_PIONNE_TOKEN`, `NEXT_PUBLIC_PIONNE_TOKEN`, etc.) and never commit it.

## Install

```bash
npm install @pionne/web
```

## Usage

### React / Next.js / Vite

```ts
// main.tsx (or _app.tsx for Next, root.ts for Remix…)
import { Pionne } from '@pionne/web';

Pionne.init({
  token: 'pio_live_xxx',
  release: '1.0.0', // optional
  // environment auto-detected (localhost → development, else production)
});
```

That's it. JS errors and unhandled promise rejections are now reported automatically.

### Manual capture

```ts
try {
  doRiskyThing();
} catch (err) {
  Pionne.captureException(err, { tags: { feature: 'checkout' } });
}

Pionne.captureMessage('user reached empty state', { level: 'info' });
```

### User identity (anonymous)

```ts
Pionne.setUser('u_42'); // appears on every event afterward
Pionne.setUser(null);    // forget
```

### Tags

```ts
Pionne.setTags({ tier: 'pro', region: 'eu' });
```

### Screenshot on crash — opt-in

```bash
npm i modern-screenshot        # the renderer is NOT bundled
```

```ts
Pionne.init({
  token: 'pio_live_xxx',
  captureScreenshot: true,
  screenshotQuality: 0.5,          // default
  screenshotMask: '.my-invoice',   // extra selectors to hide
});
```

⚠️ **This is a reconstruction, not a photograph.** The browser cannot capture the screen —
`getDisplayMedia()` would prompt the user. The page is redrawn from the DOM, so
**cross-origin iframes come out blank**: a Stripe card field will be an empty box, on the
very page you most want to see. Canvas/WebGL and images served without CORS headers may
also be missing.

**Privacy.** A screenshot of a real page can hold a name, an address, an IBAN. Sensitive
fields are masked *before* rendering — passwords, `cc-*` autocomplete, and anything marked
`data-pionne-mask` — so masked content never reaches the image. Add your own selectors with
`screenshotMask`. Enabling this still means shipping user data to your backend: check your
privacy policy and retention.

The event is never held hostage: if the renderer is missing, fails, or takes longer than
1.2 s, the report is sent **without** the picture.

Prefer to bring your own renderer? Pass `screenshot(node, { quality })` returning a data URI.

### Opt-out

```ts
Pionne.setEnabled(false);
```

### Profiling — preview (coming soon)

Continuous-ish CPU profiling is **shipped on `@pionne/react-native@0.8.0`**
(Hermes sampler) and is on the roadmap for `@pionne/web` next. The browser
implementation will use `Performance.profile()` (Chrome only, behind a flag
in Firefox/Safari) and fall back to `Performance.measure()`-based manual
spans where the sampler isn't available.

The API will mirror RN exactly so you can reuse the same wrappers across
platforms:

```ts
// Coming in @pionne/web ~v0.4.0
await Pionne.profile('CheckoutFlow', async () => {
  await fetchCart();
  await submitOrder();
}, { route: '/checkout' });
```

Same backend (`POST /api/profiles`), same retention model (raw 7 d,
aggregates 90 d), same flame graph view in the mobile dashboard.

If you need profiling **today** in a browser, you can post your own samples
to the endpoint directly — the JSON shape is documented at
[pionne.agkgcreations.fr/profiling/intro](https://pionne.agkgcreations.fr/profiling/intro).

### Bundle ID pinning — N/A on Web

The "Bundle ID" anti-token-theft check on Pionne projects is **mobile only**
(iOS/Android/RN/Flutter). On the web, your token is shipped in the bundled
JS and trivially extractable from the browser — bundle pinning can't help.
The field is hidden in the mobile dashboard for Web projects; **don't set
it manually via the API** — the SDK does not send a top-level `app_id`,
so a non-null `bundle_id` would 403 every event. To limit abuse: regenerate
the token (24 h grace period) if you suspect a leak, and rely on the
per-token rate limit server-side. Use `tags` for
deployment/tenant differentiation. See the
[Bundle ID Pinning docs](https://pionne.agkgcreations.fr/security/bundle-id#backends-sans-bundle_id).

### Geography (opt-in)

Approximate visitor location (city, region, country) attached to every event.
Off by default for privacy — flip `sendGeography` to enable:

```ts
Pionne.init({
  token: 'pio_live_xxx',
  sendGeography: true,
});
```

Resolved once at startup via a free IP→geo lookup (`ipapi.co/json` by
default), with a 4 s timeout. If the lookup fails the SDK silently keeps
shipping events without geo. Override the endpoint via `geographyEndpoint`
if you have your own.

## Options

| Option                       | Type                       | Default                   |
| ---------------------------- | -------------------------- | ------------------------- |
| `token`                      | `string` (required)        | —                         |
| `endpoint`                   | `string`                   | Pionne production         |
| `release`                    | `string`                   | unset                     |
| `environment`                | `string`                   | localhost-detected        |
| `enabled`                    | `boolean`                  | `true`                    |
| `captureUncaughtErrors`      | `boolean`                  | `true`                    |
| `captureUnhandledRejections` | `boolean`                  | `true`                    |
| `autoContext`                | `boolean`                  | `true`                    |
| `userIdAnon`                 | `string`                   | unset                     |
| `tags`                       | `Record<string, string>`   | unset                     |
| `maxStackFrames`             | `number`                   | `50`                      |
| `beforeSend`                 | `(event) => event \| null` | unset (drop if `null`)    |
| `sendGeography`              | `boolean`                  | `false`                   |
| `geographyEndpoint`          | `string`                   | `https://ipapi.co/json/`  |
| `releaseHealth`              | `boolean`                  | `true`                    |
| `maxEventsPerSecond`         | `number`                   | `10`                      |

### Notes

- **`maxEventsPerSecond`** — token-bucket client. Au-delà, les events sont droppés silencieusement. Protège contre les `setInterval` qui throw en boucle. `0` désactive (déconseillé).
- **`releaseHealth`** — ouvre une session à `init()` pour calculer le crash-free user rate. Désactivable.
- **`sendGeography`** — opt-in : attache `contexts.geo` (city/region/country/country_code) résolu IP-side. Pas de geolocation API, pas de permission.

## Rate limit serveur

Indépendamment du `maxEventsPerSecond` client, l'API Pionne applique un rate-limit par token sur tous les endpoints publics. Au-delà → `HTTP 429` avec un header `Retry-After`. Empêche un token leaké de drainer ton quota mensuel. Voir [doc rate limits](https://pionne.agkgcreations.fr/security/rate-limits).

## License

MIT
