import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NarrativeFeedbackRepository, PromptScore } from '../narrative-feedback.repository';

@Injectable()
export class HttpNarrativeFeedbackRepository extends NarrativeFeedbackRepository {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/narrative/snapshots';

  setThumbs(snapshotId: string, value: -1 | 0 | 1): Observable<PromptScore> {
    return this.http.patch<PromptScore>(`${this.base}/${encodeURIComponent(snapshotId)}/thumbs`, {
      value,
    });
  }
}
