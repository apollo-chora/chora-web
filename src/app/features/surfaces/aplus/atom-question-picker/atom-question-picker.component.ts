/**
 * AtomQuestionPickerComponent — A+ X.1 (ADR-155 D1) — multi-select revamp 2026-05-16.
 *
 * Standalone OnPush reusable component embedded inside the test-set editor
 * (X.2). Drives `GET /api/atoms/questions/search` with debounced free-text +
 * multi-value filters + cursor pagination per ADR-155 D4.
 *
 * 2026-05-16 UX revamp:
 * - Per-row checkbox; multi-select state persists across pagination.
 * - Click row body → expand accordion with full stem + meta.
 * - "+" quick-add button per row (single-add, like before).
 * - Sort dropdown (created_at:desc default, plus 4 alternatives).
 * - Bulk-action bar appears when selection > 0; emits `pickedQuestions[]`
 *   on "Add N selected" click + auto-clears selection.
 *
 * Outputs:
 * - `pickedQuestion: QuestionRef` — single-add (quick "+" button or
 *   legacy click pattern; back-compat for hosts that don't bind
 *   `pickedQuestions`).
 * - `pickedQuestions: readonly QuestionRef[]` — bulk-add from selection.
 *
 * Per chora-web CLAUDE.md: standalone + OnPush + signals + @if/@for +
 * data-testid + BFF-only HTTP.
 */
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, fromEvent, of } from 'rxjs';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
} from 'rxjs/operators';

import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TranslateService } from '../../../../core/services/translate.service';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time.pipe';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';
import { AtomQuestionPickerService } from './atom-question-picker.service';
import type {
  AtomProjection,
  AuthorQuestionImages,
} from '../test-set-editor/test-set-editor.model';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT,
  PAGE_SIZE_OPTIONS,
  hasMorePages,
  orphanedFrom,
  toQuestionRef,
  type AtomState,
  type PageSize,
  type PickerSource,
  type QuestionPickerLoadState,
  type QuestionRef,
  type QuestionSearchQuery,
  type QuestionSearchResult,
  type QuestionType,
} from './atom-question-picker.model';

/** Internal query trigger payload. */
interface SearchTrigger {
  readonly query: QuestionSearchQuery;
  readonly append: boolean;
}

/**
 * Minimal CLDR-`one`/`other` ICU plural resolver — `{count, plural, one {# …}
 * other {# …}}` (`#` = the count). This app's ngx-translate build ships no
 * MessageFormat compiler (the translate pipe only substitutes `{{token}}`), so
 * — mirroring the rplus `resolveUsagePlural` precedent — the plural is resolved
 * here rather than pulling in an ICU dependency. A non-ICU input (e.g. the raw
 * key when translations aren't loaded in a unit test) still degrades to the
 * bare count so the number is never lost.
 */
export function resolvePlural(template: string, count: number): string {
  const icu = template.match(/^\{count,\s*plural,\s*(.*)\}$/s);
  if (!icu) {
    if (template.includes('#')) return template.replace(/#/g, String(count));
    if (template.includes('{count}')) {
      return template.replace(/\{count\}/g, String(count));
    }
    return String(count);
  }
  const branches: { readonly selector: string; readonly text: string }[] = [];
  const branchRe = /(=\d+|one|other)\s*\{([^{}]*)\}/g;
  let bm: RegExpExecArray | null;
  while ((bm = branchRe.exec(icu[1])) !== null) {
    branches.push({ selector: bm[1], text: bm[2] });
  }
  const exact = branches.find((b) => b.selector === `=${count}`);
  const one =
    count === 1 ? branches.find((b) => b.selector === 'one') : undefined;
  const other = branches.find((b) => b.selector === 'other');
  const chosen = (exact ?? one ?? other)?.text ?? template;
  return chosen
    .replace(/#/g, String(count))
    .replace(/\{count\}/g, String(count));
}

@Component({
  selector: 'chora-aplus-atom-question-picker',
  standalone: true,
  imports: [FormsModule, TranslatePipe, UpperCasePipe, RelativeTimePipe, ChoraQuestionImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './atom-question-picker.component.html',
  styleUrl: './atom-question-picker.component.scss',
})
export class AtomQuestionPickerComponent implements OnInit, OnDestroy {
  private readonly pickerService = inject(AtomQuestionPickerService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translate = inject(TranslateService);

  /** Single-add output — emitted on the per-row "+" quick-add button. */
  readonly pickedQuestion = output<QuestionRef>();

  /** Bulk-add output — emitted on the "Add N selected" CTA in the bulk bar. */
  readonly pickedQuestions = output<readonly QuestionRef[]>();

  /** Page-size enum exposed to the template for the <select>. */
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  // ── Filter / query state ──────────────────────────────────────────
  readonly searchQuery = signal('');
  readonly questionTypes = signal<readonly QuestionType[]>([]);
  readonly topicNodeIds = signal<readonly string[]>([]);
  readonly tags = signal<readonly string[]>([]);
  readonly stateFilter = signal<readonly AtomState[]>([]);
  /**
   * Which entitlement the picker opens on. The concept-attach drawer passes
   * 'enrolled' (ADR-243): a learner attaching to their own map wants the atoms
   * they are already studying, and the reuse-entitled corpus admits almost
   * nothing for them (measured: 2 of 367). Authoring hosts leave the default.
   */
  readonly defaultSource = input<PickerSource>('all');
  /**
   * ADR-243 D2/D6, whether this host may offer the ENROLMENT source at all.
   *
   * Default FALSE, and the default is the point. This picker is shared with
   * hosts that perform REUSE acts (test-set editor, A+ and R+ question banks,
   * the R+ quiz builder), and ADR-243 scopes the enrolment entitlement to
   * private-map attachment ONLY: ADR-229's consent gate still governs every one
   * of those. Offering "atoms from your courses" while building a test set
   * would answer the reuse question with the private-map answer and put an
   * author's `private` atom into shareable work without their consent.
   *
   * Fail-closed, so a host added later that never heard of this input gets the
   * reuse-only picker rather than an entitlement leak.
   */
  readonly offerEnrolledSource = input<boolean>(false);
  readonly sourceFilter = signal<PickerSource>('all');
  readonly pageSize = signal<PageSize>(DEFAULT_PAGE_SIZE);
  readonly sort = signal<string>(DEFAULT_SORT);

  // ── Multi-select + expand state (persists across pagination) ──────
  private readonly _selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly selectedIds = this._selectedIds.asReadonly();
  readonly selectedCount = computed(() => this._selectedIds().size);

  private readonly _expandedIds = signal<ReadonlySet<string>>(new Set());
  readonly expandedIds = this._expandedIds.asReadonly();

  /**
   * Lazy-fetched atom payloads, keyed by atom id. Populated when a row
   * is expanded for the first time. Subsequent expand/collapse cycles
   * re-use the cached payload — no re-fetch.
   */
  private readonly _atomPayloads = signal<
    Readonly<Record<string, AtomProjection | { error: true }>>
  >({});
  readonly atomPayloads = this._atomPayloads.asReadonly();

  /**
   * Lazy-fetched MCQ illustration URLs (CHO-1638), keyed by atom id. The
   * learner-safe projection above carries no images, so on first expand of
   * an MCQ row we additionally fetch the AUTHOR question projection and
   * cache both the question + model-answer illustration here.
   */
  private readonly _questionImages = signal<
    Readonly<Record<string, AuthorQuestionImages>>
  >({});
  readonly questionImages = this._questionImages.asReadonly();

  // ── Discriminated load state ──────────────────────────────────────
  private readonly _loadState = signal<QuestionPickerLoadState>({
    status: 'loading',
  });
  readonly loadState = this._loadState.asReadonly();

  readonly isLoading = computed(() => this._loadState().status === 'loading');
  readonly isError = computed(() => this._loadState().status === 'error');
  readonly errorKey = computed(() => {
    const s = this._loadState();
    return s.status === 'error' ? s.error : '';
  });

  /** Rendered result rows (accumulates across pages on Load More). */
  readonly results = computed<readonly QuestionSearchResult[]>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.results : [];
  });

  readonly hasResults = computed(() => this.results().length > 0);

  /** 1-based index of the last page loaded (rows accumulate on Load more). */
  readonly currentPage = computed<number>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.page : 1;
  });

  /**
   * Whether a further page exists. Derived from `page * per < total` — the
   * `total` the BE sends on every response. This read used to be
   * `nextPageToken !== null` against a token the BE never sent, so it was
   * permanently false and the Load-more control could not appear at all.
   */
  readonly hasNextPage = computed(() => {
    const s = this._loadState();
    if (s.status !== 'success') return false;
    return hasMorePages(s.page, s.per, s.total);
  });

  readonly totalCount = computed<number | null>(() => {
    const s = this._loadState();
    return s.status === 'success' ? s.total : null;
  });

  /**
   * Pluralised total-count label ("1 question" / "12 questions"). Fixes the
   * un-pluralised "1 questions" (CHO-2158-FE) — resolves the CLDR ICU template
   * client-side via `resolvePlural` (this app's ngx-translate ships no ICU
   * compiler). `null` total → empty (the header @if hides the count).
   */
  readonly countLabel = computed<string>(() => {
    const n = this.totalCount();
    if (n === null) return '';
    return resolvePlural(
      this.translate.instant('aplus.atom_question_picker.count_label'),
      n,
    );
  });

  // ── Search trigger pipeline (debounced 300ms for user-driven changes) ──
  private readonly trigger$ = new Subject<SearchTrigger>();

  ngOnInit(): void {
    // Adopt the host's entitlement default BEFORE the initial search fires, so
    // the concept drawer's first request already asks the right question rather
    // than fetching the reuse corpus and then re-fetching. A host that asks to
    // OPEN on the enrolment source without offering it falls back to the reuse
    // corpus: the same fail-closed rule setSource applies, enforced here too so
    // the mount path cannot slip past it.
    const wanted = this.defaultSource();
    this.sourceFilter.set(
      wanted === 'enrolled' && !this.offerEnrolledSource() ? 'all' : wanted,
    );

    this.trigger$
      .pipe(
        debounceTime(300),
        distinctUntilChanged((a, b) =>
          a.append === b.append && this.queryKey(a.query) === this.queryKey(b.query),
        ),
        switchMap((t) => this.runSearch(t)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((outcome) => this.applyOutcome(outcome));

    // Kick off initial search SYNCHRONOUSLY (bypasses the debounce, so the
    // first request fires immediately on mount — matches the component
    // contract verified in atom-question-picker.component.spec.ts).
    this.runSearchSync({ query: this.composeQuery(), append: false });

    // Self-heal a left-open picker. The candidate list is fetched at open-time
    // only (above); if the author authors a NEW question in another tab/route
    // and returns to a still-open picker, the list would otherwise stay stale
    // ("I created a question but it isn't in the bank picker"). Re-fetch the
    // first page whenever the tab regains visibility — composeQuery() reads the
    // live filter/sort/query signals (preserved) and the multi-select survives
    // (separate id-state); pagination resets to page 1, where a newly-authored
    // question (newest-first default) appears. Mirrors the visibility-driven
    // refresh in core/realtime/notification.service.ts.
    fromEvent(document, 'visibilitychange')
      .pipe(
        filter(() => document.visibilityState === 'visible'),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.refreshOnReentry());
  }

  ngOnDestroy(): void {
    this.trigger$.complete();
  }

  // ═════════════════════════════════════════════════════════════════════
  // Event handlers
  // ═════════════════════════════════════════════════════════════════════

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.fireSearch(false);
  }

  onPageSizeChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const parsed = Number(raw) as PageSize;
    if (PAGE_SIZE_OPTIONS.includes(parsed)) {
      this.pageSize.set(parsed);
      this.fireSearch(false);
    }
  }

  toggleQuestionTypeChip(type: QuestionType): void {
    const current = this.questionTypes();
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    this.questionTypes.set(next);
    this.fireSearch(false);
  }

  /** Source filter (ux_unified_atom_picker.md) — mine / saved / all. */
  setSource(src: PickerSource): void {
    // The enrolment entitlement is host-gated (see offerEnrolledSource). The
    // chip is the only UI path to it, so this guard exists for the programmatic
    // caller: a reuse host must not be able to change WHICH entitlement question
    // is being asked, by any route.
    if (src === 'enrolled' && !this.offerEnrolledSource()) return;
    this.sourceFilter.set(src);
    this.fireSearch(false);
  }

  isSourceActive(src: PickerSource): boolean {
    return this.sourceFilter() === src;
  }

  isQuestionTypeActive(type: QuestionType): boolean {
    return this.questionTypes().includes(type);
  }

  loadMore(): void {
    if (!this.hasNextPage()) return;
    const next = this.currentPage() + 1;
    // Paging should NOT be debounced — append immediately.
    this.runSearchSync({
      query: this.composeQuery(next),
      append: true,
    });
  }

  onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.sort.set(value);
    this.fireSearch(false);
  }

  // ── Selection (multi-select; persists across pagination) ──────────
  isSelected(id: string): boolean {
    return this._selectedIds().has(id);
  }

  toggleSelected(id: string): void {
    const next = new Set(this._selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this._selectedIds.set(next);
  }

  clearSelection(): void {
    this._selectedIds.set(new Set());
  }

  emitBulkAdd(): void {
    const selectedSet = this._selectedIds();
    if (selectedSet.size === 0) return;
    // Resolve selected IDs against currently-loaded rows (selection is
    // ID-scoped; if a paginated row is in the selection but not in
    // the current results window, it's still in the Set — but we can
    // only emit refs for rows we've actually loaded since the BFF
    // doesn't have a "fetch by ids[]" endpoint here. v1: emit only
    // currently-loaded rows that are selected. v2: bulk-fetch by ids.
    const refs = this.results()
      .filter((r) => selectedSet.has(r.id))
      .map(toQuestionRef);
    if (refs.length === 0) return;
    this.pickedQuestions.emit(refs);
    this.clearSelection();
  }

  // ── Expansion (accordion) ─────────────────────────────────────────
  isExpanded(id: string): boolean {
    return this._expandedIds().has(id);
  }

  toggleExpanded(id: string): void {
    const next = new Set(this._expandedIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Lazy-fetch the atom projection on first expand. Cached
      // thereafter; subsequent expand/collapse cycles reuse it.
      const cache = this._atomPayloads();
      if (!(id in cache)) {
        this.pickerService
          .getAtomProjection(id)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (atom) => {
              this._atomPayloads.set({ ...this._atomPayloads(), [id]: atom });
              // CHO-1638 — the learner-safe projection has no images; pull the
              // author question projection for the illustrations (MCQ only).
              const qid = atom.mcq_payload?.question_id;
              if (qid && !(id in this._questionImages())) {
                this.pickerService
                  .getQuestionImages(id, qid)
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe({
                    next: (imgs) => {
                      if (!imgs.image_url && !imgs.answer_image_url) return;
                      this._questionImages.set({
                        ...this._questionImages(),
                        [id]: imgs,
                      });
                    },
                    error: () => {
                      // Fail-soft — a missing image just hides the figure.
                    },
                  });
              }
            },
            error: () => {
              this._atomPayloads.set({
                ...this._atomPayloads(),
                [id]: { error: true },
              });
            },
          });
      }
    }
    this._expandedIds.set(next);
  }

  /** Get the cached projection for a row (post-expand). */
  payloadFor(id: string): AtomProjection | { error: true } | undefined {
    return this._atomPayloads()[id];
  }

  /** Convenience type guard for the template. */
  isPayloadReady(id: string): boolean {
    const p = this._atomPayloads()[id];
    return p !== undefined && !('error' in p);
  }
  isPayloadError(id: string): boolean {
    const p = this._atomPayloads()[id];
    return p !== undefined && 'error' in p;
  }
  payloadAtom(id: string): AtomProjection | null {
    const p = this._atomPayloads()[id];
    if (!p || 'error' in p) return null;
    return p;
  }

  /** Question illustration URL for an expanded row (CHO-1638), or null. */
  questionImageFor(id: string): string | null {
    return this._questionImages()[id]?.image_url ?? null;
  }

  /** Model-answer illustration URL for an expanded row (CHO-1638), or null. */
  answerImageFor(id: string): string | null {
    return this._questionImages()[id]?.answer_image_url ?? null;
  }

  // ── ADR-229 WS-2 consent-gate affordances (CHO-2133) ──────────────

  /**
   * Orphan-edition provenance for a picker row OR an expanded atom payload
   * (Amendment A1.3 truthfulness) — the original atom id when it is a
   * frozen "no longer shared" orphan edition, else null. Coalesces
   * snake_case + camelised bridge variants; absence is normal (field is
   * additive, CHO-2132 lane).
   */
  orphanedFrom(row: {
    readonly orphaned_from_atom_id?: string | null;
    readonly orphanedFromAtomId?: string | null;
  }): string | null {
    return orphanedFrom(row);
  }

  /**
   * i18n key for a row's provenance badge. The server stamps WHY the row
   * is usable (mine > saved > granted > tenant) — the badge says so
   * truthfully instead of a bare mine/saved binary.
   */
  /**
   * ADR-243 D2, the label map is TOTAL over the wire, not over the union type.
   *
   * The parameter is `string | undefined` rather than the narrowed union on
   * purpose: at runtime this value came off an HTTP response and TypeScript
   * cannot police it. A server that adds a reason this build has never heard of
   * (the deferred `friends` audience is the concrete candidate) used to fall off
   * the end of an exhaustive switch and return `undefined`, which the translate
   * pipe renders as an empty string, a silently blank chip, which is exactly
   * what D2 forbids: "an unlabelled or unknown-labelled row is a defect, never a
   * silently blank chip". The badge is now unconditional and an unrecognised or
   * absent reason says so out loud, because a visibly odd label is a bug someone
   * reports, while blank space is a bug nobody sees.
   */
  sourceBadgeKey(source: string | undefined): string {
    switch (source) {
      case 'mine':
        return 'aplus.atom_question_picker.badge_mine';
      case 'saved':
        return 'aplus.atom_question_picker.badge_saved';
      case 'granted':
        return 'aplus.atom_question_picker.badge_granted';
      case 'tenant':
        return 'aplus.atom_question_picker.badge_tenant';
      case 'enrolled':
        // ADR-243 D2: a DIFFERENT entitlement model from the four above, so it
        // gets its own badge. Never let it read as just another reuse source.
        return 'aplus.atom_question_picker.badge_enrolled';
      default:
        return 'aplus.atom_question_picker.badge_unknown_source';
    }
  }

  /** The `data-source` attribute value, so an unlabelled row is greppable in
   *  the DOM rather than merely invisible. */
  sourceAttr(source: string | undefined): string {
    return source && source.length > 0 ? source : 'unknown';
  }

  /**
   * ADR-243 D7, an empty source states its OWN reason.
   *
   * The two sources are empty for unrelated reasons and the honest sentence
   * differs: Source A is empty because the learner is not enrolled in anything
   * carrying a studiable atom, and Source B is empty because almost no author
   * has opted an atom into tenant-wide reuse (measured 2 of 367). The generic
   * copy ends with "or author a new one", which is advice for an author looking
   * at the reuse corpus and is simply wrong for a learner with no enrolments:
   * authoring an atom would not put it on their learning path.
   */
  emptyKey(): string {
    return this.sourceFilter() === 'enrolled'
      ? 'aplus.atom_question_picker.empty_enrolled'
      : 'aplus.atom_question_picker.empty';
  }

  // ── Single-add quick action (per-row "+" button) ──────────────────
  quickAdd(row: QuestionSearchResult): void {
    this.pickedQuestion.emit(toQuestionRef(row));
  }

  // Back-compat shim — legacy click pattern.
  pickRow(row: QuestionSearchResult): void {
    this.pickedQuestion.emit(toQuestionRef(row));
  }

  retry(): void {
    // Retry bypasses the debounce — user explicitly clicked.
    this.runSearchSync({ query: this.composeQuery(), append: false });
  }

  /**
   * Re-fetch the first page when the tab regains visibility. Keeps a left-open
   * picker fresh so a question authored elsewhere shows up without a manual
   * reload. Bypasses the debounce (like retry/initial mount); the active
   * query/filters/sort are preserved and the multi-select survives, with
   * pagination reset to page 1 where the newest question now appears.
   */
  private refreshOnReentry(): void {
    this.runSearchSync({ query: this.composeQuery(), append: false });
  }

  // ═════════════════════════════════════════════════════════════════════
  // Internals
  // ═════════════════════════════════════════════════════════════════════

  private fireSearch(append: boolean, page?: number): void {
    if (!append) {
      this._loadState.set({ status: 'loading' });
    }
    this.trigger$.next({ query: this.composeQuery(page), append });
  }

  /** Synchronous (no-debounce) search — used for initial mount + retry + loadMore. */
  private runSearchSync(trigger: SearchTrigger): void {
    if (!trigger.append) {
      this._loadState.set({ status: 'loading' });
    }
    this.runSearch(trigger)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((outcome) => this.applyOutcome(outcome));
  }

  private runSearch(t: SearchTrigger) {
    // The requested page rides the query itself, so there is one source of
    // truth for "which page is this outcome for" rather than a parallel field
    // that can drift out of step with what was actually asked.
    const page = t.query.page ?? 1;
    return this.pickerService.search(t.query).pipe(
      map((res) => ({ ok: true as const, res, append: t.append, page })),
      catchError((err: unknown) =>
        of({ ok: false as const, err, append: t.append, page }),
      ),
    );
  }

  private applyOutcome(
    outcome:
      | {
          ok: true;
          res: {
            items: readonly QuestionSearchResult[];
            page?: number;
            per?: number;
            total?: number | null;
          };
          append: boolean;
          page: number;
        }
      | { ok: false; err: unknown; append: boolean; page: number },
  ): void {
    if (outcome.ok) {
      const prior = outcome.append ? this.results() : [];
      const merged = [...prior, ...outcome.res.items];
      // Trust the server's echo of what it actually served; fall back to what
      // we asked for only if the field is missing.
      this._loadState.set({
        status: 'success',
        results: merged,
        page: outcome.res.page ?? outcome.page,
        per: outcome.res.per ?? this.pageSize(),
        total: outcome.res.total ?? null,
      });
    } else {
      this._loadState.set({
        status: 'error',
        error: this.errorMessageKey(outcome.err),
      });
    }
  }

  private composeQuery(page?: number): QuestionSearchQuery {
    return {
      q: this.searchQuery().trim() || undefined,
      // ADR-155 Lane A's chora-delivery `addQuestion` handler accepts
      // only `mcq` / `oe` types (Phase X demo simplification — `essay`
      // and `outline` atoms are NOT addable to a test-set). Default
      // to filtering both supported types when no chip is active so
      // the picker never surfaces an atom the user can't add. Chip
      // clicks narrow further (mcq-only / oe-only).
      question_type:
        this.questionTypes().length > 0
          ? this.questionTypes()
          : (['mcq', 'oe'] as readonly QuestionType[]),
      topic_node_id: this.topicNodeIds().length > 0 ? this.topicNodeIds() : undefined,
      tag: this.tags().length > 0 ? this.tags() : undefined,
      state: this.stateFilter().length > 0 ? this.stateFilter() : undefined,
      source: this.sourceFilter(),
      sort: this.sort(),
      per: this.pageSize(),
      page,
    };
  }

  private queryKey(q: QuestionSearchQuery): string {
    return JSON.stringify({
      q: q.q ?? '',
      qt: [...(q.question_type ?? [])].sort(),
      tn: [...(q.topic_node_id ?? [])].sort(),
      tg: [...(q.tag ?? [])].sort(),
      st: [...(q.state ?? [])].sort(),
      src: q.source ?? 'all',
      sort: q.sort,
      per: q.per,
      page: q.page ?? 1,
    });
  }

  private errorMessageKey(err: unknown): string {
    const e = err as { status?: number };
    if (typeof e?.status === 'number') {
      if (e.status >= 500) return 'aplus.atom_question_picker.error_upstream';
      if (e.status === 401 || e.status === 403) {
        return 'aplus.atom_question_picker.error_unauthorised';
      }
    }
    return 'aplus.atom_question_picker.error_generic';
  }
}
