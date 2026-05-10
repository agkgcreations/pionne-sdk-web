# Changelog

## 0.3.6 — 2026-05-10

### Fixed

- **Actionable error message on permanent ingest rejection.** `send()`
  now parses the JSON error envelope on 401/403/422, distinguishes
  the failure modes (Bundle ID mismatch / Token rejected / 422
  validation), and emits a `console.warn` (once per session, even in
  prod) that includes the `app_id` actually sent and the masked
  `expected_format` returned by the server. Resolves the silent
  rejection footgun where a misconfigured token or stale bundle
  pinning would drop events without any visible signal in the host
  page's console.

## 0.3.5 — 2026-05-09

### Documentation

- README clarifié : retire les valeurs internes précises sur les caps
  serveur (rate-limit en req/min et req/sec) et remplace par
  "rate-limit par token". Les caps réels restent appliqués côté infra
  mais ne sont plus surfacés sur npm. Aucun changement de code SDK.

## 0.3.4 — 2026-05-09

### Documentation

- README: new "Profiling — preview (coming soon)" section announcing
  the upcoming Web profiler (planned for ~v0.4.0, will use
  `Performance.profile()` with a `Performance.measure()` fallback).
  Mirrors the API just shipped on `@pionne/react-native@0.8.0`. Same
  backend endpoint (`POST /api/profiles`), same retention model
  (raw 7 d, aggregates 90 d). Devs can already POST samples directly
  if they want profiling today. No code change.

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
