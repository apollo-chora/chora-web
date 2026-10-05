import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'chora-short-answer-renderer',
  template: `
    <div class="short-answer-renderer" data-testid="short-answer-renderer">
      <p class="short-answer-renderer__stem" data-testid="short-answer-stem">{{ stem() }}</p>

      <label class="short-answer-renderer__field">
        <textarea
          class="short-answer-renderer__input"
          rows="3"
          [attr.maxlength]="maxLength()"
          [attr.aria-label]="'Your answer'"
          placeholder="Type your answer..."
          data-testid="short-answer-input"
          (input)="onInput($event)"></textarea>
        @if (maxLength()) {
          <span class="short-answer-renderer__counter" aria-live="polite">
            {{ charCount }} / {{ maxLength() }}
          </span>
        }
      </label>
    </div>
  `,
  styles: [`
    .short-answer-renderer {
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-md);

      &__stem {
        font-size: 18px;
        line-height: 1.6;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__field { display: flex; flex-direction: column; gap: var(--chora-space-xs); }

      &__input {
        padding: var(--chora-space-sm) var(--chora-space-md);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
        font-size: 15px;
        font-family: inherit;
        resize: vertical;
        background: var(--chora-color-surface-1);
        color: var(--chora-color-text-primary);

        &:focus { border-color: var(--chora-color-primary); outline: none; box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2); }
      }

      &__counter {
        font-size: 12px;
        color: var(--chora-color-text-disabled);
        align-self: flex-end;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShortAnswerRendererComponent {
  content = input.required<Record<string, unknown>>();
  answerChange = output<Record<string, unknown>>();

  charCount = 0;

  readonly stem = () =>
    (this.content()['stem'] as string) ?? (this.content()['question'] as string) ?? '';
  readonly maxLength = () => (this.content()['max_length'] as number | undefined) ?? null;

  onInput(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    this.charCount = text.length;
    this.answerChange.emit({ text });
  }
}
