import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../pipes/translate.pipe';

import {
  COMPOSER_TYPE_LABEL,
  ComposerQuestionType,
  ComposerQuotaRow,
  QuestionBatchPlan,
} from './question-batch-generator.model';

/**
 * Shared mixed-type batch composer (CHO-1819 P4).
 *
 * Surface-agnostic standalone component used by BOTH A+ atom authoring and the
 * R+ assessment-authoring entry (P5). The author composes a batch as per-type
 * quota rows (e.g. 8 MCQ + 2 OE), with an "Allow AI images" master toggle that
 * reveals a per-type image cap (the AI decides WHICH questions get an image +
 * whether on the stem or the model answer — never more than the cap). The
 * total is auto-computed and bounded at `maxTotal` (default 50).
 *
 * Emits a {@link QuestionBatchPlan} whenever the composition changes; the
 * embedding surface maps it onto the backend `settings.type_plan`. The strict-
 * mode tooltip lives on the embedding surface (next to its grounding toggle),
 * not here — this component owns ONLY the type/count/image composition.
 *
 * Tablet-first, OnPush, signal-driven, WCAG 2.1 AA (labelled inputs, keyboard
 * operable, role=alert validation).
 */
@Component({
  selector: 'chora-question-batch-generator',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './question-batch-generator.component.html',
  styleUrl: './question-batch-generator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuestionBatchGeneratorComponent {
  /** Question types the author may compose with (order = add order). */
  readonly allowedTypes = input<readonly ComposerQuestionType[]>(['mcq', 'oe']);
  /** Hard ceiling on the total question count (backend `clampBatchCount`). */
  readonly maxTotal = input<number>(50);

  /** Emitted whenever the composition (rows / images toggle) changes. */
  readonly planChange = output<QuestionBatchPlan>();

  /** Per-type quota rows. Seeded with one row of the first allowed type. */
  readonly rows = signal<readonly ComposerQuotaRow[]>([
    { question_type: 'mcq', count: 5, max_images: 0 },
  ]);
  /** Master "Allow AI images" toggle — DEFAULT OFF (preserves the no-image,
   * lowest-cost default). When on, the per-type image caps appear. */
  readonly allowImages = signal<boolean>(false);

  readonly typeLabel = COMPOSER_TYPE_LABEL;

  // ── Derived ─────────────────────────────────────────────────────────
  readonly total = computed(() =>
    this.rows().reduce((sum, r) => sum + (r.count || 0), 0),
  );

  readonly valid = computed(() => {
    const rows = this.rows();
    const total = this.total();
    if (rows.length === 0) return false;
    if (total < 1 || total > this.maxTotal()) return false;
    const allow = this.allowImages();
    return rows.every(
      (r) =>
        r.count >= 1 &&
        (!allow || (r.max_images >= 0 && r.max_images <= r.count)),
    );
  });

  /** Types not yet used by a row (drives "+ add type" + per-row type options). */
  readonly availableTypes = computed<readonly ComposerQuestionType[]>(() => {
    const used = new Set(this.rows().map((r) => r.question_type));
    return this.allowedTypes().filter((t) => !used.has(t));
  });

  readonly canAddRow = computed(
    () => this.availableTypes().length > 0 && this.total() < this.maxTotal(),
  );

  constructor() {
    // Emit the plan whenever the composition changes. Images are zeroed when
    // the master toggle is off so the surface never re-derives the cap.
    effect(() => {
      const allow = this.allowImages();
      const rows = this.rows();
      const type_plan: ComposerQuotaRow[] = rows.map((r) => ({
        question_type: r.question_type,
        count: r.count,
        max_images: allow ? Math.min(r.max_images, r.count) : 0,
        // CHO-1825 — deterministic per-type image toggles ride independently of
        // the AI-decide budget (every question of the type MUST carry it).
        // Emitted only when set (proto3-omit-false parity) so an unillustrated
        // plan keeps its byte-identical 3-key shape.
        ...(r.image_for_stem ? { image_for_stem: true } : {}),
        ...(r.image_for_answer ? { image_for_answer: true } : {}),
      }));
      this.planChange.emit({
        type_plan,
        total: this.total(),
        allow_images: allow,
        valid: this.valid(),
      });
    });
  }

  /** Type options selectable for the row at `index` (its own type + unused). */
  typeOptionsFor(index: number): readonly ComposerQuestionType[] {
    const own = this.rows()[index]?.question_type;
    const avail = this.availableTypes();
    return own ? [own, ...avail] : avail;
  }

  addRow(): void {
    const next = this.availableTypes()[0];
    if (next === undefined) return;
    this.rows.update((rows) => [
      ...rows,
      { question_type: next, count: 1, max_images: 0 },
    ]);
  }

  removeRow(index: number): void {
    this.rows.update((rows) => rows.filter((_, i) => i !== index));
  }

  setRowType(index: number, value: string): void {
    const next = value as ComposerQuestionType;
    if (!this.allowedTypes().includes(next)) return;
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, question_type: next } : r)),
    );
  }

  setRowCount(index: number, value: string | number): void {
    const n = Math.trunc(Number(value));
    const count = Number.isFinite(n) && n >= 1 ? n : 1;
    this.rows.update((rows) =>
      rows.map((r, i) =>
        i === index
          ? { ...r, count, max_images: Math.min(r.max_images, count) }
          : r,
      ),
    );
  }

  setRowMaxImages(index: number, value: string | number): void {
    const n = Math.trunc(Number(value));
    this.rows.update((rows) =>
      rows.map((r, i) => {
        if (i !== index) return r;
        const max = Number.isFinite(n) && n >= 0 ? Math.min(n, r.count) : 0;
        return { ...r, max_images: max };
      }),
    );
  }

  toggleAllowImages(checked: boolean): void {
    this.allowImages.set(checked);
  }

  /** CHO-1825 — force a stem image on EVERY question of the row's type. */
  toggleRowImageStem(index: number, checked: boolean): void {
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, image_for_stem: checked } : r)),
    );
  }

  /** CHO-1825 — force a model-answer image on EVERY question of the row's type. */
  toggleRowImageAnswer(index: number, checked: boolean): void {
    this.rows.update((rows) =>
      rows.map((r, i) => (i === index ? { ...r, image_for_answer: checked } : r)),
    );
  }
}
