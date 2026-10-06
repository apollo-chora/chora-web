/**
 * ReorderableListDirective: the ONE keyboard path for every drag-reorder
 * surface (D1, spec section b.3).
 *
 * Why a directive and not a component: the loadout and the Rituals composer
 * render very different rows, so the shared thing is the BEHAVIOUR, not the
 * markup. Each host keeps its own template and gains a keyboard contract by
 * attaching this.
 *
 * ⚠ The reason this exists at all. The masterplan told S2 and S3 to reuse the
 * `CdkDropList` pattern "already in production in test-set-editor". Measured:
 * that precedent is POINTER-ONLY. It has a `cdkDragHandle` and a
 * `cdkDragDisabled` guard, which is good hygiene, but no keydown handler, no
 * arrow move and no position announcement, because Angular CDK ships no
 * keyboard dragging. Copying it would have inherited the exact gap it was cited
 * to close, and reordering is the consequential act in an editor whose whole
 * point is that order matters. So the keyboard path is built once, here, and
 * both editors mount it.
 *
 * Contract:
 *   - plain Arrow keys MOVE FOCUS between rows; Home/End jump to the ends;
 *   - Alt+Arrow MOVES THE ROW, which is a different act and takes a modifier so
 *     a screen-reader user browsing the list cannot reorder it by accident;
 *   - a move at either end is a no-op that ANNOUNCES rather than failing
 *     silently, because silence is indistinguishable from a broken key;
 *   - focus follows the moved row, never resets to the top;
 *   - `aria-live="polite"` announces the row and its new position after a move;
 *   - `disabled` blocks moves but NOT focus movement, so a published ritual
 *     stays readable and navigable.
 */
import {
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

/** A completed reorder: move the row at `from` to `to`. */
export interface ReorderEvent {
  readonly from: number;
  readonly to: number;
}

/** How a row describes itself in the position announcement. */
export type RowLabeller = (index: number) => string;

/**
 * What the list wants said out loud, as an i18n key plus its params.
 *
 * ⚠ Deliberately NOT a finished string. This is the only text a screen-reader
 * user receives from this feature, so it is the last place an English literal
 * may hide, and a literal here would have been invisible to every English
 * reviewer. Handing back a key keeps the shared directive free of the app's
 * TranslateService and puts translation in the host template, where the rest of
 * the app already does it. The host renders it with the translate pipe.
 */
export interface ReorderAnnouncement {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** i18n keys this directive can emit; all four live under `shared.reorderable_list`. */
const ANNOUNCE = {
  moved: 'shared.reorderable_list.moved',
  atStart: 'shared.reorderable_list.at_start',
  atEnd: 'shared.reorderable_list.at_end',
  locked: 'shared.reorderable_list.locked',
} as const;

@Directive({
  selector: '[choraReorderableList]',
  standalone: true,
  // Exported so a host template can bind the roving tabindex and render the
  // announcement into its OWN aria-live element, which is where a screen
  // reader already is. The directive never injects DOM of its own.
  exportAs: 'choraReorderable',
  host: {
    role: 'list',
    '(keydown)': 'onKeydown($event)',
  },
})
export class ReorderableListDirective {
  private readonly hostEl = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  /** How many rows the list currently holds. */
  readonly itemCount = input.required<number>({ alias: 'choraReorderableList' });

  /**
   * Names a row for the announcement. Defaults to the ordinal alone, which is
   * honest but poor; every real host should pass a labeller so the announcement
   * says WHAT moved, not just where.
   */
  readonly rowLabel = input<RowLabeller>((i) => `${i + 1}`);

  /** Blocks MOVES only. Focus navigation stays available (a published ritual). */
  readonly reorderDisabled = input<boolean>(false);

  /** Emitted on a completed move; the host owns the array mutation. */
  readonly reorder = output<ReorderEvent>();

  /** The row that currently owns the single tab stop (roving tabindex). */
  readonly activeIndex = signal(0);

  /**
   * What to announce, as a key plus params. Deliberately a signal the host
   * renders into its OWN `aria-live` element rather than something this
   * directive injects, so the announcement sits in the host's DOM where a
   * screen reader already is. null until the first move is attempted.
   *
   * Host contract:
   *   `@if (ref.announcement(); as a) { {{ a.key | translate: a.params }} }`
   */
  readonly announcement = signal<ReorderAnnouncement | null>(null);

  /** Whether a given row should carry the tab stop. */
  readonly isActive = computed(() => (i: number) => i === this.activeIndex());

  onKeydown(ev: KeyboardEvent): void {
    const count = this.itemCount();
    if (count <= 0) return;

    const i = this.clamp(this.activeIndex(), count);
    const moving = ev.altKey;

    switch (ev.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        ev.preventDefault();
        if (moving) {
          this.move(i, i - 1, count);
        } else {
          this.focusRow(i - 1, count);
        }
        return;
      case 'ArrowDown':
      case 'ArrowRight':
        ev.preventDefault();
        if (moving) {
          this.move(i, i + 1, count);
        } else {
          this.focusRow(i + 1, count);
        }
        return;
      case 'Home':
        ev.preventDefault();
        if (moving) {
          this.move(i, 0, count);
        } else {
          this.focusRow(0, count);
        }
        return;
      case 'End':
        ev.preventDefault();
        if (moving) {
          this.move(i, count - 1, count);
        } else {
          this.focusRow(count - 1, count);
        }
        return;
      default:
        return;
    }
  }

  /** Point the roving tab stop at a row and give it DOM focus. */
  focusRow(index: number, count = this.itemCount()): void {
    if (count <= 0) return;
    const next = this.clamp(index, count);
    this.activeIndex.set(next);
    this.focusActiveElement(next);
  }

  /**
   * Move a row, or announce why it did not move.
   *
   * A no-op at the end of the list ANNOUNCES. A key that appears to do nothing
   * is indistinguishable from a broken one, and that ambiguity is worst for
   * exactly the user this path exists for.
   */
  private move(from: number, to: number, count: number): void {
    if (this.reorderDisabled()) {
      this.announcement.set({
        key: ANNOUNCE.locked,
        params: { label: this.rowLabel()(from) },
      });
      return;
    }
    if (to < 0 || to >= count) {
      this.announcement.set({
        key: to < 0 ? ANNOUNCE.atStart : ANNOUNCE.atEnd,
        params: { label: this.rowLabel()(from) },
      });
      return;
    }
    this.reorder.emit({ from, to });
    // Focus follows the row, not the position: the learner is carrying it.
    this.activeIndex.set(to);
    this.announcement.set({
      key: ANNOUNCE.moved,
      params: { label: this.rowLabel()(to), position: to + 1, count },
    });
    // ⚠ AFTER the host re-renders, not now. The host owns the array and its
    // template rebuilds the rows, so a synchronous focus here lands on the
    // PRE-move DOM: the right index, the wrong row. This was caught by the
    // test asserting document.activeElement rather than the signal, which is
    // the whole reason that assertion is separate from the activeIndex one.
    afterNextRender(() => this.focusActiveElement(this.activeIndex()), {
      injector: this.injector,
    });
  }

  private clamp(i: number, count: number): number {
    return Math.max(0, Math.min(i, count - 1));
  }

  /**
   * Focus the row element by its data index. Read from the DOM rather than kept
   * as a list of refs because the host owns the template and the rows are
   * rebuilt by the host's own `@for`; a stale ref would focus a detached node.
   */
  private focusActiveElement(index: number): void {
    const host = this.hostEl.nativeElement as HTMLElement;
    const row = host.querySelector<HTMLElement>(
      `[data-reorder-index="${index}"]`,
    );
    row?.focus();
  }
}
