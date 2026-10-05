import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../../core/services/translate.service';

@Pipe({ name: 'localeCurrency', pure: false, standalone: true })
export class LocaleCurrencyPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(value: number | null, currency = 'USD'): string {
    if (value === null || value === undefined) return '';

    const locale = this.translate.currentLang();
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  }
}
