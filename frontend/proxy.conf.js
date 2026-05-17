// Dev-server proxy config for the Angular CLI. Routes /api/**, /oauth2/** and /login/** to the
// Spring backend.
//
// /api/**          — the REST surface consumed by the SPA
// /oauth2/**       — Spring Security's OAuth2 authorization endpoint (e.g.
//                    /oauth2/authorization/google triggers the redirect to Google)
// /logout          — Spring Security's POST logout handler
// /login/oauth2/** — Spring Security's OAuth2 callback endpoint (Google sends the auth code to
//                    /login/oauth2/code/google after the user consents)
//
// Important : we proxy /login/oauth2/** but **NOT** the bare /login — the latter is the SPA's
// own login route and must fall through to index.html for the Angular router to handle it.
// Proxying /login would catch a typed-in-address-bar /login and hand back a Spring response
// instead of the SPA shell, breaking the login page.
//
// The backend port is configurable via .env at the repo root (POSTGRES_HOST_PORT,
// BACKEND_HOST_PORT, etc. — cf. .env.example). This file mirrors the same .env-reading pattern
// used by the Tiltfile (Starlark load_env_file) and backend/build.gradle.kts (Kotlin DSL) so
// `npm start` Just Works whether you launch it under Tilt or directly. We hand-roll a tiny
// parser instead of pulling the `dotenv` npm package — the file format is dead-simple
// (KEY=value, optional surrounding quotes, # comments, no escapes).
//
// Resolution order : process.env.BACKEND_HOST_PORT (Tilt-injected wins) > .env file > 8080.

const fs = require('fs');
const path = require('path');

function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const dotenv = loadDotenv(path.join(__dirname, '..', '.env'));
const backendPort = process.env.BACKEND_HOST_PORT || dotenv.BACKEND_HOST_PORT || '8080';

const backendProxy = {
  target: `http://localhost:${backendPort}`,
  secure: false,
  changeOrigin: true,
  // `xfwd` ajoute les headers `X-Forwarded-Host` / `X-Forwarded-For` / `X-Forwarded-Proto` /
  // `X-Forwarded-Port` quand le proxy forward la requête vers le backend. Combiné avec
  // `server.forward-headers-strategy: framework` côté Spring (cf. `application.yml`), Spring
  // sait alors que le browser parle au SPA sur `localhost:4201` (et pas directement au backend
  // sur 8081). Conséquence : (a) le redirect URI envoyé à Google pendant l'OAuth dance pointe
  // vers `localhost:4201/login/oauth2/code/google` (pas 8081), donc le cookie de session que
  // Spring pose dans la réponse est scopé sur l'origin du SPA et est ré-envoyé sur les appels
  // `/api/me` suivants ; (b) les redirects `defaultSuccessUrl("/")` post-login atterrissent
  // naturellement sur l'origin du SPA. Sans `xfwd`, le SPA reçoit une 401 sur `/api/me` même
  // après login parce que le cookie est stocké sur `localhost:8081` et pas accessible à
  // `localhost:4201` (Chrome traite les ports différents comme des origines distinctes pour le
  // cookie storage host-only).
  xfwd: true,
};

module.exports = {
  '/api': backendProxy,
  '/oauth2': backendProxy,
  '/logout': backendProxy,
  '/login/oauth2': backendProxy,
};
