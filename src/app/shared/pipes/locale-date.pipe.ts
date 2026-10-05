import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../../core/services/translate.service';

@Pipe({ name: 'localeDate', pure: false, standalone: true })
export class LocaleDatePipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: string | Date | null, format: 'short' | 'medium' | 'long' = 'medium'): string {
    if (!value) return '';

    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';

    const locale = this.translate.currentLang();
    const options: Intl.DateTimeFormatOptions =
      format === 'short'
        ? { day: 'numeric', month: 'numeric', year: '2-digit' }
        : format === 'long'
          ? { day: 'numeric', month: 'long', year: 'numeric' }
          : { day: 'numeric', month: 'short', year: 'numeric' };

    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}
