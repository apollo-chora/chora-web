import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';

@Component({
  selector: 'chora-flashcard-renderer',
  template: `
    <div class="flashcard-renderer" data-testid="flashcard-renderer">
      <button
        class="flashcard-renderer__card"
        [class.flashcard-renderer__card--flipped]="flipped()"
        (click)="flip()"
        (keydown.enter)="flip()"
        (keydown.space)="flip(); $event.preventDefault()"
        aria-label="Flashcard. Press to flip."
        data-testid="flashcard-card">
        <div class="flashcard-renderer__face flashcard-renderer__face--front">
          {{ front() }}
        </div>
        <div class="flashcard-renderer__face flashcard-renderer__face--back" aria-hidden="true">
          {{ back() }}
        </div>
      </button>
      <p class="flashcard-renderer__instruction">
        {{ flipped() ? 'Showing answer' : 'Tap to reveal answer' }}
      </p>
    </div>
  `,
  styles: [`
    .flashcard-renderer {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--chora-space-md);

      &__card {
        width: 100%;
        max-width: 500px;
        min-height: 200px;
        perspective: 1000px;
        border: none;
        background: none;
        cursor: pointer;
        position: relative;

        &:focus-visible { outline: 2px solid var(--chora-color-primary); outline-offset: 4px; border-radius: var(--chora-radius-lg); }
      }

      &__face {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--chora-space-xl);
        border: 2px solid var(--chora-color-border, #e0e0e0);
        border-radius: var(--chora-radius-lg);
        font-size: 18px;
        line-height: 1.6;
        text-align: center;
        min-height: 200px;
        transition: transform 0.4s ease;

        &--front {
          background: var(--chora-color-surface-1);
          color: var(--chora-color-text-primary);
        }

        &--back {
          display: none;
          background: rgba(25, 118, 210, 0.04);
          border-color: var(--chora-color-primary);
          color: var(--chora-color-primary);
        }
      }

      &__card--flipped {
        .flashcard-renderer__face--front { display: none; }
        .flashcard-renderer__face--back { display: flex; }
      }

      &__instruction {
        font-size: 13px;
        color: var(--chora-color-text-disabled);
        margin: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .flashcard-renderer__face { transition: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FlashcardRendererComponent {
  content = input.required<Record<string, unknown>>();

  readonly flipped = signal(false);
  readonly front = () =>
    (this.content()['front'] as string)
    ?? (this.content()['stem'] as string)
    ?? (this.content()['question'] as string)
    ?? (this.content()['prompt'] as string)
    ?? '';

  readonly back = () => {
    // For flashcards
    if (this.content()['back']) return this.content()['back'] as string;
    // For matching: show pairs
    const pairs = this.content()['pairs'] as { left: string; right: string }[] | undefined;
    if (pairs) return pairs.map(p => `${p.left} → ${p.right}`).join('\n');
    // For ordering: show items
    const items = this.content()['items'] as string[] | undefined;
    if (items) return items.join(' → ');
    // For essay: show rubric
    if (this.content()['rubric']) return `Rubric: ${this.content()['rubric'] as string}`;
    return '';
  };

  flip(): void {
    this.flipped.update((f) => !f);
  }
}
