import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'chora-fill-blank-renderer',
  template: `
    <div class="fill-blank-renderer" data-testid="fill-blank-renderer">
      <p class="fill-blank-renderer__stem" data-testid="fill-blank-stem">{{ stem() }}</p>

      <div class="fill-blank-renderer__inputs">
        @for (blank of blanks(); track $index) {
          <label class="fill-blank-renderer__field">
            <span class="fill-blank-renderer__label">Blank {{ $index + 1 }}</span>
            <input
              type="text"
              class="fill-blank-renderer__input"
              [attr.placeholder]="'Type your answer...'"
              [attr.data-testid]="'fill-blank-input-' + $index"
              [attr.aria-label]="'Answer for blank ' + ($index + 1)"
              (input)="onInput($index, $event)" />
          </label>
        }
      </div>
    </div>
  `,
  styles: [`
    .fill-blank-renderer {
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-md);

      &__stem {
        font-size: 18px;
        line-height: 1.6;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__inputs { display: flex; flex-direction: column; gap: var(--chora-space-sm); }

      &__field { display: flex; flex-direction: column; gap: var(--chora-space-xs); }

      &__label {
        font-size: 12px;
        font-weight: 500;
        color: var(--chora-color-text-secondary);
        text-transform: uppercase;
      }

      &__input {
        padding: var(--chora-space-sm) var(--chora-space-md);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
        font-size: 15px;
        background: var(--chora-color-surface-1);
        color: var(--chora-color-text-primary);

        &:focus { border-color: var(--chora-color-primary); outline: none; box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2); }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FillBlankRendererComponent {
  content = input.required<Record<string, unknown>>();
  answerChange = output<Record<string, unknown>>();

  private answers: string[] = [];

  readonly stem = () =>
    (this.content()['stem'] as string) ?? (this.content()['question'] as string) ?? '';

  readonly blanks = (): string[] => {
    const explicit = this.content()['blanks'] as string[] | undefined;
    if (explicit && explicit.length > 0) return explicit;
    // Fallback: if content has a single 'answer' field, create one blank
    if (this.content()['answer'] !== undefined) return [''];
    return [''];
  };

  onInput(index: number, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    while (this.answers.length <= index) this.answers.push('');
    this.answers[index] = value;
    this.answerChange.emit({ answers: [...this.answers] });
  }
}
