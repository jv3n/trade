import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { StbTabsModule } from '@portfolioai/ui';

/**
 * « Rapports » (#685) : what the account and the stats already hold, read back — nothing is typed
 * here. One route per tab, so a tab is a link and « Back » returns to it : « Flux du compte » and
 * « Règles GUS » (#205).
 */
@Component({
  selector: 'app-reports-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, StbTabsModule, TranslatePipe],
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {}
