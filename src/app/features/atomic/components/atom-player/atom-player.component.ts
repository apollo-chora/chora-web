import {
  Component, ChangeDetectionStrategy, inject, signal, computed,
  OnInit, OnDestroy, HostListener, input,
} from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AtomService } from '../../services/atom.service';
import {
  ATOM_TYPE_LABELS,
  VALIDATION_RULE_LABELS,
  hasHints,
  ValidateAnswerRequest,
} from '../../models/atom.models';
import { McqRendererComponent } from './renderers/mcq-renderer.component';
import { FillBlankRendererComponent } from './renderers/fill-blank-renderer.component';
import { TrueFalseRendererComponent } from './renderers/true-false-renderer.component';
import { FlashcardRendererComponent } from './renderers/flashcard-renderer.component';
import { ShortAnswerRendererComponent } from './renderers/short-answer-renderer.component';
import { CodeRendererComponent } from './renderers/code-renderer.component';
import { QualityBadgeComponent } from '../quality-badge/quality-badge.component';
import { ReviewStatusComponent } from '../review-status/review-status.component';
import { ContentQualityService } from '../../services/content-quality.service';
import { ChoraQuestionImageComponent } from '../../../../shared/components/chora-question-image/chora-question-image.component';

export type PlayerPhase = 'loading' | 'ready' | 'submitted' | 'error';

@Component({
  selector: 'chora-atom-player',
  imports: [
    JsonPipe,
    TranslatePipe,
    McqRendererComponent,
    FillBlankRendererComponent,
    TrueFalseRendererComponent,
    FlashcardRendererComponent,
    ShortAnswerRendererComponent,
    CodeRendererComponent,
    QualityBadgeComponent,
    ReviewStatusComponent,
    ChoraQuestionImageComponent,
  ],
  templateUrl: './atom-player.component.html',
  styleUrl: './atom-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AtomPlayerComponent implements OnInit, OnDestroy {
  atomId = input<string>('');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly atomService = inject(AtomService);
  private readonly qualityService = inject(ContentQualityService);

  readonly atomState = this.atomService.atomState;
  readonly validationState = this.atomService.validationState;
  readonly qualityState = this.qualityService.qualityState;

  readonly qualityData = computed(() => {
    const s = this.qualityState();
    return s.status === 'success' ? s.data : null;
  });

  readonly phase = signal<PlayerPhase>('loading');
  readonly currentAnswer = signal<Record<string, unknown> | null>(null);
  readonly hintsUsed = signal(0);
  readonly startTime = signal(0);

  readonly atom = computed(() => {
    const s = this.atomState();
    return s.status === 'success' ? s.atom : null;
  });

  readonly revision = computed(() => this.atom()?.latest_revision ?? null);

  readonly content = computed(() =>
    (this.revision()?.content ?? {}) as Record<string, unknown>
  );

  // W8: optional author-generated illustration for the MODEL ANSWER, shown in
  // the results/feedback phase. Read off the published atom revision content
  // (populated once the save/publish path persists the candidate's
  // answer_image_url — pending the re-home-on-save follow-up). Null → hidden.
  readonly answerImageUrl = computed(
    () => (this.content()['answer_image_url'] as string) || null,
  );

  readonly atomType = computed(() => this.atom()?.atom_type ?? null);

  readonly typeLabel = computed(() => {
    const t = this.atomType();
    return t ? ATOM_TYPE_LABELS[t] : '';
  });

  private static readonly GRADABLE_TYPES = new Set([
    'multiple_choice', 'fill_blank', 'true_false', 'short_answer', 'code',
  ]);

  readonly isGradable = computed(() => {
    const t = this.atomType();
    return t !== null && AtomPlayerComponent.GRADABLE_TYPES.has(t);
  });

  readonly hints = computed(() => {
    const c = this.content();
    return hasHints(c) ? c.hints : [];
  });

  readonly maxHints = computed(() => this.hints().length);

  readonly revealedHints = computed(() => {
    const used = this.hintsUsed();
    return this.hints().slice(0, used);
  });

  readonly canSubmit = computed(() =>
    this.phase() === 'ready' && this.currentAnswer() !== null && this.isGradable()
  );

  readonly canHint = computed(() =>
    this.phase() === 'ready' && this.hintsUsed() < this.maxHints()
  );

  readonly validationResult = computed(() => {
    const s = this.validationState();
    return s.status === 'success' ? s.result : null;
  });

  readonly validationError = computed(() => {
    const s = this.validationState();
    return s.status === 'error' ? s.error : null;
  });

  readonly isSubmitting = computed(() =>
    this.validationState().status === 'submitting'
  );

  readonly ruleTypeLabel = computed(() => {
    const result = this.validationResult();
    return result ? VALIDATION_RULE_LABELS[result.rule_type] : '';
  });

  ngOnInit(): void {
    const id = this.atomId() || this.route.snapshot.paramMap.get('id') || '';
    if (!id) {
      this.phase.set('error');
      return;
    }
    this.startTime.set(Date.now());
    this.atomService.loadAtom(id).subscribe((atom) => {
      if (atom?.latest_revision) {
        this.phase.set('ready');
        // Load AI quality data in background
        this.qualityService.loadQualityData(
          atom.id,
          atom.latest_revision.content as Record<string, unknown>,
        );
      } else {
        this.phase.set('error');
      }
    });
  }

  ngOnDestroy(): void {
    this.atomService.resetAtomState();
    this.atomService.resetValidationState();
    this.qualityService.resetState();
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }
    switch (event.key) {
      case 'h':
      case 'H':
        this.requestHint();
        break;
      case 's':
      case 'S':
        if (this.canSubmit()) this.submitAnswer();
        break;
      case 'Escape':
        this.exitPlayer();
        break;
    }
  }

  onAnswerChange(answer: Record<string, unknown>): void {
    this.currentAnswer.set(answer);
  }

  submitAnswer(): void {
    const atom = this.atom();
    const answer = this.currentAnswer();
    if (!atom || !answer) return;

    const elapsed = Math.round((Date.now() - this.startTime()) / 1000);
    const request: ValidateAnswerRequest = {
      answer,
      revision_id: this.revision()?.id ?? null,
      time_spent_seconds: elapsed,
    };

    this.atomService.validateAnswer(atom.id, request).subscribe((result) => {
      if (result) {
        this.phase.set('submitted');
      }
    });
  }

  requestHint(): void {
    if (this.canHint()) {
      this.hintsUsed.update((n) => n + 1);
    }
  }

  retryAnswer(): void {
    this.phase.set('ready');
    this.currentAnswer.set(null);
    this.atomService.resetValidationState();
  }

  exitPlayer(): void {
    this.router.navigate(['/learning']);
  }

  resetForNext(): void {
    this.phase.set('ready');
    this.currentAnswer.set(null);
    this.hintsUsed.set(0);
    this.startTime.set(Date.now());
    this.atomService.resetValidationState();
  }
}
