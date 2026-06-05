import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { WatchlistEntry, WatchlistRepository } from '../watchlist.repository';

@Injectable()
export class HttpWatchlistRepository extends WatchlistRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/watchlist';

  list(): Observable<WatchlistEntry[]> {
    return this.http.get<WatchlistEntry[]>(this.base);
  }

  add(symbol: string): Observable<WatchlistEntry> {
    return this.http.post<WatchlistEntry>(this.base, { symbol });
  }

  remove(symbol: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${encodeURIComponent(symbol)}`);
  }
}
