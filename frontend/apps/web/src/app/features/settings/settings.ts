import { Component, effect, inject, viewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

import { MatSidenavContainer } from '@angular/material/sidenav';

import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/app-state/auth.service';
import { SidenavCollapseService } from '../../core/app-state/sidenav-collapse.service';
import {
  StbButtonModule,
  StbDividerModule,
  StbIconModule,
  StbListModule,
  StbSidenavModule,
  StbTooltipModule,
} from '@portfolioai/ui';

/**
 * Settings shell — left sidenav (`MatSidenavContainer` + `MatSidenav` + `MatNavList`) hosting
 * the sub-routes, router-outlet on the right. Mirrors the global app shell layout so the visual
 * language stays consistent.
 *
 * The route is reachable by **any authenticated user** (`authGuard` only on `/settings`), so
 * this component reads `auth.isAdmin()` to gate the admin-only entries (ops-links,
 * configuration, prompts, access-control). The `adminGuard` sits on each admin sub-route as a
 * second line of defence — if a USER types the URL manually, the guard redirects to `/journal`.
 */
@Component({
  selector: 'app-settings',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    StbIconModule,
    StbButtonModule,
    StbSidenavModule,
    StbListModule,
    StbDividerModule,
    StbTooltipModule,
    TranslatePipe,
  ],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly auth = inject(AuthService);
  readonly sidenavCollapse = inject(SidenavCollapseService);

  // Same trick as `App` : trigger Material's content-margin recompute when `collapsed()`
  // changes, so the content panel reflows instead of staying offset by the original width.
  private readonly sidenavContainer = viewChild<MatSidenavContainer>('sidenavContainer');

  constructor() {
    effect(() => {
      this.sidenavCollapse.collapsed();
      queueMicrotask(() => this.sidenavContainer()?.updateContentMargins());
    });
  }
}
