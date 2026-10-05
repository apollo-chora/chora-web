/**
 * UnifiedReviewListComponent — A+ unified authoring canvas (CHO-1826 U4.3).
 *
 * The interleaved review + accept list for the unified authoring canvas. It
 * renders ONE row per {@link UnifiedReviewItem} (AI drafts and hand-authored
 * manual questions interleaved in submission order), each with a select
 * checkbox, an AI/Manual badge, the shared inline question editor, a per-row
 * title override, AI-row image-regenerate controls + citation chips, and a
 * manual-row remove button. Below the list: add-manual buttons, a mana-cost
 * preview chip, a test-set section, and the Accept CTA.
 *
 * PRESENTATIONAL ONLY — it owns NO service, NO HTTP, NO accept/selection/mana
 * logic. Every piece of state arrives via signal inputs; every interaction is
 * surfaced as an output. The parent {@link UnifiedAtomAuthoringComponent} owns
 * the items array, selection, mana tally, accept-request building and dispatch.
 *
 * Mirrors the batch-authoring review section's row layout (per-candidate editor
 * + select + title override + image regen + citations) adapted to the
 * `UnifiedReviewItem` discriminated union. It does NOT import or modify the
 * batch component.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraQuestionEditorComponent } from '../../../../../shared/components/chora-question-editor/chora-question-editor.component';
import { ChoraImageRegenControlComponent } from '../../../../../shared/components/chora-image-regen-control/chora-image-regen-control.component';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';
import type { EditableQuestion } from '../../../../../shared/components/chora-question-editor/chora-question-editor.model';
import type {
  QuestionCitation,
  QuestionDraftCandidate,
} from '../atom-authoring.model';
import {
  MANA_PER_IMAGE_QUESTION,
  MANA_PER_TEXT_QUESTION,
  type ManaPreview,
  type UnifiedReviewItem,
  type UnifiedTestSetConfig,
} from './unified-review.model';

@Component({
  selector: 'chora-unified-review-list',
  standalone: true,
  imports: [
    TranslatePipe,
    ChoraQuestionEditorComponent,
    ChoraQuestionImageComponent,
    ChoraImageRegenControlComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  templateUrl: './unified-review-list.component.html',
  styleUrl: './unified-review-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UnifiedReviewListComponent {
  // ── Inputs (parent owns ALL state) ────────────────────────────────
  /** Interleaved review rows in submission/commit order. */
  readonly items = input.required<readonly UnifiedReviewItem[]>();
  /** Indicative mana cost over the SELECTED items (parent tallies). */
  readonly manaPreview = input.required<ManaPreview>();
  /** True while an accept is in flight — disables the Accept CTA. */
  readonly busy = input<boolean>(false);
  /** Author-curated test-set composition (Lane 1c). */
  readonly testSet = input<UnifiedTestSetConfig>({ enabled: false, title: '' });
  /** Parent's accept gate (≥1 selected + valid edits + title when test-set on). */
  readonly canAccept = input<boolean>(false);
  /**
   * FE-1 (#3): the parent's last accept-time failure key (or null). Rendered as
   * a `role="alert"` by the Accept CTA. The parent PRESERVES the review on a
   * failed accept, so this lets the author fix + retry without losing work.
   */
  readonly acceptError = input<string | null>(null);
  /**
   * FE-2 (#2): whether ≥2 AI candidates are selected — a topic test set needs
   * ≥2 (ADR-195 D4). When false the test-set toggle is disabled (unless already
   * on, so it can still be switched OFF) and a hint is shown. Defaults to true.
   */
  readonly canAssembleTestSet = input<boolean>(true);
  /** Show the per-image regenerate controls. AI images always render; this only
   *  gates the regenerate affordance. The parent enables it in U4.3c (it owns
   *  the regenerate orchestration via {@link regenImage} + {@link regenState}). */
  readonly allowRegen = input<boolean>(true);
  /**
   * Per-image regenerate sub-state owned by the parent, keyed `draftId|placement`
   * (the parent uses the SAME key format). Drives each control's spinner +
   * inline error. An absent key ⇒ idle, no error. See {@link regenInfo}. */
  readonly regenState = input<
    Readonly<Record<string, { regenerating: boolean; error: string | null }>>
  >({});
  /**
   * Hand-authoring-only mode (CHO-1826 review B). When true this list is the
   * standalone "By hand" surface, not the AI review: it hides the AI-framed
   * review bar ("N in review") and the test-set section (manual rows carry no
   * draft_id, so they can never populate a test set), and the Accept CTA reads
   * "Create" rather than "Accept". Defaults false (the AI review path).
   */
  readonly manualOnly = input<boolean>(false);

  // ── Outputs (parent owns ALL logic) ───────────────────────────────
  /** Toggle a row's selection — emits the row key (draftId | tempId). */
  readonly toggleSelect = output<string>();
  /** An inline editor change — the row key + the new editable question. */
  readonly editItem = output<{ key: string; edit: EditableQuestion }>();
  /** A per-row atom title override change — the row key + the new title. */
  readonly titleChange = output<{ key: string; title: string }>();
  /** Append a fresh manual row of the given question type. */
  readonly addManual = output<'mcq' | 'oe'>();
  /** Remove a manual row — emits its tempId. */
  readonly removeManual = output<string>();
  /** Regenerate an AI row's image — draftId + slot + the refined prompt. */
  readonly regenImage = output<{
    draftId: string;
    placement: 'stem' | 'answer';
    prompt: string;
  }>();
  /** Toggle the "create test set" master switch. */
  readonly setTestSetEnabled = output<boolean>();
  /** Update the test-set title. */
  readonly setTestSetTitle = output<string>();
  /** Select-all / deselect-all the review rows (parent owns the mutation). */
  readonly toggleAll = output<void>();
  /** Drag-reorder a row — emits the moved-from / moved-to array indices. */
  readonly reorder = output<{ from: number; to: number }>();
  /** A per-row test-set points change — the row key + the raw entered points
   *  (the parent clamps to [1..100]). */
  readonly pointsChange = output<{ key: string; points: number }>();
  /** Update the test-set description. */
  readonly setTestSetDescription = output<string>();
  /** Commit the selected items. */
  readonly accept = output<void>();

  /** Per-question mana tiers — drive the preview chip's breakdown labels. */
  protected readonly manaPerText = MANA_PER_TEXT_QUESTION;
  protected readonly manaPerImage = MANA_PER_IMAGE_QUESTION;

  // ── Bulk-select view-derivations (GAP #10) ─────────────────────────
  /** Count of selected rows — drives the review-bar summary. */
  readonly selectedCount = computed<number>(
    () => this.items().filter((i) => i.selected).length,
  );
  /** True when every row is selected (and there is ≥1) — flips the bulk label. */
  readonly allSelected = computed<boolean>(() => {
    const items = this.items();
    return items.length > 0 && items.every((i) => i.selected);
  });

  // ── Citations collapse/expand view-state (GAP #9) ──────────────────
  /** Per-row citation-panel expansion (pure view-state, keyed by row key). */
  private readonly _expandedCitations = signal<ReadonlySet<string>>(new Set());

  isCitationsExpanded(key: string): boolean {
    return this._expandedCitations().has(key);
  }

  toggleCitations(key: string): void {
    const next = new Set(this._expandedCitations());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this._expandedCitations.set(next);
  }

  /** Verification disposition of one citation — drives the chip badge. */
  citationState(c: QuestionCitation): 'verified' | 'unverified' | 'ai-reported' {
    if (c.verified === true) return 'verified';
    if (c.verified === false) return 'unverified';
    return 'ai-reported';
  }

  citationCount(c: QuestionDraftCandidate): number {
    return c.citations?.length ?? 0;
  }

  // ── Quality warning (GAP #7) ───────────────────────────────────────
  /** Single-mode parity: a candidate carries a residual-concern warning. */
  hasQualityWarning(c: QuestionDraftCandidate): boolean {
    return c.quality_warning === true || (c.critic_notes ?? '').trim().length > 0;
  }

  // ── Test-set points (GAP #12) ──────────────────────────────────────
  /** Current test-set-scoped points for a row key — the configured value or the
   *  uniform default of 1 (the backend clamps to [1..100] on accept). */
  pointsFor(key: string): number {
    return this.testSet().pointsByKey?.[key] ?? 1;
  }

  /** Emit a points change; blank / non-finite input is ignored so clearing the
   *  field KEEPS the prior value (the parent clamps to [1..100]). */
  onPointsInput(key: string, raw: string): void {
    if (raw.trim() === '') return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    this.pointsChange.emit({ key, points: parsed });
  }

  /** Keyboard reorder on the drag handle — ArrowUp/ArrowDown move the row one
   *  position (WCAG 2.1.1; CDK drag is pointer-only). The parent guards bounds. */
  onHandleKeydown(e: KeyboardEvent, index: number): void {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.reorder.emit({ from: index, to: index - 1 });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.reorder.emit({ from: index, to: index + 1 });
    }
  }

  /**
   * Stable row key — the AI draft's draftId or the manual row's tempId. Used
   * for `@for` tracking, per-editor testIdPrefix uniqueness, and as the key on
   * the select/edit/title outputs.
   */
  keyOf(item: UnifiedReviewItem): string {
    return item.kind === 'ai' ? item.draftId : item.tempId;
  }

  /** Short display name of a cited source (last path segment of source_file). */
  citationSourceName(c: QuestionCitation): string {
    const parts = c.source_file.split('/');
    return parts[parts.length - 1] || c.source_file;
  }

  /**
   * Per-image regenerate sub-state for one (draftId, placement) slot — feeds the
   * shared control's `regenerating` + `error` inputs. The key format MUST match
   * the parent: `draftId|placement`. Defaults to idle / no-error for an absent
   * key (no regenerate has been kicked off for that image).
   */
  regenInfo(
    draftId: string,
    placement: 'stem' | 'answer',
  ): { regenerating: boolean; error: string | null } {
    return (
      this.regenState()[draftId + '|' + placement] ?? {
        regenerating: false,
        error: null,
      }
    );
  }
}
