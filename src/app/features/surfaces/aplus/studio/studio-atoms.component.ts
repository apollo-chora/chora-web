/**
 * StudioAtomsComponent — `/a/studio/atoms`, the author's atom inventory.
 *
 * WHAT THIS REPLACES: a list bolted onto the compose canvas's FOOTER. It was
 * capped at 20 rows, had no search, no filters and no paging, and it swallowed
 * its load error (`error: () => this.myAtomsLoading.set(false)`) so a 500
 * rendered as "you have no atoms". None of that was an API limitation: the
 * search endpoint has supported free-text `q`, `question_type[]`, `state[]`,
 * `tag[]`, sort, server-side `author_gcid` + `source`, and an unconditional
 * `total` the whole time. The inventory was simply never given a surface.
 *
 * Fail-loud (CLAUDE.md): a failed fetch renders a loud, retryable error and is
 * never confused with an empty inventory. The two states are distinct and
 * separately asserted.
 *
 * Pagination is page-number over `{page, per, total}` (see
 * atom-question-picker.model.ts for why the cursor params the FE used to send
 * were inert). This surface REPLACES its page rather than accumulating like the
 * picker's Load-more: an inventory you scan is not a candidate list you gather.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, map, switchMap } from 'rxjs/operators';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { AtomAuthoringService } from '../atom-authoring/atom-authoring.service';
import {
  REUSE_AUDIENCES,
  parseReuseAudience,
  type ReuseAudience,
} from '../atom-authoring/atom-authoring.model';
import { AtomQuestionPickerService } from '../atom-question-picker/atom-question-picker.service';
import {
  AUTHORABLE_QUESTION_TYPES,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  PAGE_SIZE_OPTIONS,
  SORT_OPTIONS,
  hasMorePages,
  type AtomState,
  type PageSize,
  type QuestionSearchQuery,
  type QuestionSearchResult,
  type QuestionType,
  type SortOption,
} from '../atom-question-picker/atom-question-picker.model';
import { StudioSubNavComponent } from './studio-sub-nav.component';

/** Debounce for author-driven query changes (matches the picker's cadence). */
const SEARCH_DEBOUNCE_MS = 300;

/** The lifecycle states an author filters by. `''` = no state predicate. */
const STATE_OPTIONS: readonly AtomState[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

/** Licences an atom can be shared to the C+ feed under (mirrors the canvas). */
const LICENSE_OPTIONS = [
  { value: 'free', labelKey: 'aplus.studio_atoms.share.license_free' },
  { value: 'cc_by_sa', labelKey: 'aplus.studio_atoms.share.license_cc_by_sa' },
  { value: 'cc_nd', labelKey: 'aplus.studio_atoms.share.license_cc_nd' },
  { value: 'royalty_pct', labelKey: 'aplus.studio_atoms.share.license_royalty_pct' },
  { value: 'royalty_fixed', labelKey: 'aplus.studio_atoms.share.license_royalty_fixed' },
] as const;

/**
 * Per-atom reuse-audience sub-state (ADR-229 WS-5, CHO-2401). Separate from
 * InventoryState and from ShareState for the same reason share is: a refused
 * audience change is not a failed list, and it is not a share either — the
 * share panel promotes to the C+ feed, this one changes who may REUSE the
 * question in their own test sets.
 */
type AudienceState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly atomId: string }
  | { readonly status: 'submitting'; readonly atomId: string }
  | { readonly status: 'error'; readonly atomId: string; readonly errorKey: string };

/**
 * Per-atom share sub-state. Deliberately SEPARATE from InventoryState: a failed
 * share is not a failed list, so it must not blank the rows the author is
 * looking at.
 */
type ShareState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly atomId: string }
  | { readonly status: 'submitting'; readonly atomId: string }
  | { readonly status: 'success'; readonly atomId: string }
  | { readonly status: 'error'; readonly atomId: string; readonly errorKey: string };

/**
 * Discriminated load state. `error` is a first-class arm precisely because the
 * list this replaces had none: it only had a loading boolean, so failure was
 * indistinguishable from emptiness.
 */
type InventoryState =
  | { readonly status: 'loading' }
  | {
      readonly status: 'success';
      readonly items: readonly QuestionSearchResult[];
      readonly page: number;
      readonly per: number;
      readonly total: number | null;
    }
  | { readonly status: 'error'; readonly errorKey: string };

@Component({
  selector: 'chora-studio-atoms',
  standalone: true,
  imports: [RouterLink, TranslatePipe, TimeAgoPipe, StudioSubNavComponent],
  templateUrl: './studio-atoms.component.html',
  styleUrl: './studio-atoms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudioAtomsComponent {
  private readonly service = inject(AtomQuestionPickerService);
  private readonly authoring = inject(AtomAuthoringService);
  private readonly destroyRef = inject(DestroyRef);

  readonly stateOptions = STATE_OPTIONS;
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  readonly licenseOptions = LICENSE_OPTIONS;
  /** '' = any authorable type; otherwise one member of the authorable set. */
  readonly typeOptions = AUTHORABLE_QUESTION_TYPES;
  readonly sortOptions = SORT_OPTIONS;

  // ── Query state ─────────────────────────────────────────────────────────
  readonly needle = signal('');
  readonly stateFilter = signal<AtomState | ''>('');
  readonly typeFilter = signal<QuestionType | ''>('');
  readonly sort = signal<SortOption>(DEFAULT_SORT);
  readonly per = signal<PageSize>(DEFAULT_PAGE_SIZE);
  private readonly page = signal(1);

  // ── Load state ──────────────────────────────────────────────────────────
  private readonly _state = signal<InventoryState>({ status: 'loading' });
  readonly state = this._state.asReadonly();

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');
  readonly errorKey = computed(() => {
    const s = this._state();
    return s.status === 'error' ? s.errorKey : '';
  });

  readonly items = computed<readonly QuestionSearchResult[]>(() => {
    const s = this._state();
    return s.status === 'success' ? s.items : [];
  });

  /** True ONLY for a successful fetch that returned nothing. */
  readonly isEmpty = computed(() => {
    const s = this._state();
    return s.status === 'success' && s.items.length === 0;
  });

  readonly total = computed<number | null>(() => {
    const s = this._state();
    return s.status === 'success' ? s.total : null;
  });

  readonly currentPage = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.page : 1;
  });

  readonly hasPrevPage = computed(() => this.currentPage() > 1);

  readonly hasNextPage = computed(() => {
    const s = this._state();
    if (s.status !== 'success') return false;
    return hasMorePages(s.page, s.per, s.total);
  });

  // ── Reuse-audience sub-state (ADR-229 WS-5) ─────────────────────────────
  readonly reuseAudiences = REUSE_AUDIENCES;
  private readonly _audience = signal<AudienceState>({ status: 'closed' });
  readonly audienceSelection = signal<ReuseAudience>('private');
  /**
   * Server echoes from successful PATCHes, keyed by atom id. The chip reads
   * override-then-row so a change is visible without a refetch; the map is
   * cleared whenever a fresh page lands, because the rows then ARE the truth.
   */
  private readonly _audienceOverrides = signal<Readonly<Record<string, ReuseAudience>>>({});

  readonly audienceSubmitting = computed(() => this._audience().status === 'submitting');
  readonly audienceErrorMessage = computed<string | null>(() => {
    const s = this._audience();
    return s.status === 'error' ? s.errorKey : null;
  });

  // ── Share sub-state ─────────────────────────────────────────────────────
  private readonly _share = signal<ShareState>({ status: 'closed' });
  readonly shareLicense = signal<string>('cc_by_sa');
  readonly shareRoyaltyRate = signal<number>(10);
  readonly isRoyaltyLicense = computed<boolean>(
    () => this.shareLicense() === 'royalty_pct' || this.shareLicense() === 'royalty_fixed',
  );
  readonly shareCaption = signal('');

  readonly shareSubmitting = computed(() => this._share().status === 'submitting');
  readonly shareSucceeded = computed(() => this._share().status === 'success');
  readonly shareErrorMessage = computed<string | null>(() => {
    const s = this._share();
    return s.status === 'error' ? s.errorKey : null;
  });

  // ── Search pipeline ─────────────────────────────────────────────────────
  private readonly trigger$ = new Subject<QuestionSearchQuery>();

  constructor() {
    this.trigger$
      .pipe(
        debounceTime(SEARCH_DEBOUNCE_MS),
        switchMap((query) => this.run(query)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => this.apply(outcome));

    // Initial load is immediate — debouncing the first paint would show an
    // empty frame for 300ms for no reason.
    this.fetch();
  }

  // ── Handlers ────────────────────────────────────────────────────────────
  onNeedleInput(event: Event): void {
    this.needle.set((event.target as HTMLInputElement).value);
    this.resetToFirstPage();
    this.fetchDebounced();
  }

  onStateChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as AtomState | '';
    this.stateFilter.set(value === '' || STATE_OPTIONS.includes(value) ? value : '');
    this.resetToFirstPage();
    this.fetchDebounced();
  }

  /**
   * i18n key for a sort option. Derived rather than mapped by hand: a
   * hand-written label↔value map drifts silently the moment an option is added.
   * `created_at:desc` → `aplus.studio_atoms.sort_created_at_desc`.
   */
  sortLabelKey(option: SortOption): string {
    return `aplus.studio_atoms.sort_${option.replace(':', '_')}`;
  }

  /**
   * The timestamp a row should SHOW — the one the active sort orders by.
   *
   * 🔴 Rendering created_at while sorting on updated_at makes a correctly
   * sorted list look broken: the visible numbers are not the ones being
   * ordered (observed live: 8m / 10h / 12m / 14m under "Recently updated").
   * The list must show its own ordering key, or the sort is invisible and the
   * AC's "the list responds accordingly" is only true on the wire.
   */
  rowTimestamp(atom: QuestionSearchResult): string {
    return this.sort().startsWith('updated_at') ? atom.updated_at : atom.created_at;
  }

  /** Label for that timestamp, so "8m ago" is never ambiguous about WHICH event. */
  rowTimestampLabelKey(): string {
    return this.sort().startsWith('updated_at')
      ? 'aplus.studio_atoms.time_updated'
      : 'aplus.studio_atoms.time_created';
  }

  onTypeChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as QuestionType | '';
    // Fail closed to "any authorable type" rather than forward an unknown type.
    this.typeFilter.set(
      value === '' || AUTHORABLE_QUESTION_TYPES.includes(value) ? value : '',
    );
    this.resetToFirstPage();
    this.fetchDebounced();
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as SortOption;
    // 🔴 Whitelist-gated: an unlisted sort FIELD is a 400 at the boundary, so a
    // stale/tampered option must never reach the wire. Ignore it outright —
    // re-fetching with the old sort would silently contradict the visible
    // control, which is worse than doing nothing.
    if (!SORT_OPTIONS.includes(value)) return;
    this.sort.set(value);
    this.resetToFirstPage();
    this.fetchDebounced();
  }

  onPerChange(event: Event): void {
    const parsed = Number((event.target as HTMLSelectElement).value) as PageSize;
    if (!PAGE_SIZE_OPTIONS.includes(parsed)) return;
    this.per.set(parsed);
    this.resetToFirstPage();
    this.fetchDebounced();
  }

  nextPage(): void {
    if (!this.hasNextPage()) return;
    this.page.set(this.currentPage() + 1);
    this.fetch();
  }

  prevPage(): void {
    if (!this.hasPrevPage()) return;
    this.page.set(this.currentPage() - 1);
    this.fetch();
  }

  retry(): void {
    this.fetch();
  }

  // ── Reuse audience (ADR-229 WS-5) ───────────────────────────────────────
  /** The audience the chip shows: the freshest server truth we hold. */
  atomAudience(atom: QuestionSearchResult): ReuseAudience {
    return (
      this._audienceOverrides()[atom.id] ?? parseReuseAudience(atom.reuse_visibility)
    );
  }

  audienceIcon(atom: QuestionSearchResult): string {
    switch (this.atomAudience(atom)) {
      case 'tenant':
        return 'fa-users';
      case 'friends':
        return 'fa-user-group';
      default:
        return 'fa-lock';
    }
  }

  openAudiencePanel(atom: QuestionSearchResult): void {
    this.audienceSelection.set(this.atomAudience(atom));
    this._audience.set({ status: 'open', atomId: atom.id });
  }

  closeAudience(): void {
    this._audience.set({ status: 'closed' });
  }

  isAudienceOpen(atomId: string): boolean {
    const s = this._audience();
    return s.status !== 'closed' && s.atomId === atomId;
  }

  pickAudience(a: ReuseAudience): void {
    this.audienceSelection.set(a);
  }

  /** Apply is a no-op guard as well as a button state: same value ⇒ no wire. */
  audienceUnchanged(atom: QuestionSearchResult): boolean {
    return this.audienceSelection() === this.atomAudience(atom);
  }

  /**
   * True when the selection is NARROWER than the persisted audience — the
   * case A1.3 requires the UI to be truthful about: consumers keep a frozen
   * copy, only new reuse stops.
   */
  audienceNarrowing(atom: QuestionSearchResult): boolean {
    return (
      REUSE_AUDIENCES.indexOf(this.audienceSelection()) <
      REUSE_AUDIENCES.indexOf(this.atomAudience(atom))
    );
  }

  applyAudience(atom: QuestionSearchResult): void {
    const s = this._audience();
    if (s.status !== 'open' && s.status !== 'error') return;
    if (this.audienceUnchanged(atom)) return;
    const asked = this.audienceSelection();
    this._audience.set({ status: 'submitting', atomId: atom.id });
    this.authoring
      .changeReuseVisibility(atom.id, asked)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // Trust the echo over the ask where the BE supplies one.
          const persisted = parseReuseAudience(res?.reuse_visibility ?? asked);
          this._audienceOverrides.update((m) => ({ ...m, [atom.id]: persisted }));
          // The chip is the confirmation; a success banner would say it twice.
          this._audience.set({ status: 'closed' });
        },
        error: (err: unknown) =>
          this._audience.set({
            status: 'error',
            atomId: atom.id,
            errorKey: this.audienceErrorKey(err),
          }),
      });
  }

  /**
   * 409 CREATION_ATOM_ORPHANED_FROZEN is the one worth naming: an orphan
   * edition is private forever (A1.2), and "try again" would be a lie.
   */
  private audienceErrorKey(err: unknown): string {
    const e = err as { status?: number; error?: { code?: string } };
    if (e?.error?.code === 'CREATION_ATOM_ORPHANED_FROZEN') {
      return 'aplus.studio_atoms.audience.error_frozen';
    }
    if (e?.status === 403) return 'aplus.studio_atoms.audience.error_not_author';
    if (typeof e?.status === 'number' && e.status >= 500) {
      return 'aplus.studio_atoms.audience.error_upstream';
    }
    return 'aplus.studio_atoms.audience.error_generic';
  }

  // ── Share to C+ ─────────────────────────────────────────────────────────
  openShare(atomId: string): void {
    this.shareCaption.set('');
    this.shareLicense.set('cc_by_sa');
    this.shareRoyaltyRate.set(10);
    this._share.set({ status: 'open', atomId });
  }

  closeShare(): void {
    this._share.set({ status: 'closed' });
  }

  isSharing(atomId: string): boolean {
    const s = this._share();
    return s.status !== 'closed' && s.atomId === atomId;
  }

  onShareCaptionInput(event: Event): void {
    this.shareCaption.set((event.target as HTMLInputElement).value);
  }

  onShareLicenseChange(event: Event): void {
    this.shareLicense.set((event.target as HTMLSelectElement).value);
  }

  onShareRoyaltyRateInput(event: Event): void {
    this.shareRoyaltyRate.set(+(event.target as HTMLInputElement).value);
  }

  submitShare(): void {
    const s = this._share();
    if (s.status !== 'open' && s.status !== 'error') return;
    const { atomId } = s;
    const caption = this.shareCaption().trim();
    this._share.set({ status: 'submitting', atomId });
    this.authoring
      .shareAtom(atomId, {
        license_terms: this.shareLicense(),
        // Omit rather than send an empty string — the BE treats the field as
        // absent-or-meaningful, and "" is neither.
        ...(caption ? { caption } : {}),
        ...(this.isRoyaltyLicense()
          ? { royalty_rate: { kind: this.shareLicense() === 'royalty_pct' ? 'pct' : 'fixed_per_use', value: this.shareRoyaltyRate() } }
          : {}),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this._share.set({ status: 'success', atomId }),
        error: (err: unknown) =>
          this._share.set({
            status: 'error',
            atomId,
            errorKey: this.shareErrorKey(err),
          }),
      });
  }

  /**
   * A share failure is per-atom and specific. 412 is the one worth naming: the
   * inventory lists drafts as well as published atoms, and only a PUBLISHED
   * atom can reach the C+ feed, so "not published yet" is actionable where a
   * generic failure would just look broken.
   */
  private shareErrorKey(err: unknown): string {
    const e = err as { status?: number };
    if (e?.status === 412) return 'aplus.studio_atoms.share.error_not_published';
    if (e?.status === 403) return 'aplus.studio_atoms.share.error_not_owner';
    if (typeof e?.status === 'number' && e.status >= 500) {
      return 'aplus.studio_atoms.share.error_upstream';
    }
    return 'aplus.studio_atoms.share.error_generic';
  }

  // ── Internals ───────────────────────────────────────────────────────────
  /**
   * Any change to WHAT is being searched invalidates WHERE we are in the
   * results. Without this, narrowing a query while on page 3 strands the author
   * on an empty page of a result set that has a page 1.
   */
  private resetToFirstPage(): void {
    this.page.set(1);
  }

  /** Immediate fetch — mount, paging and retry (none of which need debouncing). */
  private fetch(): void {
    this._state.set({ status: 'loading' });
    this.run(this.composeQuery())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => this.apply(outcome));
  }

  /** Debounced fetch — author-driven query edits. */
  private fetchDebounced(): void {
    this._state.set({ status: 'loading' });
    this.trigger$.next(this.composeQuery());
  }

  private composeQuery(): QuestionSearchQuery {
    const page = this.page();
    const state = this.stateFilter();
    const type = this.typeFilter();
    return {
      q: this.needle().trim() || undefined,
      // '' = "any type" → the AUTHORABLE set, NOT an unbounded query: the
      // reserved_* types have no authoring surface, so listing one would show
      // a row the author cannot open. The filter narrows WITHIN that set.
      question_type: type === '' ? [...AUTHORABLE_QUESTION_TYPES] : [type],
      state: state === '' ? undefined : [state],
      // source=mine is the server-side author filter. The alternative — fetch
      // everything and filter client-side — would page over other people's
      // atoms and make `total` a lie.
      source: 'mine',
      sort: this.sort(),
      per: this.per(),
      // Page 1 is the BE's default; omitting it keeps the query string honest
      // about what is actually being asked for.
      page: page > 1 ? page : undefined,
    };
  }

  private run(query: QuestionSearchQuery) {
    const requested = query.page ?? 1;
    return this.service.search(query).pipe(
      map((res) => ({ ok: true as const, res, requested })),
      catchError((err: unknown) => of({ ok: false as const, err, requested })),
    );
  }

  private apply(
    outcome:
      | {
          ok: true;
          res: {
            items: readonly QuestionSearchResult[];
            page?: number;
            per?: number;
            total?: number | null;
          };
          requested: number;
        }
      | { ok: false; err: unknown; requested: number },
  ): void {
    if (!outcome.ok) {
      // Fail loud. The list this replaces set a loading flag to false here and
      // said nothing, which rendered a 500 as an empty inventory.
      this._state.set({
        status: 'error',
        errorKey: this.errorMessageKey(outcome.err),
      });
      return;
    }
    this._state.set({
      status: 'success',
      items: outcome.res.items,
      page: outcome.res.page ?? outcome.requested,
      per: outcome.res.per ?? this.per(),
      total: outcome.res.total ?? null,
    });
    // Fresh rows carry the server's reuse_visibility; stale echoes would
    // otherwise outrank newer truth forever.
    this._audienceOverrides.set({});
  }

  private errorMessageKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status === 401 || e.status === 403) {
        return 'aplus.studio_atoms.error_unauthorised';
      }
      if (e.status >= 500) return 'aplus.studio_atoms.error_upstream';
    }
    return 'aplus.studio_atoms.error_generic';
  }
}
