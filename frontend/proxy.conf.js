// Dev-server proxy config for the Angular CLI. Routes /api/** to the Spring backend.
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

module.exports = {
  '/api': {
    target: `http://localhost:${backendPort}`,
    secure: false,
    changeOrigin: true,
  },
};
