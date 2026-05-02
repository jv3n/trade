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
  styleUrl: './import.scss',
})
export class Import {
  constructor(private router: Router) {}

  onImported() {
    this.router.navigate(['/suivi']);
  }
}
