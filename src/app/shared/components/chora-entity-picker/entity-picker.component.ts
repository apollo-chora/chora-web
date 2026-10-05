/**
 * ChoraEntityPickerComponent — reusable, entity-agnostic search/select
 * primitive (CHO-1833 B0). The cross-surface generalisation of the proven R+
 * MemberPicker. Selector `chora-entity-picker` (no surface prefix).
 *
 * Two inversions over the MemberPicker base:
 *   1. DATA SOURCE DECOUPLED — the picker depends on an `EntitySearchPort`
 *      resolved by `entityType` from the `EntitySearchRegistry` (fail-loud on a
 *      missing adapter), NOT a hard-injected named service. `searchPortOverride`
 *      wins when set.
 *   2. PER-INSTANCE STATE — the component owns its own `EntitySearchState`
 *      signal, so two pickers on one page never clobber each other.
 *
 * Three variants: `single` (collapse + emit `picked`), `multi` (chips + emit
 * `picked`/`removed`), `command` (overlay, keyboard-first, emit `activated` /
 * `activatedNewTab`). Debounced server-search, combobox + aria-activedescendant
 * a11y, full keyboard nav, cursor `load-more`, and `resolve(ids)` hydration of
 * pre-set `value`.
 *
 * Display micro-copy (`loadingLabel` / `emptyLabel` / `errorLabel` /
 * `retryLabel` / `loadMoreLabel`) is supplied by the consumer as already-
 * localised strings (English defaults) — the same i18n boundary `chora-empty-
 * state` uses — keeping this primitive self-contained.
 */
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Subject, Subscription, debounceTime, distinctUntilChanged, take } from 'rxjs';
import { Overlay, OverlayModule, type ConnectedPosition } from '@angular/cdk/overlay';

import { ChoraEmptyStateComponent } from '../chora-empty-state/chora-empty-state.component';
import { EntitySearchRegistry } from './entity-search.registry';
import {
  ENTITY_SEARCH_ERROR_CODE,
  type EntityDisabledPredicate,
  type EntityFacets,
  type EntityPickerVariant,
  type EntityRef,
  type EntitySearchPort,
  type EntitySearchState,
  type EntityType,
} from './entity-picker.model';

/** Monotonic source of unique ARIA ids across picker instances on a page. */
let pickerInstanceSeq = 0;

@Component({
  selector: 'chora-entity-picker',
  standalone: true,
  imports: [ChoraEmptyStateComponent, OverlayModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './entity-picker.component.html',
  styleUrl: './entity-picker.component.scss',
})
export class ChoraEntityPickerComponent implements OnInit, AfterViewInit {
  private readonly registry = inject(EntitySearchRegistry);
  private readonly destroyRef = inject(DestroyRef);

  // ── Inputs ─────────────────────────────────────────────────────────────────
  /** Entity kind to search. Required — resolves the port. */
  readonly entityType = input.required<EntityType>();
  /** Presentation mode. */
  readonly variant = input<EntityPickerVariant>('single');
  /** Facet filters forwarded verbatim to the port. */
  readonly facets = input<EntityFacets>({});
  /** Parent-owned selection (chips for `multi`, selected line for `single`). */
  readonly value = input<readonly EntityRef[]>([]);
  /** Predicate marking a result row non-selectable. */
  readonly disabledPredicate = input<EntityDisabledPredicate>(() => false);
  /** Visible field label; also the input's accessible name when set. */
  readonly label = input<string>('');
  /** Input placeholder. */
  readonly placeholder = input<string>('');
  /**
   * Minimum query length before a search fires.
   *
   * Set to `0` to make the picker BROWSABLE: focusing the input runs a search
   * with an empty query, so the user can pick from a list instead of having to
   * already know a name (CHO-2291). Only use 0 when the backing port accepts an
   * empty `q` and paginates — the tenancy franchisee directory and the identity
   * member search both do; a port that requires `q` must keep a non-zero value.
   */
  readonly minChars = input<number>(3);
  /** Debounce window in ms. */
  readonly debounceMs = input<number>(300);
  /** Focus the input on init (always true for `command`). */
  readonly autoFocus = input<boolean>(false);
  /** Bypass the registry with an explicit port (wins when set). */
  readonly searchPortOverride = input<EntitySearchPort | null>(null);

  // Display micro-copy (consumer-localised; English defaults).
  readonly loadingLabel = input<string>('Searching…');
  readonly emptyLabel = input<string>('No matches found');
  /**
   * Empty-state copy for a BROWSE (empty query) that returned nothing. "No
   * matches found" is misleading there — the user searched for nothing, so the
   * truthful statement is about the set being empty ("No learners in this
   * tenant"), not about a failed match. Falls back to `emptyLabel` when unset.
   */
  readonly emptyBrowseLabel = input<string>('');
  readonly errorLabel = input<string>('Search failed. Please try again.');
  readonly retryLabel = input<string>('Retry');
  readonly loadMoreLabel = input<string>('Load more');
  readonly emptyIcon = input<string>('fa-solid fa-magnifying-glass');

  // ── Outputs ────────────────────────────────────────────────────────────────
  /** A row was selected (`single` / `multi`). */
  readonly picked = output<EntityRef>();
  /** A chip / selection was removed — emits the row id. */
  readonly removed = output<string>();
  /** A row was activated in place (`command`). */
  readonly activated = output<EntityRef>();
  /** A row was activated in a new tab — meta+select (`command`). */
  readonly activatedNewTab = output<EntityRef>();

  @ViewChild('inputEl') private inputEl?: ElementRef<HTMLInputElement>;

  // ── ARIA ids (unique per instance) ───────────────────────────────────────────
  private readonly uid = `chora-entity-picker-${(pickerInstanceSeq += 1)}`;
  readonly inputId = `${this.uid}-input`;
  readonly labelId = `${this.uid}-label`;
  readonly listboxId = `${this.uid}-listbox`;

  // ── Per-instance search state (inversion #2) ─────────────────────────────────
  private readonly _searchState = signal<EntitySearchState>({ status: 'idle' });
  readonly query = signal('');
  readonly activeIndex = signal(-1);

  readonly isLoading = computed(() => this._searchState().status === 'loading');
  readonly isError = computed(() => this._searchState().status === 'error');
  readonly results = computed<readonly EntityRef[]>(() => {
    const state = this._searchState();
    return state.status === 'success' ? state.items : [];
  });
  readonly nextCursor = computed<string | null>(() => {
    const state = this._searchState();
    return state.status === 'success' ? state.nextCursor : null;
  });
  readonly isEmpty = computed(() => {
    const state = this._searchState();
    return state.status === 'success' && state.items.length === 0;
  });
  readonly hasListbox = computed(
    () => this._searchState().status === 'success' && this.results().length > 0,
  );
  readonly isOpen = computed(() => this._searchState().status !== 'idle');

  /**
   * True when there is anything to show below the input. Drives the CDK
   * connected overlay: the loading / error / empty / results block is rendered
   * in a body-level overlay container, so opening it never grows the field and
   * never reflows the surrounding layout.
   *
   * Portaling (not just `position: absolute`) is REQUIRED here. The panel's
   * ancestor `.glass-panel` carries `backdrop-filter`, which creates a stacking
   * context AND a containing block, so an in-place panel is painted under the
   * next sibling card whatever its z-index, and `position: fixed` is trapped
   * too. Only leaving the subtree escapes it. Measured on prod 2026-07-18: the
   * dropdown was cut off mid-list by the transactions table card below.
   */
  readonly panelOpen = computed(
    () => this.isLoading() || this.isError() || this.isEmpty() || this.hasListbox(),
  );

  /**
   * Overlay sits under the field, flipping above it when there is no room.
   * Mutable array type: `cdkConnectedOverlayPositions` does not accept a
   * `readonly` one.
   */
  readonly overlayPositions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
    { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  ];

  /** Keeps the panel glued to the field while the page scrolls. */
  readonly scrollStrategy = inject(Overlay).scrollStrategies.reposition();

  /** Match the panel width to the input so it reads as one control. */
  triggerWidth(): number {
    return this.inputEl?.nativeElement.offsetWidth ?? 0;
  }

  /**
   * Close on an outside click. Mandatory once the panel is portaled: a panel
   * that lives outside the component would otherwise keep floating over the
   * page after the user clicks away. Selecting a row is INSIDE the overlay, so
   * it does not trigger this.
   */
  closePanel(): void {
    this._searchState.set({ status: 'idle' });
    this.activeIndex.set(-1);
  }

  /**
   * Empty-state heading: browse-specific copy when the user has typed nothing,
   * otherwise the search-empty copy.
   */
  readonly emptyHeading = computed(() => {
    const browse = this.emptyBrowseLabel().trim();
    return this.query().trim() === '' && browse !== '' ? browse : this.emptyLabel();
  });
  readonly activeDescendantId = computed<string | null>(() => {
    const index = this.activeIndex();
    return this.hasListbox() && index >= 0 && index < this.results().length
      ? this.optionId(index)
      : null;
  });

  // ── Hydration (resolve id-only value rows → labels) ──────────────────────────
  private readonly _hydrated = signal<ReadonlyMap<string, EntityRef>>(new Map());
  readonly displayValue = computed<readonly EntityRef[]>(() => {
    const hydrated = this._hydrated();
    return this.value().map((ref) => hydrated.get(ref.id) ?? ref);
  });

  // ── Internals ────────────────────────────────────────────────────────────────
  // Inversion #1, made REACTIVE: resolve the port from the current inputs on every
  // read. Override wins; otherwise fail-loud on a missing registry adapter (never a
  // silent empty dropdown). Because it is a computed — not a value captured once in
  // ngOnInit — a reused picker instance whose `entityType` / `searchPortOverride`
  // change (e.g. a kind-switching "add curriculum item" form) re-binds to the right
  // adapter instead of stranding on the initial kind's port (CHO-2134).
  private readonly port = computed<EntitySearchPort>(
    () => this.searchPortOverride() ?? this.registry.resolve(this.entityType()),
  );
  private readonly query$ = new Subject<string>();
  private readonly subs = new Subscription();
  private searchSeq = 0;
  private lastQuery = '';

  constructor() {
    // Drop transient search state whenever the entity kind (entityType) or the
    // override port changes on a reused instance, so stale results from the prior
    // kind can never be shown or selected against the new one. Skips the initial
    // resolve. Tracks the raw inputs (not the resolved port) so it never itself
    // triggers registry resolution / a fail-loud throw.
    let initialised = false;
    effect(() => {
      this.entityType();
      this.searchPortOverride();
      if (!initialised) {
        initialised = true;
        return;
      }
      this._searchState.set({ status: 'idle' });
      this.query.set('');
      this.activeIndex.set(-1);
      this.lastQuery = '';
    });
  }

  ngOnInit(): void {
    this.query$
      .pipe(
        debounceTime(this.debounceMs()),
        distinctUntilChanged(),
      )
      .subscribe((q) => this.executeSearch(q, null, false));
    this.destroyRef.onDestroy(() => {
      this.query$.complete();
      this.subs.unsubscribe();
    });

    this.hydrateValue();
  }

  ngAfterViewInit(): void {
    if ((this.autoFocus() || this.variant() === 'command') && this.inputEl) {
      queueMicrotask(() => this.inputEl?.nativeElement.focus());
    }
  }

  // ── Search ────────────────────────────────────────────────────────────────────
  onQueryInput(value: string): void {
    this.query.set(value);
    this.query$.next(value);
  }

  /**
   * Browse on focus (CHO-2291). Only for a browsable picker (`minChars === 0`)
   * and only from idle, so re-focusing an already-open panel does not re-hit
   * the port — and a user who has typed something never has their results
   * replaced by the unfiltered list.
   */
  onFocus(): void {
    if (this.minChars() !== 0) return;
    if (this._searchState().status !== 'idle') return;
    this.executeSearch('', null, false);
  }

  retry(): void {
    this.executeSearch(this.lastQuery, null, false);
  }

  loadMore(): void {
    const cursor = this.nextCursor();
    if (cursor) {
      this.executeSearch(this.lastQuery, cursor, true);
    }
  }

  private executeSearch(query: string, cursor: string | null, append: boolean): void {
    const trimmed = query.trim();
    if (trimmed.length < this.minChars()) {
      this._searchState.set({ status: 'idle' });
      this.activeIndex.set(-1);
      return;
    }
    this.lastQuery = trimmed;
    const seq = append ? this.searchSeq : (this.searchSeq += 1);
    if (!append) {
      this._searchState.set({ status: 'loading' });
      this.activeIndex.set(-1);
    }

    const sub = this.port()
      .search(trimmed, this.facets(), cursor)
      .pipe(take(1))
      .subscribe({
        next: (page) => {
          if (seq !== this.searchSeq) {
            return; // a newer search superseded this one
          }
          if (append) {
            const prev = this._searchState();
            const prevItems = prev.status === 'success' ? prev.items : [];
            this._searchState.set({
              status: 'success',
              items: [...prevItems, ...page.items],
              nextCursor: page.nextCursor,
            });
          } else {
            this._searchState.set({
              status: 'success',
              items: page.items,
              nextCursor: page.nextCursor,
            });
          }
        },
        error: () => {
          if (seq !== this.searchSeq) {
            return;
          }
          this._searchState.set({ status: 'error', error: ENTITY_SEARCH_ERROR_CODE });
        },
      });
    this.subs.add(sub);
  }

  private hydrateValue(): void {
    const port = this.port();
    const resolve = port.resolve?.bind(port);
    if (!resolve) {
      return;
    }
    const missing = this.value()
      .filter((ref) => ref.label.trim().length === 0)
      .map((ref) => ref.id);
    if (missing.length === 0) {
      return;
    }
    const sub = resolve(missing)
      .pipe(take(1))
      .subscribe((rows) => {
        const next = new Map(this._hydrated());
        for (const row of rows) {
          next.set(row.id, row);
        }
        this._hydrated.set(next);
      });
    this.subs.add(sub);
  }

  // ── Selection / activation ────────────────────────────────────────────────────
  onOptionClick(row: EntityRef, event: MouseEvent): void {
    this.activate(row, event.metaKey);
  }

  removeChip(id: string): void {
    this.removed.emit(id);
  }

  clearSelected(): void {
    const current = this.displayValue();
    if (current.length > 0) {
      this.removed.emit(current[0].id);
    }
  }

  private activate(row: EntityRef, newTab: boolean): void {
    if (this.isDisabled(row)) {
      return;
    }
    if (this.variant() === 'command') {
      if (newTab) {
        this.activatedNewTab.emit(row);
      } else {
        this.activated.emit(row);
      }
      return;
    }
    // single + multi: dumb-emitter — parent owns `value`.
    this.picked.emit(row);
    this.collapse();
    this.query.set('');
    if (this.inputEl) {
      this.inputEl.nativeElement.value = '';
    }
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────────
  onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1);
        break;
      case 'Enter': {
        const row = this.activeRow();
        if (row) {
          event.preventDefault();
          this.activate(row, event.metaKey);
        }
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.collapse();
        break;
      default:
        break;
    }
  }

  private moveActive(delta: number): void {
    const items = this.results();
    if (items.length === 0) {
      return;
    }
    // Walk at most `length` steps from the current index, wrapping, until an
    // enabled row is found (skips disabled rows).
    let index = this.activeIndex();
    let steps = 0;
    while (steps < items.length) {
      index = (index + delta + items.length) % items.length;
      if (!this.isDisabled(items[index])) {
        this.activeIndex.set(index);
        return;
      }
      steps += 1;
    }
  }

  private activeRow(): EntityRef | null {
    const index = this.activeIndex();
    const items = this.results();
    return index >= 0 && index < items.length ? items[index] : null;
  }

  private collapse(): void {
    this._searchState.set({ status: 'idle' });
    this.activeIndex.set(-1);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  optionId(index: number): string {
    return `${this.uid}-option-${index}`;
  }

  isDisabled(row: EntityRef): boolean {
    return this.disabledPredicate()(row);
  }

  isActive(index: number): boolean {
    return this.activeIndex() === index;
  }

  badgeOf(row: EntityRef): string | null {
    const badge = row.meta?.['badge'];
    return typeof badge === 'string' ? badge : null;
  }

  onOptionHover(index: number): void {
    const row = this.results()[index];
    if (row && !this.isDisabled(row)) {
      this.activeIndex.set(index);
    }
  }
}
