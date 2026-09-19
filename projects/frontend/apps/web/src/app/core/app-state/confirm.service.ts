import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StbConfirm, StbConfirmVariant } from '@portfolioai/ui';
import { Observable } from 'rxjs';

export interface ConfirmOptions {
  /** Interpolation params shared by the three texts (`{ ticker }`, `{ term }`…). */
  params?: Record<string, unknown>;
  variant?: StbConfirmVariant;
}

/**
 * App-side entry point to the design-system confirmation modal ([StbConfirm]) : resolves the
 * texts from an i18n **key group** so call sites stay one line. `key` points at an object
 * holding `title`, `message` and `confirm` ; Cancel always reads `common.cancel`.
 *
 * ```ts
 * this.confirm
 *   .ask('journal.confirmDelete', { params: { ticker }, variant: 'danger' })
 *   .pipe(filter(Boolean), switchMap(() => this.repo.delete(id)))
 * ```
 *
 * Emits once : `true` on confirm, `false` on Cancel / Esc / backdrop.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly stbConfirm = inject(StbConfirm);
  private readonly translate = inject(TranslateService);

  ask(key: string, options: ConfirmOptions = {}): Observable<boolean> {
    const t = (suffix: string) => this.translate.instant(`${key}.${suffix}`, options.params);
    return this.stbConfirm.open({
      title: t('title'),
      message: t('message'),
      confirmLabel: t('confirm'),
      cancelLabel: this.translate.instant('common.cancel'),
      variant: options.variant,
    });
  }
}
