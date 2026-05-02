import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { SnapshotRepository, SnapshotSummary, SnapshotPosition } from '../snapshot.repository';

@Injectable()
export class HttpSnapshotRepository extends SnapshotRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/snapshots';

  getAll(): Observable<SnapshotSummary[]> {
    return this.http.get<SnapshotSummary[]>(this.base);
  }

  getPositions(snapshotId: string): Observable<SnapshotPosition[]> {
    return this.http.get<SnapshotPosition[]>(`${this.base}/${snapshotId}/positions`);
  }
}
