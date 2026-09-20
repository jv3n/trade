import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { StbIconModule } from '@portfolioai/ui';
import { AuthService } from '../../core/app-state/auth.service';

/**
 * Settings shell — a secondary menu **inside the page** (#200), not a second sidenav : the app's
 * own navigation stays where it is, so leaving settings is one click on the menu the user already
 * knows. Sections are routed (`/settings/<section>`) so each one is linkable and reloadable.
 *
 * The route is reachable by **any authenticated user** (`authGuard` only on `/settings`), so this
 * component reads `auth.isAdmin()` to hide the admin-only entries (access control, data, lexicon,
 * ops links). The `adminGuard` sits on each admin sub-route as a second line of defence — if a
 * USER types the URL manually, the guard redirects.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, StbIconModule, TranslatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly auth = inject(AuthService);
}
