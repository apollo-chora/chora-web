/**
 * OeFieldsComponent — Phase F editable Open-Ended form (HITL edit surface).
 *
 * Renders the editable OE content for the atom-authoring screen:
 * stem + model_answer + optional rubric criteria (0..N) + optional
 * min/max response chars + optional grader_tier. Same controlled-
 * component pattern as `McqFieldsComponent`: the parent passes
 * `initialContent` once (or on identity change) and consumes
 * `contentChanged` + `validityChanged` to drive Save Draft / Publish.
 *
 * Inputs / outputs / lifecycle mirror Phase E exactly so the parent
 * can use either component interchangeably depending on the chosen
 * question_type.
 *
 * Validity (drives publish CTA):
 *   - prompt non-empty trimmed
 *   - model_answer non-empty trimmed
 *   - if min AND max chars are both set: min ≤ max
 *
 * Rubric criteria are 0..N optional rows. New criterion_id minted
 * via `crypto.randomUUID()` for stable PATCH targeting.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';
import type {
  OeRubricCriterion,
  OpenEndedContent,
} from '../atom-authoring.model';

export interface ModelAnswerRequestPayload {
  readonly regenerate: boolean;
}

@Component({
  selector: 'chora-oe-fields',
  standalone: true,
  imports: [TranslatePipe, ChoraQuestionImageComponent],
  templateUrl: './oe-fields.component.html',
  styleUrl: './oe-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OeFieldsComponent {
  readonly initialContent = input.required<OpenEndedContent>();
  readonly readonly = input<boolean>(false);
  /**
   * Phase I.2 — when non-null, the question has been saved at least once,
   * unlocking `POST .../questions/{question_id}/ai-model-answer-jobs`
   * (Path 2 / model-answer fill-in). Null on first authoring.
   */
  readonly existingQuestionId = input<string | null>(null);
  /** True when the parent is mid-flight on a model-answer AI call. */
  readonly modelAnswerInFlight = input<boolean>(false);

  readonly contentChanged = output<OpenEndedContent>();
  readonly validityChanged = output<boolean>();
  readonly modelAnswerRequested = output<ModelAnswerRequestPayload>();

  /** FE-only `kind` tag — preserved across edits. */
  private readonly kind = signal<OpenEndedContent['kind']>('manual');
  readonly prompt = signal<string>('');
  readonly modelAnswer = signal<string>('');
  readonly rubricCriteria = signal<readonly OeRubricCriterion[]>([]);
  readonly minResponseChars = signal<number | null>(null);
  readonly maxResponseChars = signal<number | null>(null);
  readonly graderTier = signal<OpenEndedContent['oe_payload']['grader_tier']>(null);

  /**
   * Generated diagram/scene image URL for this candidate (W8 image-gen),
   * surfaced off the existing `initialContent` input. Display-only — not
   * part of the editable draft, so it reads straight off the input rather
   * than a local signal. Falsy/absent → the template renders nothing.
   * The contract carries one `image_url` per candidate, so it renders once
   * near the stem (see model TODO for a future distinct answer-image).
   */
  readonly imageUrl = computed<string | undefined>(
    () => this.initialContent().image_url,
  );

  /**
   * Generated MODEL-ANSWER image URL (W8 AUTHOR-OPT-IN, 2nd slot), surfaced
   * off the existing `initialContent` input. Display-only — reads straight
   * off the input (not part of the editable draft), mirroring `imageUrl`
   * above. Falsy/absent → the template renders nothing. Rendered in a
   * second slot after the model-answer textarea (resolves the prior TODO).
   */
  readonly answerImageUrl = computed<string | undefined>(
    () => this.initialContent().answer_image_url,
  );

  /** Sum of rubric criterion weights (0..1 fractions). 0 when no criteria. */
  readonly rubricWeightSum = computed<number>(() =>
    this.rubricCriteria().reduce(
      (acc, c) => acc + (Number.isFinite(c.weight) ? c.weight : 0),
      0,
    ),
  );
  /** Sum as a rounded percent for display. */
  readonly rubricWeightPercent = computed<number>(() =>
    Math.round(this.rubricWeightSum() * 100),
  );
  /**
   * Rubric weights are 0..1 fractions that the backend multiplies ×100 and
   * requires to sum to exactly 100. Gate the form so authors can't submit a
   * sum ≠ 100% (which previously 400'd with a misleading "check required
   * fields" alert — bug #2-A, 2026-06-03). Vacuously true when no criteria.
   */
  readonly rubricWeightsValid = computed<boolean>(() => {
    if (this.rubricCriteria().length === 0) return true;
    return Math.abs(this.rubricWeightSum() - 1) < 0.001;
  });

  readonly isValid = computed<boolean>(() => {
    if (this.prompt().trim().length === 0) return false;
    if (this.modelAnswer().trim().length === 0) return false;
    const min = this.minResponseChars();
    const max = this.maxResponseChars();
    if (min != null && max != null && min > max) return false;
    if (!this.rubricWeightsValid()) return false;
    return true;
  });

  readonly canEdit = computed<boolean>(() => !this.readonly());

  readonly canRequestModelAnswer = computed<boolean>(
    () =>
      this.existingQuestionId() !== null &&
      !this.readonly() &&
      !this.modelAnswerInFlight(),
  );

  readonly modelAnswerCtaKey = computed<string>(() =>
    this.modelAnswer().trim().length > 0
      ? 'aplus.atom_authoring.ai_assist.model_answer_regenerate'
      : 'aplus.atom_authoring.ai_assist.model_answer_generate',
  );

  /** Identity-change seed tracker. */
  private lastSeed: OpenEndedContent | null = null;
  /** Validity-transition tracker — emit only on changes (after init). */
  private lastValidity: boolean | null = null;

  constructor() {
    effect(() => {
      const seed = this.initialContent();
      if (seed === this.lastSeed) return;
      this.lastSeed = seed;
      this.kind.set(seed.kind);
      this.prompt.set(seed.prompt);
      this.modelAnswer.set(seed.oe_payload.model_answer);
      this.rubricCriteria.set(
        (seed.oe_payload.rubric ?? []).map((c) => ({ ...c })),
      );
      this.minResponseChars.set(seed.oe_payload.min_response_chars ?? null);
      this.maxResponseChars.set(seed.oe_payload.max_response_chars ?? null);
      this.graderTier.set(seed.oe_payload.grader_tier ?? null);
    });

    effect(() => {
      // W8 image-gen: carry the display-only AI-generated illustration URLs
      // through on emit so the parent's `currentContent` retains them and the
      // SAVE path persists them to the learner (mirrors mcq-fields). Without
      // this, the first content-change overwrites `currentContent` image-less.
      const seed = this.initialContent();
      const content: OpenEndedContent = {
        kind: this.kind(),
        type: 'oe',
        prompt: this.prompt(),
        oe_payload: {
          model_answer: this.modelAnswer(),
          rubric: this.rubricCriteria(),
          min_response_chars: this.minResponseChars(),
          max_response_chars: this.maxResponseChars(),
          grader_tier: this.graderTier(),
        },
        ...(seed.image_url ? { image_url: seed.image_url } : {}),
        ...(seed.answer_image_url
          ? { answer_image_url: seed.answer_image_url }
          : {}),
      };
      this.contentChanged.emit(content);
    });

    effect(() => {
      const v = this.isValid();
      if (v !== this.lastValidity) {
        this.lastValidity = v;
        this.validityChanged.emit(v);
      }
    });
  }

  // ── User intent handlers ─────────────────────────────────────────

  onPromptInput(value: string): void {
    this.prompt.set(value);
  }

  onModelAnswerInput(value: string): void {
    this.modelAnswer.set(value);
  }

  onMinCharsInput(value: string): void {
    this.minResponseChars.set(this.parseIntOrNull(value));
  }

  onMaxCharsInput(value: string): void {
    this.maxResponseChars.set(this.parseIntOrNull(value));
  }

  onGraderTierChange(value: string): void {
    if (value === '') {
      this.graderTier.set(null);
      return;
    }
    if (value === 'T1' || value === 'T2') {
      this.graderTier.set(value);
    }
  }

  onCriterionLabelInput(index: number, value: string): void {
    this.mutateCriterion(index, (c) => ({ ...c, title: value }));
  }

  onCriterionWeightInput(index: number, value: string): void {
    const weight = Number(value);
    if (!Number.isFinite(weight)) return;
    this.mutateCriterion(index, (c) => ({ ...c, weight }));
  }

  onCriterionDescriptionInput(index: number, value: string): void {
    this.mutateCriterion(index, (c) => ({ ...c, description: value }));
  }

  addCriterion(): void {
    if (!this.canEdit()) return;
    const newCriterion: OeRubricCriterion = {
      criterion_id: this.newCriterionId(),
      title: '',
      weight: 0,
    };
    this.rubricCriteria.set([...this.rubricCriteria(), newCriterion]);
  }

  removeCriterion(index: number): void {
    if (!this.canEdit()) return;
    this.rubricCriteria.set(this.rubricCriteria().filter((_, i) => i !== index));
  }

  /**
   * Scale the current criterion weights so they sum to exactly 1.0 (100%),
   * preserving their relative proportions. One-click fix for the weight-sum
   * gate (bug #2-A). No-op when there are no criteria or the sum is 0.
   */
  normalizeRubricWeights(): void {
    if (!this.canEdit()) return;
    const sum = this.rubricWeightSum();
    if (sum <= 0) return;
    this.rubricCriteria.set(
      this.rubricCriteria().map((c) => ({
        ...c,
        weight: Math.round((c.weight / sum) * 1000) / 1000,
      })),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────

  private parseIntOrNull(value: string): number | null {
    if (value.trim() === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
  }

  private newCriterionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `crit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private mutateCriterion(
    index: number,
    mutator: (c: OeRubricCriterion) => OeRubricCriterion,
  ): void {
    this.rubricCriteria.set(
      this.rubricCriteria().map((c, i) => (i === index ? mutator(c) : c)),
    );
  }

  trackByCriterionId(_index: number, criterion: OeRubricCriterion): string {
    return criterion.criterion_id;
  }

  requestModelAnswer(): void {
    if (!this.canRequestModelAnswer()) return;
    const regenerate = this.modelAnswer().trim().length > 0;
    this.modelAnswerRequested.emit({ regenerate });
  }
}
