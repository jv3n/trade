import { Observable } from 'rxjs';
import { AppVersion } from './app-info.model';

/**
 * Port — the version of the running backend, shown at the bottom of the menu (#380). `null` when the
 * build carries none (run from an IDE, without `build-info.properties`).
 */
export abstract class AppInfoRepository {
  abstract version(): Observable<AppVersion | null>;
}
