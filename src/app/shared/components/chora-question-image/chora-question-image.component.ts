import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { TranslatePipe } from '../../pipes/translate.pipe';

/**
 * ChoraQuestionImageComponent — the ONE shared renderer for a question /
 * answer / model-answer illustration across A+, R+ and the learner surfaces.
 * It replaces ~13 ad-hoc `<img>`/`<figure>` blocks, each with its own (and
 * inconsistent) `max-height` cap.
 *
 * SIZING is WIDTH-PRIMARY + aspect-aware (the fix for the owner-flagged bug
 * where portrait diagrams were crushed by a small fixed cap):
 *   - the image scales to the available content width (the full column), and
 *   - is NEVER upscaled past its natural size, and
 *   - tall/portrait images get a GENEROUS height budget — `min(70vh, natural)`
 *     — instead of a small fixed cap.
 * Natural dimensions are read on `load`; until then we use the `100%` / `70vh`
 * fallback. `width:auto; height:auto` + the two `max-*` caps let the browser
 * scale down preserving aspect ratio with no letterboxing and no upscaling.
 *
 * CLICK-TO-ZOOM: clicking (or tapping — tablet-first) the image opens a
 * full-size lightbox overlay, dismissed on backdrop click or Escape. The
 * trigger is a real `<button>` so it is keyboard-focusable (WCAG 2.1 AA).
 *
 * STATES: loading (spinner) · broken (FAIL-LOUD visible fallback, never a
 * silent swallow) · empty (no `src` → renders nothing).
 *
 * Presentational + standalone. No surface coupling.
 */
@Component({
  selector: 'chora-question-image',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chora-question-image.component.html',
  styleUrl: './chora-question-image.component.scss',
})
export class ChoraQuestionImageComponent {
  /** Image URL. Null / undefined / blank → renders nothing. */
  readonly src = input<string | null | undefined>(undefined);
  /** Accessible description. SHOULD be meaningful; '' marks it decorative. */
  readonly alt = input<string>('');
  /** Optional caption label rendered above the image. */
  readonly caption = input<string | undefined>(undefined);
  /** Click-to-zoom lightbox. On by default; a host may disable it. */
  readonly zoomable = input<boolean>(true);
  /** Prefix for stable data-testids (defaults to `qi`). */
  readonly testIdPrefix = input<string>('qi');

  private readonly lightboxPanel =
    viewChild<ElementRef<HTMLElement>>('lightboxPanel');

  readonly loaded = signal<boolean>(false);
  readonly errored = signal<boolean>(false);
  readonly zoomed = signal<boolean>(false);
  private readonly naturalWidth = signal<number | null>(null);
  private readonly naturalHeight = signal<number | null>(null);

  private previouslyFocused: Element | null = null;

  /** Non-blank src? */
  readonly hasSrc = computed<boolean>(() => {
    const s = this.src();
    return typeof s === 'string' && s.trim().length > 0;
  });

  /** Fill the column up to the natural width — never upscale horizontally. */
  readonly maxWidthStyle = computed<string>(() => {
    const w = this.naturalWidth();
    return w && w > 0 ? `min(100%, ${w}px)` : '100%';
  });

  /** Generous portrait budget, never beyond the natural height. */
  readonly maxHeightStyle = computed<string>(() => {
    const h = this.naturalHeight();
    return h && h > 0 ? `min(70vh, ${h}px)` : '70vh';
  });

  /** Zoom only makes sense for a successfully-loaded image. */
  readonly canZoom = computed<boolean>(
    () => this.zoomable() && this.loaded() && !this.errored(),
  );

  constructor() {
    // Reset render state whenever the src changes so a new image actually
    // re-loads — otherwise a latched broken state would keep the <img> out of
    // the DOM and a recovered/replacement url would never be attempted.
    effect(() => {
      this.src(); // track
      this.loaded.set(false);
      this.errored.set(false);
      this.naturalWidth.set(null);
      this.naturalHeight.set(null);
      this.zoomed.set(false);
    });
  }

  testId(suffix: string): string {
    return `${this.testIdPrefix() || 'qi'}-${suffix}`;
  }

  onLoad(event: Event): void {
    const img = event.target as HTMLImageElement;
    this.naturalWidth.set(img.naturalWidth || null);
    this.naturalHeight.set(img.naturalHeight || null);
    this.errored.set(false);
    this.loaded.set(true);
  }

  onError(): void {
    // FAIL-LOUD: surface a visible broken state, never hide the failure.
    this.errored.set(true);
    this.loaded.set(false);
  }

  openZoom(): void {
    if (!this.canZoom()) return;
    this.previouslyFocused = document.activeElement;
    this.zoomed.set(true);
    // Focus the overlay once Angular has rendered it so Escape works and focus
    // is captured away from the page behind it.
    queueMicrotask(() => this.lightboxPanel()?.nativeElement.focus());
  }

  closeZoom(): void {
    if (!this.zoomed()) return;
    this.zoomed.set(false);
    if (this.previouslyFocused instanceof HTMLElement) {
      this.previouslyFocused.focus();
    }
    this.previouslyFocused = null;
  }

  onLightboxKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.closeZoom();
    }
  }
}
