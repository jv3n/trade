import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { ScannerRun } from '../scanner.model';
import { ScannerRepository } from '../scanner.repository';

interface ScannerRunWireDto {
  tradingDate: string;
  startedAt: string;
  finishedAt: string | null;
  tickersScanned: number;
  gusFound: number;
  dtFound: number;
  error: string | null;
}

/** `GET /api/scanner/runs/latest` answers 204 — an empty body — before the first run. */
@Injectable()
export class HttpScannerRepository extends ScannerRepository {
  private readonly http = inject(HttpClient);

  latestRun(): Observable<ScannerRun | null> {
    return this.http.get<ScannerRunWireDto | null>('/api/scanner/runs/latest').pipe(
      map((w) =>
        w
          ? {
              ...w,
              tradingDate: parseISO(w.tradingDate),
              startedAt: parseISO(w.startedAt),
              finishedAt: w.finishedAt ? parseISO(w.finishedAt) : null,
            }
          : null,
      ),
    );
  }
}
