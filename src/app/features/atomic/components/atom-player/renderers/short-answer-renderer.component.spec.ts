import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ShortAnswerRendererComponent } from './short-answer-renderer.component';

/**
 * Unit spec for ShortAnswerRendererComponent.
 *
 * A pure presentational renderer with one required signal input (`content`),
 * one output (`answerChange`), three derived accessors (`stem`,
 * `maxLength`, `questionImageUrl`) and one user-interaction handler
 * (`onInput`). It performs NO HTTP, so there is no HttpTestingController
 * traffic to drive — we exercise the component directly via setInput + DOM
 * events. The Translate pipe is not used in this template, so all asserted
 * strings are real data.
 */

function makeFixture(
  content: Record<string, unknown>,
): ComponentFixture<ShortAnswerRendererComponent> {
  const fixture = TestBed.createComponent(ShortAnswerRendererComponent);
  fixture.componentRef.setInput('content', content);
  fixture.detectChanges();
  return fixture;
}

describe('ShortAnswerRendererComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShortAnswerRendererComponent],
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
        '[data-testid="short-answer-renderer"]',
      );
      expect(root).not.toBeNull();
    });

    it('renders the stem paragraph element', () => {
      const fixture = makeFixture({ stem: 'Hello' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-stem"]',
      );
      expect(stem).not.toBeNull();
      expect(stem?.tagName).toBe('P');
    });

    it('renders the answer textarea', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-input"]',
      ) as HTMLTextAreaElement;
      expect(input).not.toBeNull();
      expect(input.tagName).toBe('TEXTAREA');
    });
  });

  describe('stem() accessor', () => {
    it('renders the explicit `stem` field when present', () => {
      const fixture = makeFixture({ stem: 'What is the capital of France?' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-stem"]',
      );
      expect(stem?.textContent?.trim()).toContain('capital of France');
    });

    it('falls back to `question` when `stem` is absent', () => {
      const fixture = makeFixture({ question: 'Two plus two equals?' });
      const stem = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-stem"]',
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
        '[data-testid="short-answer-stem"]',
      );
      expect(stem?.textContent?.trim()).toBe('');
      expect(fixture.componentInstance.stem()).toBe('');
    });
  });

  describe('questionImageUrl() accessor / image rendering', () => {
    it('does NOT render the image element when image_url is absent', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-question-image-img"]',
      );
      expect(img).toBeNull();
      expect(fixture.componentInstance.questionImageUrl()).toBe('');
    });

    it('renders the image element with the src when image_url is present', () => {
      const url = 'https://cdn.example.com/atom-media/diagram.png';
      const fixture = makeFixture({ stem: 'Q?', image_url: url });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-question-image-img"]',
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
        '[data-testid="short-answer-question-image-img"]',
      ) as HTMLImageElement;
      expect(img.getAttribute('alt')).toBe('Generated question illustration');
    });

    it('treats an empty-string image_url as no image', () => {
      const fixture = makeFixture({ stem: 'Q?', image_url: '' });
      const img = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-question-image-img"]',
      );
      // @if (questionImageUrl(); as url) — empty string is falsy, so hidden.
      expect(img).toBeNull();
      expect(fixture.componentInstance.questionImageUrl()).toBe('');
    });
  });

  describe('maxLength accessor / character counter', () => {
    it('renders the counter when max_length is present', () => {
      const fixture = makeFixture({ stem: 'Q?', max_length: 100 });
      const counter = (fixture.nativeElement as HTMLElement).querySelector(
        '.short-answer-renderer__counter',
      );
      expect(counter).not.toBeNull();
      expect(counter?.textContent).toContain('0 / 100');
      expect(fixture.componentInstance.maxLength()).toBe(100);
    });

    it('hides the counter when max_length is absent', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const counter = (fixture.nativeElement as HTMLElement).querySelector(
        '.short-answer-renderer__counter',
      );
      expect(counter).toBeNull();
      expect(fixture.componentInstance.maxLength()).toBeNull();
    });
  });

  describe('onInput handler', () => {
    it('emits answerChange with the typed text and tracks charCount', () => {
      const fixture = makeFixture({ stem: 'Q?' });
      const emitted: Record<string, unknown>[] = [];
      fixture.componentInstance.answerChange.subscribe((v) => emitted.push(v));

      const input = (fixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="short-answer-input"]',
      ) as HTMLTextAreaElement;
      input.value = 'Paris';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      expect(emitted.length).toBe(1);
      expect(emitted[0]).toEqual({ text: 'Paris' });
      expect(fixture.componentInstance.charCount).toBe(5);
    });
  });
});
