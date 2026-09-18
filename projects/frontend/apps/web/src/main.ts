import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import * as Sentry from '@sentry/browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

// GlitchTip / Sentry-compatible DSN — public by design (visible in browser DevTools on every
// request). Committing it to git is the standard Sentry pattern, the DSN identifies the project
// for event ingestion but doesn't authenticate anything. Rotation = update this constant + ship a
// new build ; quota lives in the GlitchTip project settings, not in the DSN.
//
// **Why `@sentry/browser` and not `@sentry/angular`** — `@sentry/angular@8.x` peer-deps cap at
// Angular 19 (we're on 21). The framework-agnostic `@sentry/browser` works on any frontend ;
// `app.config.ts` provides a thin custom `ErrorHandler` that forwards Angular's caught errors to
// `Sentry.captureException`, replicating the only piece of `@sentry/angular` we'd actually use
// (no routing traces, no HTTP interceptor — we run `tracesSampleRate: 0`).
const GLITCHTIP_DSN = 'https://08ffb135c4b94b60b7e143b37a1df8e9@app.glitchtip.com/23873';

// Skip Sentry init in dev so local errors don't ship to GlitchTip. `isDevMode()` returns true
// when Angular's `ngDevMode` flag is set (any non-production build), false in `ng build
// --configuration=production`. Bundle still includes the SDK — the tree-shaker keeps the import
// because we reference it in the conditional — ~30 KB gzipped trade-off accepted for v1.
if (!isDevMode()) {
  Sentry.init({
    dsn: GLITCHTIP_DSN,
    environment: 'prod',
    // 100% errors + 0% performance traces — same policy as backend (`application-prod.yml`).
    // Optimizes the GlitchTip free tier quota and avoids brûler 5K events/mo on noisy spans.
    tracesSampleRate: 0,
    // Don't auto-attach Cookie / Authorization / X-CSRF-TOKEN headers or IP to events. The
    // backend's `SentryUserContextFilter` already supplies userId UUID per request via MDC →
    // Sentry scope ; we don't need browser-side PII duplicating that.
    sendDefaultPii: false,
  });
}

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
