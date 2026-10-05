import { Component, ChangeDetectionStrategy, input, output } from '@angular/core';

@Component({
  selector: 'chora-code-renderer',
  template: `
    <div class="code-renderer" data-testid="code-renderer">
      <p class="code-renderer__stem" data-testid="code-stem">{{ stem() }}</p>

      @if (language()) {
        <span class="code-renderer__language-badge" data-testid="code-language">{{ language() }}</span>
      }

      <label class="code-renderer__field">
        <textarea
          class="code-renderer__editor"
          rows="10"
          spellcheck="false"
          autocomplete="off"
          [value]="starterCode()"
          [attr.aria-label]="'Code editor'"
          data-testid="code-editor"
          (input)="onInput($event)"></textarea>
      </label>
    </div>
  `,
  styles: [`
    .code-renderer {
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-md);

      &__stem {
        font-size: 18px;
        line-height: 1.6;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__language-badge {
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        padding: 2px 8px;
        border-radius: var(--chora-radius-full);
        background: var(--chora-color-surface-2);
        color: var(--chora-color-text-secondary);
        align-self: flex-start;
      }

      &__field { display: flex; flex-direction: column; }

      &__editor {
        padding: var(--chora-space-md);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
        font-family: 'JetBrains Mono', monospace;
        font-size: 14px;
        line-height: 1.5;
        resize: vertical;
        background: #1e1e1e;
        color: #d4d4d4;
        tab-size: 2;

        &:focus { border-color: var(--chora-color-primary); outline: none; box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.2); }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CodeRendererComponent {
  content = input.required<Record<string, unknown>>();
  answerChange = output<Record<string, unknown>>();

  readonly stem = () =>
    (this.content()['stem'] as string) ?? (this.content()['question'] as string) ?? '';
  readonly language = () => (this.content()['language'] as string) ?? '';
  readonly starterCode = () => (this.content()['starter_code'] as string) ?? '';

  onInput(event: Event): void {
    const code = (event.target as HTMLTextAreaElement).value;
    this.answerChange.emit({ code, language: this.language() });
  }
}
