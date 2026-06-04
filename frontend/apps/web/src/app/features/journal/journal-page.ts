import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Placeholder landing page for the v1.0 pivot — the trading journal feature itself is not built
 * yet (cf. `docs/projet/roadmap.md`). Renders a card explaining the current state so the user
 * lands on something coherent after the old routes were removed.
 *
 * Will be replaced with the actual journal table + add-trade flow in a future session.
 */
@Component({
  selector: 'app-journal-page',
  standalone: true,
  imports: [MatCardModule, MatIconModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="journal-placeholder">
      <mat-card appearance="outlined">
        <mat-card-header>
          <mat-icon mat-card-avatar>book</mat-icon>
          <mat-card-title>{{ 'journal.title' | translate }}</mat-card-title>
          <mat-card-subtitle>{{ 'journal.subtitle' | translate }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p>{{ 'journal.placeholderBody' | translate }}</p>
        </mat-card-content>
      </mat-card>
    </section>
  `,
  styles: [
    `
      .journal-placeholder {
        padding: 2rem;
        max-width: 720px;
        margin: 2rem auto;
      }

      mat-card-content p {
        margin: 0;
        line-height: 1.5;
      }
    `,
  ],
})
export class JournalPage {}
