# @pionne/web

Error monitoring SDK for the browser — by [Pionne](https://pionne.agkgcreations.fr).

Auto-captures uncaught errors and unhandled promise rejections, ships rich client context (UA, OS, viewport, locale, URL), and survives page unloads via `navigator.sendBeacon`. ~3 KB gzipped, zero dependencies, no source maps required.

Works in any browser app — **plain JS, React, Vue, Svelte, Angular, Next.js, Astro, etc.**

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

## License

MIT
