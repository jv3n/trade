# Cloudflare Workers

Every request of both environments goes through a Worker attached to its host as a *custom domain*
(the DNS record is the Worker itself). It re-addresses the request to the environment's Cloud Run
service — see [`../README.md`](../README.md) > How a request reaches the app.

| Env | Worker | Host | Origin |
|---|---|---|---|
| `prod` | `tickerstory-proxy` | `tickerstory.org` | `portfolioai-…run.app` |
| `staging` | `tickerstory-staging` | `staging.tickerstory.org` | `portfolioai-staging-…run.app` |

**This directory is the source of truth** : one script (`src/index.js`), the per-environment hosts
as vars in `wrangler.toml`. A change made in the Cloudflare dashboard is overwritten by the next
deploy from here.

## Deploying

```bash
cd devops/cloudflare
npm ci
npx wrangler login              # once, opens the browser
npm run check                   # bundles both envs into dist*/ without deploying
npm run deploy:staging          # staging first
npm run deploy:prod             # then production — every request of tickerstory.org goes through it
```

Check https://staging.tickerstory.org/actuator/health, then a login, before deploying production.
A new Cloud Run URL (a service re-created) is a change of `ORIGIN_HOST` here.
