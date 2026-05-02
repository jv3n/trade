import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { CsvImport } from '../dashboard/csv-import/csv-import';

@Component({
  selector: 'app-import',
  imports: [CsvImport],
  template: `
    <div class="import-page">
      <div class="import-header">
        <h2>Synchroniser depuis Wealthsimple</h2>
        <p>
          Importez votre export de positions CSV. Un portfolio sera créé ou mis à jour pour chaque
          compte, et un snapshot sera enregistré pour le suivi historique.
        </p>
      </div>
      <app-csv-import (imported)="onImported()" />
    </div>
  `,
  styles: [
    `
      .import-page {
        max-width: 760px;
        margin: 3rem auto;
        padding: 0 2rem;
      }
      .import-header {
        margin-bottom: 1.5rem;
        h2 {
          font-size: 1.4rem;
          font-weight: 700;
          margin: 0 0 0.4rem;
          color: #111827;
        }
        p {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }
      }
    `,
  ],
})
export class Import {
  constructor(private router: Router) {}

  onImported() {
    this.router.navigate(['/suivi']);
  }
}
