import { HttpErrorResponse } from '@angular/common/http';

/** The row changed since this page read it — another tab wrote first. */
export function isStaleWrite(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.error?.code === 'STALE_WRITE';
}
