import { Component, ChangeDetectionStrategy, inject, signal, ElementRef, HostListener } from '@angular/core';
import { TranslateService, LocaleInfo } from '../../../core/services/translate.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'chora-language-selector',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="language-selector" data-testid="language-selector">
      <button
        class="language-selector__trigger"
        [attr.aria-label]="'nav.language' | translate"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
        (click)="toggle()"
        (keydown.escape)="close()"
        data-testid="language-selector-trigger">
        {{ currentLocale().nativeName }}
      </button>
      @if (isOpen()) {
        <ul
          class="language-selector__dropdown"
          role="listbox"
          [attr.aria-label]="'nav.language' | translate"
          data-testid="language-selector-dropdown">
          @for (locale of availableLocales(); track locale.code) {
            <li
              role="option"
              [attr.aria-selected]="locale.code === currentLocale().code"
              (click)="selectLocale(locale)"
              (keydown.enter)="selectLocale(locale)"
              (keydown.escape)="close()"
              tabindex="0"
              class="language-selector__option"
              [class.language-selector__option--selected]="locale.code === currentLocale().code"
              [attr.data-testid]="'language-option-' + locale.code">
              {{ locale.nativeName }}
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        position: relative;
      }

      .language-selector {
        position: relative;

        &__trigger {
          display: flex;
          align-items: center;
          gap: var(--chora-space-xs, 4px);
          padding: var(--chora-space-xs, 4px) var(--chora-space-sm, 8px);
          background: transparent;
          border: 1px solid var(--chora-color-border, #ddd);
          border-radius: var(--chora-radius-sm, 4px);
          color: inherit;
          font: inherit;
          cursor: pointer;
          white-space: nowrap;

          &:hover {
            background: var(--chora-color-surface-1, #f5f5f5);
          }

          &:focus-visible {
            outline: 2px solid var(--chora-color-primary, #3b82f6);
            outline-offset: 2px;
          }
        }

        &__dropdown {
          position: absolute;
          bottom: 100%;
          inset-inline-start: 0;
          margin: 0;
          margin-bottom: var(--chora-space-xs, 4px);
          padding: var(--chora-space-xs, 4px) 0;
          list-style: none;
          background: var(--chora-color-surface-0, #fff);
          border: 1px solid var(--chora-color-border, #ddd);
          border-radius: var(--chora-radius-sm, 4px);
          box-shadow: 0 4px 12px rgb(0 0 0 / 0.15);
          min-width: 100%;
          z-index: 100;
        }

        &__option {
          padding: var(--chora-space-xs, 4px) var(--chora-space-sm, 8px);
          cursor: pointer;
          white-space: nowrap;

          &:hover,
          &:focus-visible {
            background: var(--chora-color-surface-1, #f5f5f5);
          }

          &:focus-visible {
            outline: 2px solid var(--chora-color-primary, #3b82f6);
            outline-offset: -2px;
          }

          &--selected {
            font-weight: 600;
          }
        }
      }
    `,
  ],
})
export class LanguageSelectorComponent {
  private readonly translate = inject(TranslateService);
  private readonly elementRef = inject(ElementRef);

  readonly isOpen = signal(false);
  readonly availableLocales = this.translate.availableLocales;
  readonly currentLocale = this.translate.currentLocale;

  toggle(): void {
    this.isOpen.update((v) => !v);
  }

  close(): void {
    this.isOpen.set(false);
  }

  async selectLocale(locale: LocaleInfo): Promise<void> {
    await this.translate.switchLanguage(locale.code);
    this.close();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (!this.elementRef.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
