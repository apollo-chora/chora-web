import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { FlashcardRendererComponent } from './flashcard-renderer.component';

/**
 * FlashcardRendererComponent is a pure presentational renderer used inside the
 * atom-player. It takes a `content` record (shape varies by atom type) and
 * exposes a flippable card. There is no HTTP, router, or timers, so the spec
 * drives it purely via the required input + DOM interaction.
 */

function makeFixture(
  content: Record<string, unknown>,
): {
  fixture: ComponentFixture<FlashcardRendererComponent>;
  element: HTMLElement;
  component: FlashcardRendererComponent;
} {
  const fixture = TestBed.createComponent(FlashcardRendererComponent);
  fixture.componentRef.setInput('content', content);
  fixture.detectChanges();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    component: fixture.componentInstance,
  };
}

describe('FlashcardRendererComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FlashcardRendererComponent],
      providers: [provideHttpClient()],
    });
  });

  describe('shell render', () => {
    it('creates the component', () => {
      const { component } = makeFixture({ front: 'Q', back: 'A' });
      expect(component).toBeTruthy();
    });

    it('renders the renderer root', () => {
      const { element } = makeFixture({ front: 'Q', back: 'A' });
      expect(
        element.querySelector('[data-testid="flashcard-renderer"]'),
      ).not.toBeNull();
    });

    it('renders the card as a button with the flip aria-label', () => {
      const { element } = makeFixture({ front: 'Q', back: 'A' });
      const card = element.querySelector(
        '[data-testid="flashcard-card"]',
      ) as HTMLButtonElement;
      expect(card).not.toBeNull();
      expect(card.tagName).toBe('BUTTON');
      expect(card.getAttribute('aria-label')).toBe('Flashcard. Press to flip.');
    });

    it('marks the back face aria-hidden', () => {
      const { element } = makeFixture({ front: 'Q', back: 'A' });
      const back = element.querySelector('.flashcard-renderer__face--back');
      expect(back?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('front() resolution', () => {
    it('prefers the "front" field', () => {
      const { component } = makeFixture({
        front: 'Front text',
        stem: 'Stem',
        question: 'Question',
        prompt: 'Prompt',
      });
      expect(component.front()).toBe('Front text');
    });

    it('falls back to "stem" when no front', () => {
      const { component } = makeFixture({
        stem: 'Stem text',
        question: 'Question',
        prompt: 'Prompt',
      });
      expect(component.front()).toBe('Stem text');
    });

    it('falls back to "question" when no front/stem', () => {
      const { component } = makeFixture({
        question: 'Question text',
        prompt: 'Prompt',
      });
      expect(component.front()).toBe('Question text');
    });

    it('falls back to "prompt" when no front/stem/question', () => {
      const { component } = makeFixture({ prompt: 'Prompt text' });
      expect(component.front()).toBe('Prompt text');
    });

    it('returns empty string when no recognised front field', () => {
      const { component } = makeFixture({ unrelated: 'x' });
      expect(component.front()).toBe('');
    });

    it('renders the resolved front text on the front face', () => {
      const { element } = makeFixture({ front: 'What is 2+2?' });
      const frontFace = element.querySelector(
        '.flashcard-renderer__face--front',
      );
      expect(frontFace?.textContent).toContain('What is 2+2?');
    });
  });

  describe('back() resolution', () => {
    it('returns the "back" field for plain flashcards', () => {
      const { component } = makeFixture({ front: 'Q', back: 'Answer text' });
      expect(component.back()).toBe('Answer text');
    });

    it('renders matching "pairs" as arrowed lines', () => {
      const { component } = makeFixture({
        front: 'Match',
        pairs: [
          { left: 'Dog', right: 'Bark' },
          { left: 'Cat', right: 'Meow' },
        ],
      });
      expect(component.back()).toBe('Dog → Bark\nCat → Meow');
    });

    it('renders ordering "items" joined by arrows', () => {
      const { component } = makeFixture({
        front: 'Order',
        items: ['First', 'Second', 'Third'],
      });
      expect(component.back()).toBe('First → Second → Third');
    });

    it('renders essay "rubric" with a Rubric: prefix', () => {
      const { component } = makeFixture({
        front: 'Essay',
        rubric: 'Clarity and depth',
      });
      expect(component.back()).toBe('Rubric: Clarity and depth');
    });

    it('returns empty string when no recognised back field', () => {
      const { component } = makeFixture({ front: 'Q' });
      expect(component.back()).toBe('');
    });

    it('prefers "back" over pairs/items/rubric', () => {
      const { component } = makeFixture({
        front: 'Q',
        back: 'Direct answer',
        pairs: [{ left: 'a', right: 'b' }],
        items: ['x'],
        rubric: 'r',
      });
      expect(component.back()).toBe('Direct answer');
    });

    it('prefers pairs over items + rubric when no back', () => {
      const { component } = makeFixture({
        front: 'Q',
        pairs: [{ left: 'a', right: 'b' }],
        items: ['x', 'y'],
        rubric: 'r',
      });
      expect(component.back()).toBe('a → b');
    });

    it('prefers items over rubric when no back/pairs', () => {
      const { component } = makeFixture({
        front: 'Q',
        items: ['x', 'y'],
        rubric: 'r',
      });
      expect(component.back()).toBe('x → y');
    });

    it('renders the resolved back text on the back face', () => {
      const { element } = makeFixture({ front: 'Q', back: 'Forty-two' });
      const backFace = element.querySelector(
        '.flashcard-renderer__face--back',
      );
      expect(backFace?.textContent).toContain('Forty-two');
    });
  });

  describe('flip interaction', () => {
    it('starts un-flipped', () => {
      const { component } = makeFixture({ front: 'Q', back: 'A' });
      expect(component.flipped()).toBe(false);
    });

    it('shows the "reveal" instruction before flipping', () => {
      const { element } = makeFixture({ front: 'Q', back: 'A' });
      const instruction = element.querySelector(
        '.flashcard-renderer__instruction',
      );
      expect(instruction?.textContent?.trim()).toBe('Tap to reveal answer');
    });

    it('does not apply the flipped class before flipping', () => {
      const { element } = makeFixture({ front: 'Q', back: 'A' });
      const card = element.querySelector('[data-testid="flashcard-card"]');
      expect(
        card?.classList.contains('flashcard-renderer__card--flipped'),
      ).toBe(false);
    });

    it('flip() toggles the flipped signal true', () => {
      const { component } = makeFixture({ front: 'Q', back: 'A' });
      component.flip();
      expect(component.flipped()).toBe(true);
    });

    it('flip() called twice toggles back to false', () => {
      const { component } = makeFixture({ front: 'Q', back: 'A' });
      component.flip();
      component.flip();
      expect(component.flipped()).toBe(false);
    });

    it('clicking the card flips it and applies the flipped class', () => {
      const { fixture, element } = makeFixture({ front: 'Q', back: 'A' });
      const card = element.querySelector(
        '[data-testid="flashcard-card"]',
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();
      expect(
        card.classList.contains('flashcard-renderer__card--flipped'),
      ).toBe(true);
    });

    it('shows the "Showing answer" instruction after flipping', () => {
      const { fixture, element } = makeFixture({ front: 'Q', back: 'A' });
      const card = element.querySelector(
        '[data-testid="flashcard-card"]',
      ) as HTMLButtonElement;
      card.click();
      fixture.detectChanges();
      const instruction = element.querySelector(
        '.flashcard-renderer__instruction',
      );
      expect(instruction?.textContent?.trim()).toBe('Showing answer');
    });

    it('flips on the Enter keydown handler', () => {
      const { fixture, element, component } = makeFixture({
        front: 'Q',
        back: 'A',
      });
      const card = element.querySelector(
        '[data-testid="flashcard-card"]',
      ) as HTMLButtonElement;
      card.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      fixture.detectChanges();
      expect(component.flipped()).toBe(true);
    });

    it('flips on the Space keydown handler', () => {
      const { fixture, element, component } = makeFixture({
        front: 'Q',
        back: 'A',
      });
      const card = element.querySelector(
        '[data-testid="flashcard-card"]',
      ) as HTMLButtonElement;
      card.dispatchEvent(
        new KeyboardEvent('keydown', { key: ' ', bubbles: true }),
      );
      fixture.detectChanges();
      expect(component.flipped()).toBe(true);
    });
  });
});
