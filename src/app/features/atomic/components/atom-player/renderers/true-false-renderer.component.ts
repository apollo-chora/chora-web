import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';

@Component({
  selector: 'chora-true-false-renderer',
  template: `
    <div class="tf-renderer" data-testid="true-false-renderer">
      <p class="tf-renderer__stem" data-testid="tf-stem">{{ stem() }}</p>

      <div class="tf-renderer__options" role="radiogroup" aria-label="True or False">
        <button
          class="tf-renderer__card"
          [class.tf-renderer__card--selected]="selected() === true"
          role="radio"
          [attr.aria-checked]="selected() === true"
          data-testid="tf-true-btn"
          (click)="select(true)">
          True
        </button>
        <button
          class="tf-renderer__card"
          [class.tf-renderer__card--selected]="selected() === false"
          role="radio"
          [attr.aria-checked]="selected() === false"
          data-testid="tf-false-btn"
          (click)="select(false)">
          False
        </button>
      </div>
    </div>
  `,
  styles: [`
    .tf-renderer {
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-lg);

      &__stem {
        font-size: 18px;
        line-height: 1.6;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__options { display: flex; gap: var(--chora-space-md); justify-content: center; }

      &__card {
        flex: 1;
        max-width: 200px;
        padding: var(--chora-space-xl) var(--chora-space-lg);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-lg);
        background: var(--chora-color-surface-1);
        font-size: 20px;
        font-weight: 600;
        cursor: pointer;
        text-align: center;
        transition: border-color var(--chora-transition-fast), background-color var(--chora-transition-fast);

        &:hover { border-color: var(--chora-color-primary); }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }

        &--selected {
          border-color: var(--chora-color-primary);
          background: rgba(25, 118, 210, 0.08);
          color: var(--chora-color-primary);
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrueFalseRendererComponent {
  content = input.required<Record<string, unknown>>();
  answerChange = output<Record<string, unknown>>();

  readonly selected = signal<boolean | null>(null);
  readonly stem = () =>
    (this.content()['stem'] as string) ?? (this.content()['question'] as string) ?? (this.content()['statement'] as string) ?? '';

  select(value: boolean): void {
    this.selected.set(value);
    this.answerChange.emit({ value });
  }
}
