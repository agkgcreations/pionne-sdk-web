# @pionne/web

Error monitoring SDK for the browser — by [Pionne](https://pionne.agkgcreations.fr).

Auto-captures uncaught errors and unhandled promise rejections, ships rich client context (UA, OS, viewport, locale, URL), and survives page unloads via `navigator.sendBeacon`. ~3 KB gzipped, zero dependencies, no source maps required.

Works in any browser app — **plain JS, React, Vue, Svelte, Angular, Next.js, Astro, etc.**

## 🎫 Get your token

Pionne is **mobile-first**: you sign up, create projects, and watch your error feed **from the Pionne mobile app**, not a web dashboard.

1. **Download the app**:
   - 🍎 [App Store](https://apps.apple.com/app/pionne) *(coming soon)*
   - 🤖 [Google Play](https://play.google.com/store/apps/details?id=fr.agkgcreations.pionne) *(coming soon)*
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

### Opt-out

```ts
Pionne.setEnabled(false);
```

### Geography (opt-in)

Approximate visitor location (city, region, country) attached to every event,
just like Sentry. Off by default for privacy — flip `sendGeography` to enable:

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

## License

MIT
