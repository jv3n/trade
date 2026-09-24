import { LOCALE_ID, Pipe, PipeTransform, inject } from '@angular/core';

/**
 * The i18n key to read for [count] : `<key>One` where the locale's grammar takes the singular,
 * `<key>` otherwise. French puts 0 in the singular too (« 0 étape faite »), English doesn't — so a
 * `…One` value reads its number from the params, never from a literal `1`, unless its call site
 * only renders it from one up (« Passer le dernier » sits behind a `> 0` guard).
 */
export function pluralKey(key: string, count: number, locale: string): string {
  return new Intl.PluralRules(locale).select(count) === 'one' ? `${key}One` : key;
}

/** [pluralKey] in a template, ahead of `translate` : `'journal.kpi.trades' | plural: n | translate`. */
@Pipe({ name: 'plural' })
export class PluralPipe implements PipeTransform {
  private readonly locale = inject(LOCALE_ID);

  transform(key: string, count: number): string {
    return pluralKey(key, count, this.locale);
  }
}
