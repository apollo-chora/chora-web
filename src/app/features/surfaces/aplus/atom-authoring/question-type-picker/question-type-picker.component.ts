/**
 * QuestionTypePickerComponent — Phase D 16-tile picker.
 *
 * Server-data-driven from `GET /api/atoms/question-types` (registry
 * loaded by Phase C `AtomAuthoringService.loadQuestionTypes()`). The
 * tile set is NOT duplicated client-side; this component renders whatever
 * the BE returns. Currently 2 enabled (`mcq` + `oe`) + 14 `reserved_*`
 * placeholders rendered greyed-out as "Coming soon".
 *
 * A1 design refinement (CJ#1 smoke #4 — 2026-05-17): the 14 reserved
 * tiles dominated the vertical canvas above the editor. We now split:
 *   - primary group (enabled tiles) → prominent 2-tile row at top;
 *   - reserved tiles → collapsed inside a "Coming soon" disclosure that
 *     expands on click via a real <button> with aria-expanded +
 *     aria-controls. Default state: collapsed.
 * See `docs/m13/cj1-ui-design-refinement-plan-2026-05-17.md` §"A+ Atom
 * Authoring".
 *
 * Inputs:
 *   types         — readonly QuestionTypeRegistryEntry[] (required)
 *   selectedType  — QuestionType | null (default null)
 *   disabled      — boolean (default false) — global lock for the edit
 *                   screen where `type` is immutable post-create per BE
 *
 * Outputs:
 *   typeSelected  — QuestionType when an ENABLED tile is activated
 *
 * A11y: container `role="radiogroup"`, each tile `role="radio"` with
 * `aria-checked` + `aria-disabled` + `aria-label`. Disabled tiles get
 * `tabindex="-1"` so they're out of the tab order. Click + Enter +
 * Space all activate (mouse + keyboard parity per chora-web CLAUDE.md
 * §10 WCAG 2.1 AA mandate). Disclosure toggle is a real <button> with
 * `aria-expanded` + `aria-controls` pointing at the panel id.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  QuestionType,
  QuestionTypeOption,
} from '../atom-authoring.model';

@Component({
  selector: 'chora-question-type-picker',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './question-type-picker.component.html',
  styleUrl: './question-type-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionTypePickerComponent {
  readonly types = input.required<readonly QuestionTypeOption[]>();
  readonly selectedType = input<QuestionType | null>(null);
  readonly disabled = input<boolean>(false);

  readonly typeSelected = output<QuestionType>();

  /** A1 disclosure state — defaults to collapsed (per design plan). */
  readonly comingSoonExpanded = signal<boolean>(false);

  /** Stable id for `aria-controls` ↔ panel `id` wiring. */
  readonly comingSoonPanelId = 'question-type-picker-coming-soon-panel';

  /** Primary tiles = enabled set (MCQ + OE today). */
  readonly primaryTypes = computed<readonly QuestionTypeOption[]>(() =>
    this.types().filter((t) => t.enabled),
  );

  /** Reserved tiles = disabled set (the 14 "Coming soon" placeholders). */
  readonly reservedTypes = computed<readonly QuestionTypeOption[]>(() =>
    this.types().filter((t) => !t.enabled),
  );

  toggleComingSoon(): void {
    this.comingSoonExpanded.update((open) => !open);
  }

  /** Per-tile activation gate — both the registry flag and the global lock. */
  isActive(entry: QuestionTypeOption): boolean {
    return entry.enabled && !this.disabled();
  }

  /** ARIA + visual selected state. */
  isSelected(entry: QuestionTypeOption): boolean {
    return entry.code === this.selectedType();
  }

  /** tabindex helper — disabled tiles are out of the tab order. */
  tabIndex(entry: QuestionTypeOption): number {
    return this.isActive(entry) ? 0 : -1;
  }

  onTileClick(entry: QuestionTypeOption): void {
    if (!this.isActive(entry)) return;
    this.typeSelected.emit(entry.code);
  }

  onTileKeydown(event: KeyboardEvent, entry: QuestionTypeOption): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.onTileClick(entry);
  }

  /**
   * 2-3 char glyph for the icon box. Active codes like "mcq"/"oe" pass
   * through; reserved_* placeholders get the prefix stripped so the
   * 36×36 icon doesn't overflow with "RESERVED_DRAG_DROP" etc.
   */
  displayCode(entry: QuestionTypeOption): string {
    const code = entry.code as string;
    if (entry.enabled) return code;
    return code.replace(/^reserved_/i, '').slice(0, 3);
  }
}
