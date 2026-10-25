import { Observable } from 'rxjs';
import { ScannerRun } from './scanner.model';

/** Port — what ts-scanner reported of its runs (#763). The scanner pushes ; `trade` only reads. */
export abstract class ScannerRepository {
  /** The latest run — null before the scanner ever ran. */
  abstract latestRun(): Observable<ScannerRun | null>;
}
