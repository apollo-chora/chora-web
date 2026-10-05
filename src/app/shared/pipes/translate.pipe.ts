import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '../../core/services/translate.service';

@Pipe({ name: 'translate', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly translateService = inject(TranslateService);

  /**
   * Resolve an i18n key to its current-locale string. Optional `params`
   * substitute `{{ token }}` placeholders (e.g. `'x' | translate: { n: 3 }`).
   */
  transform(key: string, params?: Record<string, string | number>): string {
    return this.translateService.instant(key, params);
  }
}
