/**
 * ConceptHexMapComponent — the learner-sovereign concept fisheye (ADR-212).
 *
 * Presentational: it renders a `ConceptFisheye` (focal concept + up to 6
 * related concepts on a hex ring) and emits interaction intents. The parent
 * page owns all data + service calls. The hex geometry (clip-path faces +
 * radial `--dx/--dy` offsets keyed by `data-position`) is reused from the
 * ADR-143 atom canvas, rebound here onto concepts.
 *
 * - tap a neighbour → `recenter` (parent refocuses + rebuilds the fisheye)
 * - "make this my root" → `makeRoot` (parent calls reroot)
 *
 * Each hex shows the concept title + an atom-count badge; the neighbour's
 * relation (parent / child / lateral) drives an accent + a label.
 */
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  ConceptFisheye,
  ConceptNeighborView,
  ConceptRelation,
} from '../concept-fisheye';

const RELATION_I18N: Record<ConceptRelation, string> = {
  parent: 'aplus.discovery.rel_parent',
  child: 'aplus.discovery.rel_child',
  lateral: 'aplus.discovery.rel_lateral',
};

/**
 * Eased-pan duration (ms) when recentring — the tapped node slides to the
 * centre before the fisheye rebuilds around it (design-language.md §6.9
 * action-and-reaction; owner reveal easing). Kept short so it never feels slow.
 */
const RECENTER_PAN_MS = 320;

@Component({
  selector: 'chora-concept-hex-map',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './concept-hex-map.component.html',
  styleUrl: './concept-hex-map.component.scss',
})
export class ConceptHexMapComponent implements OnDestroy {
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  /** The focal + neighbours to render (built by `buildConceptFisheye`). */
  readonly fisheye = input.required<ConceptFisheye>();
  /** Dims the grid + disables interaction during a graph mutation. */
  readonly loading = input<boolean>(false);

  /**
   * Transient grid transform for the recenter PAN: while set, the hex-grid
   * slides so the tapped neighbour travels to the centre; cleared (snap) when
   * the fisheye rebuilds around the new focal. Empty = no pan in flight.
   */
  readonly panTransform = signal<string>('');
  private panTimer: ReturnType<typeof setTimeout> | null = null;

  /** A neighbour was tapped — the parent should recentre on it. */
  readonly recenter = output<ConceptNeighborView>();
  /** The "make this my root" control was pressed for the current focal. */
  readonly makeRoot = output<void>();
  /**
   * The focal cell itself was tapped — the parent should open the focal's
   * detail (the concept is the trigger, ADR-212 direct-manipulation). Emitted
   * even while `loading` (opening a read-only detail during a mutation is safe).
   */
  readonly focalSelect = output<void>();

  relationKey(rel: ConceptRelation): string {
    return RELATION_I18N[rel];
  }

  onRecenter(neighbor: ConceptNeighborView): void {
    if (this.loading()) return;
    // Eased pan (design-language.md §6.9): slide the grid so the tapped node
    // travels to the centre, THEN emit so the parent rebuilds the fisheye around
    // it. Falls back to an immediate emit when motion is reduced or the geometry
    // is unavailable (e.g. jsdom in tests → delta 0), so behaviour is unchanged.
    const delta = this.recenterPanDelta(neighbor.position);
    if (this.prefersReducedMotion() || (delta.x === 0 && delta.y === 0)) {
      this.recenter.emit(neighbor);
      return;
    }
    this.panTransform.set(`translate3d(${-delta.x}px, ${-delta.y}px, 0)`);
    if (this.panTimer) clearTimeout(this.panTimer);
    this.panTimer = setTimeout(() => {
      this.panTimer = null;
      this.panTransform.set(''); // snap: new focal renders centred
      this.recenter.emit(neighbor);
    }, RECENTER_PAN_MS);
  }

  /** Pixel offset of a neighbour's centre from the grid centre (the focal). */
  private recenterPanDelta(position: string): { x: number; y: number } {
    const root = this.host.nativeElement;
    const grid = root.querySelector<HTMLElement>('.hex-grid');
    const cell = root.querySelector<HTMLElement>(
      `.hex-cell--neighbor[data-position="${position}"]`,
    );
    if (!grid || !cell) return { x: 0, y: 0 };
    const g = grid.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    return {
      x: Math.round(c.left + c.width / 2 - (g.left + g.width / 2)),
      y: Math.round(c.top + c.height / 2 - (g.top + g.height / 2)),
    };
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  ngOnDestroy(): void {
    if (this.panTimer) clearTimeout(this.panTimer);
  }

  onMakeRoot(): void {
    if (this.loading() || this.fisheye().isRoot) return;
    this.makeRoot.emit();
  }

  onFocalSelect(): void {
    this.focalSelect.emit();
  }
}
