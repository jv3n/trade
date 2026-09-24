import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { TranslatePipe } from '@ngx-translate/core';
import { StbIconModule } from '@portfolioai/ui';
import { catchError, of } from 'rxjs';
import { AppInfoRepository } from '../../core/api/app-info/app-info.repository';
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
 *
 * The menu ends on the **deployed version** (#380), for every role : what staging or production is
 * actually running, read from the backend. A failed call leaves the block out — it only informs.
 */
@Component({
  selector: 'app-settings',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, StbIconModule, TranslatePipe, DatePipe],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  readonly auth = inject(AuthService);

  readonly version = toSignal(
    inject(AppInfoRepository)
      .version()
      .pipe(catchError(() => of(null))),
    { initialValue: null },
  );
  /** The chip beside the version : production carries none, it is the normal case. */
  readonly environment = computed(() => {
    const env = this.version()?.environment;
    return env === 'local' || env === 'staging' ? env : null;
  });
}
