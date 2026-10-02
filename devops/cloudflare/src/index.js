/**
 * Proxies every request of the environment's public host to its Cloud Run service.
 *
 * Cloud Run answers 404 to a Host it doesn't know, so the request is re-addressed to the
 * `*.run.app` host. `X-Forwarded-Host` is sent but Cloud Run strips it : the app takes its public
 * URL from `APP_FRONTEND_URL` instead (`deploy.yml`).
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.hostname = env.ORIGIN_HOST;
    url.protocol = 'https:';
    url.port = '';

    const headers = new Headers(request.headers);
    headers.delete('Host');
    headers.set('X-Forwarded-Host', env.PUBLIC_HOST);
    headers.set('X-Forwarded-Proto', 'https');

    return fetch(url, {
      method: request.method,
      headers,
      body: request.body,
      // The OAuth flow needs its 302s to reach the browser, not to be followed here.
      redirect: 'manual',
    });
  },
};
