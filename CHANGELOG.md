# Changelog

## 0.3.3 — 2026-05-08

### Documentation

- README clarifié : nouveau bloc "Bundle ID pinning — N/A on Web" qui
  explique que la protection anti-vol-de-token par pinning du Bundle ID
  est mobile-only (iOS/Android/RN/Flutter), parce que sur le web le
  token est déjà extractible du JS livré au navigateur. Ne pas remplir
  ce champ sur un projet Web dans l'app mobile Pionne — sinon 403 sur
  100 % des events. Lien vers la doc complète. Aucun changement de code.

## 0.3.2 — 2026-05-08

### Documentation

- README enrichi : tableau des options complété avec `maxEventsPerSecond`,
  `releaseHealth` (qui n'étaient pas listés bien que disponibles dans le code).
  Nouveau bloc "Rate limit serveur" qui documente le cap 600 req/min/token
  côté API Pionne. Aucun changement de code SDK.

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
