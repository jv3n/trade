import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { StbConfirm, StbConfirmPick, StbConfirmVariant } from '@portfolioai/ui';
import { Observable } from 'rxjs';

export interface ConfirmOptions {
  /** Interpolation params shared by the three texts (`{ ticker }`, `{ term }`…). */
  params?: Record<string, unknown>;
  variant?: StbConfirmVariant;
  /** Material Symbols ligature, when the variant's own icon says the wrong thing. */
  icon?: string;
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
    return this.stbConfirm.open(this.texts(key, options));
  }

  /**
   * [ask] with an optional pick under the message (#764) — the key group also holds `choice`, its
   * label, and each of [choices] reads `<choicePrefix>.<value>`. Emits the pick on confirm, null
   * when « — » is left, or `{ confirmed: false }`.
   */
  choose(
    key: string,
    choices: readonly string[],
    choicePrefix: string,
    options: ConfirmOptions = {},
  ): Observable<StbConfirmPick> {
    return this.stbConfirm.choose({
      ...this.texts(key, options),
      choice: {
        label: this.translate.instant(`${key}.choice`),
        options: choices.map((value) => ({
          value,
          label: this.translate.instant(`${choicePrefix}.${value}`),
        })),
      },
    });
  }

  private texts(key: string, options: ConfirmOptions) {
    const t = (suffix: string) => this.translate.instant(`${key}.${suffix}`, options.params);
    return {
      title: t('title'),
      message: t('message'),
      confirmLabel: t('confirm'),
      cancelLabel: this.translate.instant('common.cancel'),
      variant: options.variant,
      icon: options.icon,
    };
  }
}
