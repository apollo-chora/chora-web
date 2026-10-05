import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../../core/services/translate.service';

@Pipe({ name: 'localeNumber', pure: false, standalone: true })
export class LocaleNumberPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: number | null, options?: Intl.NumberFormatOptions): string {
    if (value === null || value === undefined) return '';

    const locale = this.translate.currentLang();
    return new Intl.NumberFormat(locale, options).format(value);
  }
}
