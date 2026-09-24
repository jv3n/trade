// Dev-server proxy : routes the backend's surface to the Spring app while the SPA is served by the
// Angular CLI on its own port.
//
// `/login/oauth2/**` is proxied but **not** the bare `/login` — that one is the SPA's own route and
// must fall through to index.html, or typing it in the address bar returns a Spring page instead of
// the app.

const fs = require('fs');
const path = require('path');

// Hand-rolled rather than pulling `dotenv` : the format is KEY=value with optional quotes.
function loadDotenv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const idx = line.indexOf('=');
    out[line.slice(0, idx).trim()] = line
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const dotenv = loadDotenv(path.join(__dirname, '..', '..', '..', '..', '.env'));
const backendPort = process.env.BACKEND_HOST_PORT || dotenv.BACKEND_HOST_PORT || '8080';

const backendProxy = {
  target: `http://localhost:${backendPort}`,
  secure: false,
  changeOrigin: true,
  // Tells Spring the browser is talking to the SPA's port, so the OAuth redirect URI and the
  // session cookie land on the SPA's origin. Without it, login succeeds and `/api/me` still
  // answers 401 — the cookie was scoped to the backend's port.
  xfwd: true,
};

module.exports = {
  '/api': backendProxy,
  '/actuator': backendProxy,
  '/oauth2': backendProxy,
  '/logout': backendProxy,
  '/login/oauth2': backendProxy,
};
