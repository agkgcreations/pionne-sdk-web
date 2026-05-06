# Changelog

## 0.2.0

Pionne backend got a major security hardening pass. The SDK API is unchanged
but now talks to a stricter, more observable server:

- **2FA TOTP** for the dashboard account.
- **Audit log** of every sensitive action (1-year retention, visible in app).
- **Anomaly detection** — auto-alerts on volume spikes vs 7-day baseline,
  auto-pauses on critical spikes (likely token leak).
- **Server-side PII scrub** — emails, JWTs and card numbers re-redacted on
  ingest as defense-in-depth.
- **Token grace period** — opt-in 24h overlap on regenerate for zero-downtime
  rotation.

## 0.1.2

- README: "Get your token" section pointing to the Pionne mobile app.

## 0.1.1

- Repository URL pointing to `agkgcreations/pionne-sdk-web`.

## 0.1.0

- Initial release.
- Auto-capture via `window.onerror` and `unhandledrejection`.
- `navigator.sendBeacon` for unload safety.
- Browser context (UA, OS, viewport, locale, URL).
- ~3 KB gzipped, zero dependencies.
