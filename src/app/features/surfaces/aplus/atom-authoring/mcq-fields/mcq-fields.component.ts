/**
 * McqFieldsComponent — Phase E editable MCQ form (HITL edit surface).
 *
 * Renders the editable MCQ content for the atom-authoring screen:
 * stem + 2–6 options (default 4 from initialContent) + single-correct
 * radio + mandatory per-option explainer. Used uniformly for manual /
 * ai_draft / batch_accepted source modes — the `kind` tag on the
 * incoming `initialContent.kind` is preserved on emit (analytics/UI
 * hint; not wire-serialised by `toCreateRequest`/`toEditRequest`).
 *
 * The component owns its local draft state via signals; the parent
 * passes `initialContent` once on mount (or on identity change, e.g.
 * after an AI candidate accept) and consumes `contentChanged` +
 * `validityChanged` to drive the Save Draft / Publish CTAs.
 *
 * Locked decisions (resume doc §4):
 *   - 2 ≤ options ≤ 6 (default 4)
 *   - single-correct in v1 (radio group)
 *   - per-option explainer MANDATORY (publish blocks if empty)
 *   - type-immutable post-publish — surfaced via `readonly` from parent
 *
 * Validity gate (`validityChanged`):
 *   - prompt non-empty (trimmed)
 *   - 2 ≤ options.length ≤ 6
 *   - exactly 1 correct option (v1 single-correct)
 *   - every explainer non-empty (trimmed)
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

import type { McqContent, McqOption } from '../atom-authoring.model';
import { ChoraQuestionImageComponent } from '../../../../../shared/components/chora-question-image/chora-question-image.component';

@Component({
  selector: 'chora-mcq-fields',
  standalone: true,
  imports: [ChoraQuestionImageComponent],
  templateUrl: './mcq-fields.component.html',
  styleUrl: './mcq-fields.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class McqFieldsComponent {
  readonly initialContent = input.required<McqContent>();
  readonly readonly = input<boolean>(false);

  readonly contentChanged = output<McqContent>();
  readonly validityChanged = output<boolean>();

  /** FE-only `kind` tag — preserved from `initialContent` across edits. */
  private readonly kind = signal<McqContent['kind']>('manual');
  readonly prompt = signal<string>('');
  readonly options = signal<readonly McqOption[]>([]);

  /**
   * Generated diagram/scene image URL for this candidate (W8 image-gen),
   * surfaced off the existing `initialContent` input. Display-only — not
   * part of the editable draft, so it reads straight off the input rather
   * than a local signal. Falsy/absent → the template renders nothing.
   */
  readonly imageUrl = computed<string | undefined>(
    () => this.initialContent().image_url,
  );

  /**
   * Generated MODEL-ANSWER image URL (W8 AUTHOR-OPT-IN, 2nd slot), surfaced
   * off the existing `initialContent` input. Display-only — reads straight
   * off the input (not part of the editable draft), mirroring `imageUrl`
   * above. Falsy/absent → the template renders nothing. Rendered in the
   * correct-answer explainer area (after the options).
   */
  readonly answerImageUrl = computed<string | undefined>(
    () => this.initialContent().answer_image_url,
  );

  /** Trimmed validity check — drives the publish CTA gate. */
  readonly isValid = computed<boolean>(() => {
    if (this.prompt().trim().length === 0) return false;
    const opts = this.options();
    if (opts.length < 2 || opts.length > 6) return false;
    const correctCount = opts.filter((o) => o.is_correct).length;
    if (correctCount !== 1) return false;
    return opts.every((o) => o.explainer.trim().length > 0);
  });

  readonly canAddOption = computed<boolean>(
    () => !this.readonly() && this.options().length < 6,
  );

  readonly canRemoveOption = computed<boolean>(
    () => !this.readonly() && this.options().length > 2,
  );

  /** Track the last initialContent identity so we re-seed on real change. */
  private lastSeed: McqContent | null = null;
  /** Track the last validity emission so we only emit on transitions + init. */
  private lastValidity: boolean | null = null;

  constructor() {
    // Seed from initialContent on first run + on identity change.
    effect(() => {
      const seed = this.initialContent();
      if (seed === this.lastSeed) return;
      this.lastSeed = seed;
      this.kind.set(seed.kind);
      this.prompt.set(seed.prompt);
      this.options.set(seed.mcq_payload.options.map((o) => ({ ...o })));
    });

    // Emit contentChanged whenever the synthesized content shifts.
    effect(() => {
      // W8 image-gen: carry the display-only AI-generated illustration URLs
      // through on emit. They are NOT editable here (read straight off
      // `initialContent`), but the parent's `currentContent` MUST retain them
      // so the SAVE path (toCreateRequest → imageFields / AI-commit candidate)
      // persists them into the question payload and they survive to the
      // learner. Without this re-emit, the first content-change event
      // overwrites `currentContent` with an image-less copy and the URLs are
      // silently dropped before Save. Absent → omitted (byte-stable manual
      // no-image path).
      const seed = this.initialContent();
      const content: McqContent = {
        kind: this.kind(),
        type: 'mcq',
        prompt: this.prompt(),
        mcq_payload: { options: this.options() },
        ...(seed.image_url ? { image_url: seed.image_url } : {}),
        ...(seed.answer_image_url
          ? { answer_image_url: seed.answer_image_url }
          : {}),
      };
      this.contentChanged.emit(content);
    });

    // Emit validityChanged only on transitions (avoids signal-loop noise).
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

  onLabelInput(index: number, value: string): void {
    this.mutateOption(index, (o) => ({ ...o, label: value }));
  }

  onExplainerInput(index: number, value: string): void {
    this.mutateOption(index, (o) => ({ ...o, explainer: value }));
  }

  /** Single-correct semantics — clicking a radio sets that one true + all others false. */
  onCorrectSelect(index: number): void {
    this.options.set(
      this.options().map((o, i) => ({ ...o, is_correct: i === index })),
    );
  }

  addOption(): void {
    if (!this.canAddOption()) return;
    const newOption: McqOption = {
      option_id: this.newOptionId(),
      label: '',
      is_correct: false,
      explainer: '',
    };
    this.options.set([...this.options(), newOption]);
  }

  removeOption(index: number): void {
    if (!this.canRemoveOption()) return;
    this.options.set(this.options().filter((_, i) => i !== index));
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /** Stable per-option id minted client-side; BE replaces on save. */
  private newOptionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private mutateOption(index: number, mutator: (o: McqOption) => McqOption): void {
    this.options.set(
      this.options().map((o, i) => (i === index ? mutator(o) : o)),
    );
  }

  /** Template `track` helper for the @for option loop. */
  trackByOptionId(_index: number, option: McqOption): string {
    return option.option_id;
  }
}
