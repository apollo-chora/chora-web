import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChoraQuestionImageComponent } from './chora-question-image.component';
import { TranslateService } from '../../../core/services/translate.service';

class StubTranslateService {
  instant(k: string): string {
    return k;
  }
  get(k: string): string {
    return k;
  }
  stream(k: string): string {
    return k;
  }
}

describe('ChoraQuestionImageComponent', () => {
  let fixture: ComponentFixture<ChoraQuestionImageComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraQuestionImageComponent],
      providers: [{ provide: TranslateService, useClass: StubTranslateService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ChoraQuestionImageComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setInputs(inputs: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }

  function img(): HTMLImageElement | null {
    return host.querySelector<HTMLImageElement>('[data-testid="qi-img"]');
  }

  /** Simulate the browser decoding the image at the given natural dimensions. */
  function fireLoad(naturalWidth = 800, naturalHeight = 600): void {
    const el = img();
    if (!el) throw new Error('no <img> to load');
    Object.defineProperty(el, 'naturalWidth', { value: naturalWidth, configurable: true });
    Object.defineProperty(el, 'naturalHeight', { value: naturalHeight, configurable: true });
    el.dispatchEvent(new Event('load'));
    fixture.detectChanges();
  }

  function fireError(): void {
    const el = img();
    if (!el) throw new Error('no <img> to error');
    el.dispatchEvent(new Event('error'));
    fixture.detectChanges();
  }

  describe('empty', () => {
    it('renders nothing when src is undefined', () => {
      setInputs({ alt: 'A diagram' });
      expect(host.querySelector('[data-testid="qi-figure"]')).toBeNull();
      expect(img()).toBeNull();
    });

    it('renders nothing for an empty / whitespace src', () => {
      setInputs({ src: '   ', alt: 'A diagram' });
      expect(host.querySelector('[data-testid="qi-figure"]')).toBeNull();
    });
  });

  describe('render + a11y', () => {
    it('renders an <img> with the given src and alt', () => {
      setInputs({ src: 'https://img/q.png', alt: 'A right-angle triangle' });
      const el = img();
      expect(el).not.toBeNull();
      expect(el?.getAttribute('src')).toBe('https://img/q.png');
      expect(el?.getAttribute('alt')).toBe('A right-angle triangle');
    });

    it('renders the optional caption above the image', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x', caption: 'Question illustration' });
      expect(host.textContent).toContain('Question illustration');
    });

    it('exposes a keyboard-focusable zoom trigger button with an aria-label', () => {
      setInputs({ src: 'https://img/q.png', alt: 'A triangle' });
      const trigger = host.querySelector<HTMLButtonElement>('[data-testid="qi-trigger"]');
      expect(trigger).not.toBeNull();
      expect(trigger?.tagName).toBe('BUTTON');
      expect(trigger?.getAttribute('aria-label')).toBeTruthy();
    });
  });

  describe('loading state', () => {
    it('shows a loading indicator before the image loads', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x' });
      expect(host.querySelector('[data-testid="qi-loading"]')).not.toBeNull();
    });

    it('removes the loading indicator once the image has loaded', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x' });
      fireLoad();
      expect(host.querySelector('[data-testid="qi-loading"]')).toBeNull();
    });
  });

  describe('width-primary, aspect-aware sizing', () => {
    // The exact CSS values are asserted on the component's computed signals —
    // jsdom's CSSOM (cssstyle) does not reliably preserve `min()` inline values.
    it('falls back to full-width / 70vh budget before natural dims are known', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x' });
      expect(fixture.componentInstance.maxWidthStyle()).toBe('100%');
      expect(fixture.componentInstance.maxHeightStyle()).toBe('70vh');
    });

    it('caps width at natural width (never upscales) once loaded', () => {
      setInputs({ src: 'https://img/landscape.png', alt: 'x' });
      fireLoad(1200, 400);
      expect(fixture.componentInstance.maxWidthStyle()).toBe('min(100%, 1200px)');
    });

    it('gives portrait images a generous height budget capped at natural height', () => {
      setInputs({ src: 'https://img/portrait.png', alt: 'x' });
      fireLoad(500, 1600);
      expect(fixture.componentInstance.maxHeightStyle()).toBe('min(70vh, 1600px)');
    });

    it('binds the sizing onto the rendered <img>', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x' });
      // The style attribute carries the max-width / max-height bindings.
      expect(img()?.getAttribute('style') ?? '').toContain('max-');
    });
  });

  describe('broken-image fallback (fail-loud)', () => {
    it('shows a visible broken state with the alt text, never hides the error', () => {
      setInputs({ src: 'https://img/missing.png', alt: 'Missing diagram' });
      fireError();
      const broken = host.querySelector('[data-testid="qi-broken"]');
      expect(broken).not.toBeNull();
      expect(host.textContent).toContain('shared.question_image.load_failed');
      expect(host.textContent).toContain('Missing diagram');
      // The dead <img> is dropped from the DOM.
      expect(img()).toBeNull();
    });

    it('re-attempts the image when the src changes after an error', () => {
      setInputs({ src: 'https://img/missing.png', alt: 'x' });
      fireError();
      expect(host.querySelector('[data-testid="qi-broken"]')).not.toBeNull();
      setInputs({ src: 'https://img/recovered.png', alt: 'x' });
      expect(host.querySelector('[data-testid="qi-broken"]')).toBeNull();
      expect(img()?.getAttribute('src')).toBe('https://img/recovered.png');
    });
  });

  describe('click-to-zoom lightbox', () => {
    function openZoom(): void {
      setInputs({ src: 'https://img/q.png', alt: 'A triangle' });
      fireLoad();
      host.querySelector<HTMLButtonElement>('[data-testid="qi-trigger"]')!.click();
      fixture.detectChanges();
    }

    it('opens a full-size lightbox overlay on trigger click', () => {
      openZoom();
      const lightbox = host.querySelector('[data-testid="qi-lightbox"]');
      expect(lightbox).not.toBeNull();
      expect(lightbox?.getAttribute('role')).toBe('dialog');
      expect(lightbox?.getAttribute('aria-modal')).toBe('true');
      const big = lightbox?.querySelector('img');
      expect(big?.getAttribute('src')).toBe('https://img/q.png');
    });

    it('closes the lightbox on Escape', () => {
      openZoom();
      const lightbox = host.querySelector('[data-testid="qi-lightbox"]')!;
      lightbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="qi-lightbox"]')).toBeNull();
    });

    it('closes the lightbox on backdrop click', () => {
      openZoom();
      host.querySelector<HTMLElement>('[data-testid="qi-lightbox"]')!.click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="qi-lightbox"]')).toBeNull();
    });

    it('does not open a lightbox before the image has loaded', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x' });
      const trigger = host.querySelector<HTMLButtonElement>('[data-testid="qi-trigger"]')!;
      // Disabled until loaded — a click must not open the overlay.
      expect(trigger.disabled).toBe(true);
      trigger.click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="qi-lightbox"]')).toBeNull();
    });

    it('does not zoom when zoomable is false', () => {
      setInputs({ src: 'https://img/q.png', alt: 'x', zoomable: false });
      fireLoad();
      const trigger = host.querySelector<HTMLButtonElement>('[data-testid="qi-trigger"]')!;
      expect(trigger.disabled).toBe(true);
      trigger.click();
      fixture.detectChanges();
      expect(host.querySelector('[data-testid="qi-lightbox"]')).toBeNull();
    });
  });

  describe('data-testid prefix', () => {
    it('omits testids when no prefix is supplied', () => {
      // Default prefix is 'qi' in this component, so a custom prefix overrides it.
      setInputs({ src: 'https://img/q.png', alt: 'x', testIdPrefix: 'stem' });
      expect(host.querySelector('[data-testid="stem-img"]')).not.toBeNull();
    });
  });
});
