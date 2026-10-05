import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { McqRendererComponent } from './mcq-renderer.component';

/**
 * Unit spec for McqRendererComponent.
 *
 * A pure presentational renderer with one required signal input (`content`),
 * one output (`answerChange`), a `selectedIndex` signal, three derived
 * accessors (`stem`, `questionImageUrl`, `options`) and one user-interaction
 * handler (`selectOption`). It performs NO HTTP, so there is no
 * HttpTestingController traffic to drive — we exercise the component directly
 * via setInput + DOM events. The Translate pipe is not used in this template,
 * so all asserted strings are real data.
 */

function makeFixture(
  content: Record<string, unknown>,
): ComponentFixture<McqRendererComponent> {
  const fixture = TestBed.createComponent(McqRendererComponent);
  fixture.componentRef.setInput('content', content);
  fixture.detectChanges();
  return fixture;
}

describe('McqRendererComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [McqRendererComponent],
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
        '[data-testid="mcq-renderer"]',
      );
      expect(root).not.toBeNull();
    });

    it('renders the stem paragraph element', () => {
      const fixture = makeFixture({ stem: 'Hello' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-stem"]',
      );
      expect(stem).not.toBeNull();
      expect(stem?.tagName).toBe('P');
    });

    it('renders a radiogroup container for the options', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const group = (fixture.nativeElement as HTMLElement).querySelector(
        '.mcq-renderer__options',
      );
      expect(group?.getAttribute('role')).toBe('radiogroup');
      expect(group?.getAttribute('aria-label')).toBe('Answer options');
    });

    it('starts with selectedIndex null (no option selected)', () => {
      const fixture = makeFixture({ stem: 'Q?', options: [{ text: 'A' }] });
      expect(fixture.componentInstance.selectedIndex()).toBeNull();
    });
  });

  describe('stem() accessor', () => {
    it('renders the explicit `stem` field when present', () => {
      const fixture = makeFixture({ stem: 'What is the capital of France?' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-stem"]',
      );
      expect(stem?.textContent?.trim()).toContain('capital of France');
    });

    it('falls back to `question` when `stem` is absent', () => {
      const fixture = makeFixture({ question: 'Two plus two equals?' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-stem"]',
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
        '[data-testid="mcq-stem"]',
      );
      expect(stem?.textContent?.trim()).toBe('');
      expect(fixture.componentInstance.stem()).toBe('');
    });
  });

  describe('questionImageUrl() accessor / image rendering', () => {
    it('does NOT render the image element when image_url is absent', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-question-image-img"]',
      );
      expect(img).toBeNull();
      expect(fixture.componentInstance.questionImageUrl()).toBe('');
    });

    it('renders the image element with the src when image_url is present', () => {
      const url = 'https://cdn.example.com/atom-media/diagram.png';
      const fixture = makeFixture({ stem: 'Q?', image_url: url });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-question-image-img"]',
      ) as HTMLImageElement;
      expect(img).not.toBeNull();
      // jsdom resolves the src attribute to an absolute URL on the property.
      expect(img.getAttribute('src')).toBe(url);
      expect(fixture.componentInstance.questionImageUrl()).toBe(url);
    });

    it('sets a descriptive alt text on the question illustration', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        image_url: 'https://cdn.example.com/x.png',
      });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-question-image-img"]',
      ) as HTMLImageElement;
      expect(img.getAttribute('alt')).toBe('Generated question illustration');
    });

    it('treats an empty-string image_url as no image', () => {
      const fixture = makeFixture({ stem: 'Q?', image_url: '' });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-question-image-img"]',
      );
      // @if (questionImageUrl(); as url) — empty string is falsy, so hidden.
      expect(img).toBeNull();
      expect(fixture.componentInstance.questionImageUrl()).toBe('');
    });
  });

  describe('options() accessor', () => {
    it('renders one button per option', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      });
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      expect(buttons.length).toBe(3);
      expect(fixture.componentInstance.options().length).toBe(3);
    });

    it('renders no option buttons when options is absent', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      expect(buttons.length).toBe(0);
      expect(fixture.componentInstance.options()).toEqual([]);
    });

    it('renders no option buttons when options is an empty array', () => {
      const fixture = makeFixture({ stem: 'Q?', options: [] });
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      expect(buttons.length).toBe(0);
    });

    it('renders the option text content', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'Newton' }, { text: 'Einstein' }],
      });
      const texts = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option-text',
      );
      expect(texts[0].textContent?.trim()).toBe('Newton');
      expect(texts[1].textContent?.trim()).toBe('Einstein');
    });

    it('defaults the option id to its index when id is absent', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const mapped = fixture.componentInstance.options();
      expect(mapped[0].id).toBe(0);
      expect(mapped[1].id).toBe(1);
    });

    it('uses the explicit numeric id when present', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [
          { id: 42, text: 'A' },
          { id: 7, text: 'B' },
        ],
      });
      const mapped = fixture.componentInstance.options();
      expect(mapped[0].id).toBe(42);
      expect(mapped[1].id).toBe(7);
    });

    it('falls back to index when id is a non-number (e.g. a string)', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ id: 'abc', text: 'A' }],
      });
      const mapped = fixture.componentInstance.options();
      expect(mapped[0].id).toBe(0);
    });

    it('defaults the option text to empty string when text is missing', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ id: 1 }],
      });
      const mapped = fixture.componentInstance.options();
      expect(mapped[0].text).toBe('');
    });

    it('assigns a per-index data-testid to each option button', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-testid="mcq-option-0"]')).not.toBeNull();
      expect(el.querySelector('[data-testid="mcq-option-1"]')).not.toBeNull();
    });

    it('gives each option button role="radio"', () => {
      const fixture = makeFixture({ stem: 'Q?', options: [{ text: 'A' }] });
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-option-0"]',
      );
      expect(button?.getAttribute('role')).toBe('radio');
    });
  });

  describe('selection state — aria + indicator + class', () => {
    it('marks all options aria-checked="false" before any selection', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      buttons.forEach((b) =>
        expect(b.getAttribute('aria-checked')).toBe('false'),
      );
    });

    it('renders the empty indicator (○) for unselected options', () => {
      const fixture = makeFixture({ stem: 'Q?', options: [{ text: 'A' }] });
      const indicator = (fixture.nativeElement as HTMLElement).querySelector(
        '.mcq-renderer__option-indicator',
      );
      expect(indicator?.textContent?.trim()).toBe('○');
    });

    it('marks the chosen option aria-checked="true" after selection', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-option-1"]',
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();

      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      expect(buttons[0].getAttribute('aria-checked')).toBe('false');
      expect(buttons[1].getAttribute('aria-checked')).toBe('true');
    });

    it('renders the filled indicator (●) for the selected option', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-option-0"]',
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();

      const indicators = (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll('.mcq-renderer__option-indicator');
      expect(indicators[0].textContent?.trim()).toBe('●');
      expect(indicators[1].textContent?.trim()).toBe('○');
    });

    it('applies the --selected modifier class to the chosen option', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-option-1"]',
      ) as HTMLButtonElement;
      button.click();
      fixture.detectChanges();

      const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '.mcq-renderer__option',
      );
      expect(
        buttons[0].classList.contains('mcq-renderer__option--selected'),
      ).toBe(false);
      expect(
        buttons[1].classList.contains('mcq-renderer__option--selected'),
      ).toBe(true);
    });

    it('moves the selection when a different option is clicked', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
      });
      const el = fixture.nativeElement as HTMLElement;

      (el.querySelector('[data-testid="mcq-option-0"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedIndex()).toBe(0);

      (el.querySelector('[data-testid="mcq-option-2"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.selectedIndex()).toBe(2);

      const buttons = el.querySelectorAll('.mcq-renderer__option');
      expect(buttons[0].getAttribute('aria-checked')).toBe('false');
      expect(buttons[2].getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('selectOption() — answer emission', () => {
    it('sets the selectedIndex signal to the clicked index', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      fixture.componentInstance.selectOption({ id: 1, text: 'B' }, 1);
      expect(fixture.componentInstance.selectedIndex()).toBe(1);
    });

    it('emits { selected_option: id } using the option id (not the index)', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [
          { id: 10, text: 'A' },
          { id: 20, text: 'B' },
        ],
      });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const mapped = fixture.componentInstance.options();
      fixture.componentInstance.selectOption(mapped[1], 1);

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ selected_option: 20 });
    });

    it('emits the index-derived id when options carry no explicit id', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const button = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="mcq-option-1"]',
      ) as HTMLButtonElement;
      button.click();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ selected_option: 1 });
    });

    it('emits once per click (a second click on a new option emits again)', () => {
      const fixture = makeFixture({
        stem: 'Q?',
        options: [{ text: 'A' }, { text: 'B' }],
      });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="mcq-option-0"]') as HTMLButtonElement).click();
      (el.querySelector('[data-testid="mcq-option-1"]') as HTMLButtonElement).click();

      expect(emitted.length).toBe(2);
      expect(emitted[0]).toEqual({ selected_option: 0 });
      expect(emitted[1]).toEqual({ selected_option: 1 });
    });
  });
});
