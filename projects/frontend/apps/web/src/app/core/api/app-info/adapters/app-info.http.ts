import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { parseISO } from 'date-fns';
import { Observable, map } from 'rxjs';
import { AppVersion } from '../app-info.model';
import { AppInfoRepository } from '../app-info.repository';

/**
 * The slice of `/actuator/info` read here : `environment` from the `info.*` properties, `build` from
 * `springBoot { buildInfo() }`, `git` from `gradle-git-properties` in `full` mode, where the commit
 * id is an object, not a string.
 */
interface ActuatorInfoWireDto {
  environment?: string;
  build?: { version?: string; time?: string };
  git?: { commit?: { id?: string | { abbrev?: string } } };
}

@Injectable()
export class HttpAppInfoRepository extends AppInfoRepository {
  private readonly http = inject(HttpClient);

  version(): Observable<AppVersion | null> {
    return this.http.get<ActuatorInfoWireDto>('/actuator/info').pipe(
      map((w) => {
        if (!w.build?.version) return null;
        const id = w.git?.commit?.id;
        return {
          version: w.build.version,
          commit: (typeof id === 'string' ? id.slice(0, 7) : id?.abbrev) ?? null,
          builtAt: w.build?.time ? parseISO(w.build.time) : null,
          environment: w.environment ?? null,
        };
      }),
    );
  }
}
