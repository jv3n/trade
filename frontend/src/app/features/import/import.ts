import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { CsvImport } from '../dashboard/csv-import/csv-import';

@Component({
  selector: 'app-import',
  imports: [CsvImport, TranslatePipe],
  template: `
    <div class="import-page">
      <div class="import-header">
        <h2>{{ 'import.title' | translate }}</h2>
        <p>{{ 'import.intro' | translate }}</p>
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
