import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { FillBlankRendererComponent } from './fill-blank-renderer.component';

/**
 * Unit spec for FillBlankRendererComponent.
 *
 * This is a pure presentational renderer with one required signal input
 * (`content`), one output (`answerChange`), two derived accessors (`stem`,
 * `blanks`) and a single user-interaction handler (`onInput`). It performs NO
 * HTTP, so there is no HttpTestingController traffic to drive — we exercise the
 * component directly via setInput + DOM events. The Translate pipe is not used
 * in this template, so all asserted strings are real data.
 */

function makeFixture(
  content: Record<string, unknown>,
): ComponentFixture<FillBlankRendererComponent> {
  const fixture = TestBed.createComponent(FillBlankRendererComponent);
  fixture.componentRef.setInput('content', content);
  fixture.detectChanges();
  return fixture;
}

/**
 * jsdom `input` event helper. The component reads `(event.target as
 * HTMLInputElement).value`, so we set the value on the real input element then
 * dispatch a bubbling 'input' event — exactly what the (input) binding wires.
 */
function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('FillBlankRendererComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [FillBlankRendererComponent],
      providers: [provideHttpClient()],
    });
  });

  describe('shell render', () => {
    it('creates the component', () => {
      const fixture = makeFixture({ stem: 'Hello' });
      expect(fixture.componentInstance).toBeTruthy();
    });

    it('renders the renderer root container', () => {
      const fixture = makeFixture({ stem: 'Hello' });
      const root = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-renderer"]',
      );
      expect(root).not.toBeNull();
    });

    it('renders the stem paragraph element', () => {
      const fixture = makeFixture({ stem: 'Hello' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-stem"]',
      );
      expect(stem).not.toBeNull();
      expect(stem?.tagName).toBe('P');
    });
  });

  describe('stem() accessor', () => {
    it('renders the explicit `stem` field when present', () => {
      const fixture = makeFixture({ stem: 'The capital of France is ___.' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-stem"]',
      );
      expect(stem?.textContent?.trim()).toContain('The capital of France is');
    });

    it('falls back to `question` when `stem` is absent', () => {
      const fixture = makeFixture({ question: 'Two plus two equals ___.' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-stem"]',
      );
      expect(stem?.textContent?.trim()).toContain('Two plus two equals');
    });

    it('prefers `stem` over `question` when both exist', () => {
      const fixture = makeFixture({
        stem: 'STEM-WINS',
        question: 'QUESTION-LOSES',
      });
      expect(fixture.componentInstance.stem()).toBe('STEM-WINS');
    });

    it('renders an empty stem when neither `stem` nor `question` is present', () => {
      const fixture = makeFixture({ foo: 'bar' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-stem"]',
      );
      expect(stem?.textContent?.trim()).toBe('');
      expect(fixture.componentInstance.stem()).toBe('');
    });
  });

  describe('blanks() accessor', () => {
    it('uses the explicit `blanks` array (renders one input per entry)', () => {
      const fixture = makeFixture({
        stem: 'Fill in ___ and ___ and ___.',
        blanks: ['', '', ''],
      });
      const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.fill-blank-renderer__input',
      );
      expect(inputs.length).toBe(3);
      expect(fixture.componentInstance.blanks().length).toBe(3);
    });

    it('falls back to a single blank when an `answer` field is present', () => {
      const fixture = makeFixture({ stem: 'Q?', answer: 'Newton' });
      const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.fill-blank-renderer__input',
      );
      expect(inputs.length).toBe(1);
      expect(fixture.componentInstance.blanks()).toEqual(['']);
    });

    it('falls back to a single blank when neither `blanks` nor `answer` is present', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.fill-blank-renderer__input',
      );
      expect(inputs.length).toBe(1);
      expect(fixture.componentInstance.blanks()).toEqual(['']);
    });

    it('falls back to a single blank when `blanks` is an empty array', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [] });
      const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.fill-blank-renderer__input',
      );
      expect(inputs.length).toBe(1);
      expect(fixture.componentInstance.blanks()).toEqual(['']);
    });
  });

  describe('input field rendering', () => {
    it('renders the numbered "Blank N" label per field', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: ['', ''] });
      const labels = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.fill-blank-renderer__label',
      );
      expect(labels.length).toBe(2);
      expect(labels[0].textContent?.trim()).toBe('Blank 1');
      expect(labels[1].textContent?.trim()).toBe('Blank 2');
    });

    it('assigns a per-index data-testid to each input', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: ['', ''] });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="fill-blank-input-0"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="fill-blank-input-1"]')).not.toBeNull();
    });

    it('sets the placeholder and aria-label on each input', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [''] });
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      expect(input.getAttribute('placeholder')).toBe('Type your answer...');
      expect(input.getAttribute('aria-label')).toBe('Answer for blank 1');
      expect(input.getAttribute('type')).toBe('text');
    });
  });

  describe('onInput() — answer emission', () => {
    it('emits the typed value for a single blank', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      typeInto(input, 'Paris');

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ answers: ['Paris'] });
    });

    it('emits the latest value when the same blank is edited twice', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      typeInto(input, 'Par');
      typeInto(input, 'Paris');

      expect(emitted.length).toBe(2);
      expect(emitted[1]).toEqual({ answers: ['Paris'] });
    });

    it('keeps independent values across multiple blanks', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: ['', ''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const el = fixture.nativeElement as HTMLElement;
      const first = el.querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      const second = el.querySelector(
        '[data-testid="fill-blank-input-1"]',
      ) as HTMLInputElement;

      typeInto(first, 'alpha');
      typeInto(second, 'beta');

      expect(emitted[emitted.length - 1]).toEqual({
        answers: ['alpha', 'beta'],
      });
    });

    it('pads skipped lower indices with empty strings when a later blank is filled first', () => {
      // Drive onInput directly to exercise the while-loop padding branch:
      // typing into index 2 before 0/1 should backfill answers[0] and [1].
      const fixture = makeFixture({ stem: 'Q?', blanks: ['', '', ''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const fakeEvent = {
        target: { value: 'gamma' } as unknown as HTMLInputElement,
      } as unknown as Event;
      fixture.componentInstance.onInput(2, fakeEvent);

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ answers: ['', '', 'gamma'] });
    });

    it('emits a fresh array copy (not a shared mutable reference) on each input', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      typeInto(input, 'one');
      typeInto(input, 'two');

      // Each emission carries its own array instance — earlier emission is not
      // retroactively mutated by the later one.
      expect(emitted[0]['answers']).not.toBe(emitted[1]['answers']);
      expect(emitted[0]).toEqual({ answers: ['one'] });
      expect(emitted[1]).toEqual({ answers: ['two'] });
    });

    it('emits an empty-string answer when the input is cleared', () => {
      const fixture = makeFixture({ stem: 'Q?', blanks: [''] });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="fill-blank-input-0"]',
      ) as HTMLInputElement;
      typeInto(input, 'x');
      typeInto(input, '');

      expect(emitted[emitted.length - 1]).toEqual({ answers: [''] });
    });
  });
});
