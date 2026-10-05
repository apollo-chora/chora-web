import { Component, ChangeDetectionStrategy, input, output, signal } from '@angular/core';
import type { McqOption } from '../../../models/atom.models';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';

@Component({
  selector: 'chora-mcq-renderer',
  imports: [ChoraQuestionImageComponent],
  template: `
    <div class="mcq-renderer" data-testid="mcq-renderer">
      <p class="mcq-renderer__stem" data-testid="mcq-stem">{{ stem() }}</p>

      <!-- W8: author-generated question illustration (Mermaid diagram or scene),
           rendered when the published atom content carries image_url. -->
      @if (questionImageUrl(); as url) {
        <chora-question-image
          [src]="url"
          alt="Generated question illustration"
          testIdPrefix="mcq-question-image" />
      }

      <div class="mcq-renderer__options" role="radiogroup" aria-label="Answer options">
        @for (option of options(); track $index) {
          <button
            class="mcq-renderer__option"
            [class.mcq-renderer__option--selected]="selectedIndex() === $index"
            role="radio"
            [attr.aria-checked]="selectedIndex() === $index"
            [attr.data-testid]="'mcq-option-' + $index"
            (click)="selectOption(option, $index)">
            <span class="mcq-renderer__option-indicator" aria-hidden="true">
              {{ selectedIndex() === $index ? '●' : '○' }}
            </span>
            <span class="mcq-renderer__option-text">{{ option.text }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .mcq-renderer {
      display: flex;
      flex-direction: column;
      gap: var(--chora-space-md);

      &__stem {
        font-size: 18px;
        line-height: 1.6;
        color: var(--chora-color-text-primary);
        margin: 0;
      }

      &__options {
        display: flex;
        flex-direction: column;
        gap: var(--chora-space-sm);
      }

      &__option {
        display: flex;
        align-items: center;
        gap: var(--chora-space-sm);
        padding: var(--chora-space-md);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-md);
        background: var(--chora-color-surface-1);
        cursor: pointer;
        text-align: left;
        font-size: 15px;
        transition: border-color var(--chora-transition-fast), background-color var(--chora-transition-fast);

        &:hover { border-color: var(--chora-color-primary); background: rgba(25, 118, 210, 0.04); }
        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 2px; }

        &--selected {
          border-color: var(--chora-color-primary);
          background: rgba(25, 118, 210, 0.08);
        }
      }

      &__option-indicator {
        color: var(--chora-color-primary);
        font-size: 16px;
        flex-shrink: 0;
      }

      &__option-text { color: var(--chora-color-text-primary); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McqRendererComponent {
  content = input.required<Record<string, unknown>>();
  answerChange = output<Record<string, unknown>>();

  readonly selectedIndex = signal<number | null>(null);

  readonly stem = () =>
    (this.content()['stem'] as string) ?? (this.content()['question'] as string) ?? '';

  // W8: optional author-generated illustration for the question stem.
  // Read dynamically off the generic content payload (the published atom
  // revision content). Empty string → no image (default; the @if guard hides
  // the element). Populated once the atom save/publish path persists the
  // candidate's image_url (pending the re-home-on-save follow-up).
  readonly questionImageUrl = (): string =>
    (this.content()['image_url'] as string) ?? '';

  readonly options = (): McqOption[] => {
    const raw = (this.content()['options'] as Record<string, unknown>[]) ?? [];
    return raw.map((o, i) => ({
      id: typeof o['id'] === 'number' ? o['id'] : i,
      text: (o['text'] as string) ?? '',
    }));
  };

  selectOption(option: McqOption, index: number): void {
    this.selectedIndex.set(index);
    this.answerChange.emit({ selected_option: option.id });
  }
}
