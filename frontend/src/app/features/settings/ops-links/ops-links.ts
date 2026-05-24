import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * One external link rendered in the ops-links page. `label` is the proper name of the
 * destination (typically left as-is across locales — « Cloud Run service » reads identically in
 * FR / EN ; we keep it in code, not i18n). `description` is a short prose sentence translated
 * via the i18n key, optional. `url` is the full external URL.
 */
interface OpsLink {
  label: string;
  url: string;
  /** Optional i18n key for a one-line description rendered under the link label. */
  descriptionKey?: string;
}

/**
 * One section of the ops-links page. `titleKey` and `descriptionKey` are i18n keys ;
 * `icon` is a Material Icons ligature.
 */
interface OpsLinkSection {
  titleKey: string;
  descriptionKey: string;
  icon: string;
  links: OpsLink[];
}

/**
 * Static catalog of external ops dashboards, billing pages, and admin consoles. Seeded from
 * `docs/devops/liens-utiles.md` (2026-05-24) and enriched with billing pages that the doc was
 * sparse on. Account / project IDs are embedded in the URLs — all of them are public-by-design
 * identifiers (they appear in any Cloudflare / GCP dashboard URL once logged in, they don't
 * give access without the matching credentials). Keeping the page ADMIN-only is the layer that
 * prevents a USER from harvesting the surface map of our infra.
 *
 * **No backend, no DB, no persistence.** Edit this constant when an infra change adds / removes
 * a destination ; the file lives alongside the component on purpose so a PR touching prod infra
 * lands the link addition in the same diff.
 */
const OPS_LINKS_SECTIONS: OpsLinkSection[] = [
  // **Billing first** by user request 2026-05-24 — regroupe toutes les pages où une carte est
  // sur fichier, pour qu'un check facturation hebdomadaire se fasse en un coup d'œil sans
  // naviguer entre les sections par provider. Les autres sections (Hosting / Database / CDN /
  // External APIs) ne carrient PLUS leurs liens billing — un lien = un endroit, pas de
  // duplication qui drift.
  {
    titleKey: 'settings.opsLinksPage.sections.billing.title',
    descriptionKey: 'settings.opsLinksPage.sections.billing.description',
    icon: 'payments',
    links: [
      {
        label: 'GCP — billing account 0159AE-56FF40',
        url: 'https://console.cloud.google.com/billing/0159AE-56FF40-037FC8?project=trade-496613',
        descriptionKey: 'settings.opsLinksPage.links.gcpBilling',
      },
      {
        label: 'GCP — cost breakdown by service',
        url: 'https://console.cloud.google.com/billing/0159AE-56FF40-037FC8/reports;projects=trade-496613',
      },
      {
        label: 'Supabase — billing & quotas (org-scope)',
        url: 'https://supabase.com/dashboard/org/zkynfdstjexozrpldikc/billing',
        descriptionKey: 'settings.opsLinksPage.links.supabaseBilling',
      },
      {
        label: 'Cloudflare — billing (R2 + Registrar + Workers)',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/billing',
        descriptionKey: 'settings.opsLinksPage.links.cloudflareBilling',
      },
      {
        label: 'Anthropic — billing & usage',
        url: 'https://console.anthropic.com/settings/billing',
        descriptionKey: 'settings.opsLinksPage.links.anthropicBilling',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.production.title',
    descriptionKey: 'settings.opsLinksPage.sections.production.description',
    icon: 'public',
    links: [
      {
        label: 'tickerstory.org (prod app)',
        url: 'https://tickerstory.org',
        descriptionKey: 'settings.opsLinksPage.links.tickerstoryDomain',
      },
      {
        label: 'Cloud Run direct URL (debug fallback)',
        url: 'https://portfolioai-vybmfauwxq-nn.a.run.app',
        descriptionKey: 'settings.opsLinksPage.links.cloudRunDirect',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.hosting.title',
    descriptionKey: 'settings.opsLinksPage.sections.hosting.description',
    icon: 'cloud',
    links: [
      {
        label: 'GCP project dashboard',
        url: 'https://console.cloud.google.com/home/dashboard?project=trade-496613',
      },
      {
        label: 'Cloud Run service (portfolioai)',
        url: 'https://console.cloud.google.com/run/detail/northamerica-northeast1/portfolioai/metrics?project=trade-496613',
      },
      {
        label: 'Cloud Run logs',
        url: 'https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22?project=trade-496613',
      },
      {
        label: 'Artifact Registry (repo `backend`)',
        url: 'https://console.cloud.google.com/artifacts/docker/trade-496613/northamerica-northeast1/backend?project=trade-496613',
      },
      {
        label: 'Secret Manager (5 secrets runtime)',
        url: 'https://console.cloud.google.com/security/secret-manager?project=trade-496613',
      },
      {
        label: 'IAM & Service Accounts',
        url: 'https://console.cloud.google.com/iam-admin/serviceaccounts?project=trade-496613',
      },
      {
        label: 'OAuth 2.0 Client IDs',
        url: 'https://console.cloud.google.com/apis/credentials?project=trade-496613',
      },
      {
        label: 'API quotas',
        url: 'https://console.cloud.google.com/iam-admin/quotas?project=trade-496613',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.database.title',
    descriptionKey: 'settings.opsLinksPage.sections.database.description',
    icon: 'storage',
    links: [
      {
        label: 'Supabase project dashboard',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez',
      },
      {
        label: 'Supabase Table editor',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/editor',
      },
      {
        label: 'Supabase SQL editor',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/sql/new',
      },
      {
        label: 'Supabase Database settings (connection strings)',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/settings/database',
      },
      {
        label: 'Supabase Postgres logs',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/logs/explorer',
      },
      {
        label: 'Supabase native backups (7-day quotidiens, free tier)',
        url: 'https://supabase.com/dashboard/project/flbnnnakobutaxvshcez/database/backups',
        descriptionKey: 'settings.opsLinksPage.links.supabaseBackups',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.storage.title',
    descriptionKey: 'settings.opsLinksPage.sections.storage.description',
    icon: 'inventory_2',
    links: [
      {
        label: 'Cloudflare R2 bucket `portfolioai-backups`',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/r2/default/buckets/portfolioai-backups',
      },
      {
        label: 'Cloudflare R2 — API tokens (rotation)',
        url: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
      },
      {
        label: 'Cloudflare R2 — overview',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/r2/default/buckets',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.cdn.title',
    descriptionKey: 'settings.opsLinksPage.sections.cdn.description',
    icon: 'dns',
    links: [
      {
        label: 'Cloudflare registrar (`tickerstory.org`)',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/domains/registrations',
      },
      {
        label: 'Worker `tickerstory-proxy`',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/workers/services/view/tickerstory-proxy/production',
        descriptionKey: 'settings.opsLinksPage.links.cloudflareWorker',
      },
      {
        label: 'Cache Rules (zone `tickerstory.org`)',
        url: 'https://dash.cloudflare.com/8f2780696b5e520f85b5fc80413c4c3f/tickerstory.org/caching/cache-rules',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.observability.title',
    descriptionKey: 'settings.opsLinksPage.sections.observability.description',
    icon: 'monitoring',
    links: [
      {
        label: 'GlitchTip — backend issues',
        url: 'https://app.glitchtip.com/portfolioai/issues/?project=portfolioai-backend',
      },
      {
        label: 'GlitchTip — frontend issues',
        url: 'https://app.glitchtip.com/portfolioai/issues/?project=portfolioai-frontend',
      },
      {
        label: 'GlitchTip — organization (billing, members, alert rules)',
        url: 'https://app.glitchtip.com/portfolioai',
        descriptionKey: 'settings.opsLinksPage.links.glitchtipOrg',
      },
      {
        label: 'UptimeRobot dashboard',
        url: 'https://uptimerobot.com/dashboard',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.externalApis.title',
    descriptionKey: 'settings.opsLinksPage.sections.externalApis.description',
    icon: 'api',
    links: [
      {
        label: 'Anthropic Console (Claude API)',
        url: 'https://console.anthropic.com/',
        descriptionKey: 'settings.opsLinksPage.links.anthropicConsole',
      },
      {
        label: 'Anthropic — API keys (rotation)',
        url: 'https://console.anthropic.com/settings/keys',
      },
      {
        label: 'Twelve Data — API keys & credits (free 800/day)',
        url: 'https://twelvedata.com/account/api-keys',
      },
      {
        label: 'Finnhub — dashboard & rate limit',
        url: 'https://finnhub.io/dashboard',
      },
    ],
  },
  {
    titleKey: 'settings.opsLinksPage.sections.github.title',
    descriptionKey: 'settings.opsLinksPage.sections.github.description',
    icon: 'code',
    links: [
      {
        label: 'Repo `jv3n/trade`',
        url: 'https://github.com/jv3n/trade',
      },
      {
        label: 'Actions — all workflows',
        url: 'https://github.com/jv3n/trade/actions',
      },
      {
        label: 'Workflow — Deploy to Cloud Run',
        url: 'https://github.com/jv3n/trade/actions/workflows/deploy.yml',
      },
      {
        label: 'Workflow — Backup Supabase Postgres',
        url: 'https://github.com/jv3n/trade/actions/workflows/backup-postgres.yml',
      },
      {
        label: 'Settings → Environments (production)',
        url: 'https://github.com/jv3n/trade/settings/environments',
      },
      {
        label: 'Settings → Secrets and variables',
        url: 'https://github.com/jv3n/trade/settings/secrets/actions',
      },
      {
        label: 'Releases (deploy trigger via `release: published`)',
        url: 'https://github.com/jv3n/trade/releases',
      },
      {
        label: 'Code security (Secret scanning, Dependabot)',
        url: 'https://github.com/jv3n/trade/settings/security_analysis',
      },
    ],
  },
];

/**
 * `/settings/ops-links` — static page that centralises every external dashboard / billing /
 * admin console used to operate PortfolioAI. ADMIN-only (gated by `adminGuard` on the parent
 * `/settings` route — see `app.routes.ts:62`). Zero backend, zero state : just an iteration
 * over the [OPS_LINKS_SECTIONS] constant declared above.
 *
 * Every `<a>` opens in a new tab via `target="_blank" rel="noopener noreferrer"` — operational
 * UX expectation : you click a link from the app while debugging, you don't want to lose your
 * session ; you want the dashboard in a sibling tab. `noopener noreferrer` is the standard
 * security pair (prevents the destination from accessing `window.opener` and strips the
 * referer header).
 *
 * **Source de vérité** : seeded from `docs/devops/liens-utiles.md` (2026-05-24). When an infra
 * change adds / removes a destination, edit [OPS_LINKS_SECTIONS] in the same diff that changes
 * the infra ; the doc on the site can keep its own catalog or shrink to a pointer.
 */
@Component({
  selector: 'app-ops-links',
  imports: [MatIconModule, TranslatePipe],
  templateUrl: './ops-links.html',
  styleUrl: './ops-links.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpsLinksPage {
  readonly sections = OPS_LINKS_SECTIONS;
}
