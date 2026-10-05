import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import type {
  GenerationJobState,
  QuestionType,
} from '../atom-authoring.model';

export interface AiAssistGenerateRequest {
  readonly prompt: string;
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
}

/**
 * Phase I.1 — in-editor disclosure panel for AI-assisted question
 * generation (path 3 / `ai_draft`). Sits inside the MCQ + OE editors;
 * emits `generateRequested` upward and renders the uniform D4 job
 * lifecycle status (pending → parsing → generating → ready/failed).
 *
 * Self-contained UI state (collapsed/expanded, prompt text, difficulty).
 * Parent owns the `jobState` lifecycle + mana 402 handling + re-seeding
 * the field component with the returned candidate.
 */
@Component({
  selector: 'chora-ai-assist-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ai-assist-panel.component.html',
  styleUrl: './ai-assist-panel.component.scss',
})
export class AiAssistPanelComponent {
  readonly questionType = input.required<QuestionType>();
  readonly jobState = input.required<GenerationJobState>();
  readonly manaBalance = input.required<number | null>();
  /**
   * stub grays out the panel + makes it non-interactive. Set on the inline
   * single-mode authoring instances: the inline ai-draft path needs a saved
   * atom_id (it 422s pre-save), and the canonical generator is now the
   * top-level AI Assist crew modal. Keeps the control visible but inert.
   */
  readonly stub = input(false);

  readonly generateRequested = output<AiAssistGenerateRequest>();

  readonly expanded = signal(false);
  readonly prompt = signal('');
  readonly difficulty = signal<1 | 2 | 3 | 4 | 5>(3);
  readonly difficultyOptions: readonly (1 | 2 | 3 | 4 | 5)[] = [1, 2, 3, 4, 5];

  readonly inFlight = computed(() => {
    const s = this.jobState().status;
    return s === 'submitting' || s === 'submitted' || s === 'polling';
  });

  readonly trimmedPrompt = computed(() => this.prompt().trim());

  readonly canGenerate = computed(
    () => !this.stub() && this.trimmedPrompt().length > 0 && !this.inFlight(),
  );

  readonly statusKey = computed(() => {
    const s = this.jobState();
    if (s.status === 'submitting') {
      return 'aplus.atom_authoring.ai_assist.status_submitting';
    }
    if (s.status === 'submitted') {
      return 'aplus.atom_authoring.ai_assist.status_submitted';
    }
    if (s.status === 'polling') {
      const j = s.job.status;
      if (j === 'parsing') {
        return 'aplus.atom_authoring.ai_assist.status_parsing';
      }
      if (j === 'generating') {
        return 'aplus.atom_authoring.ai_assist.status_generating';
      }
      return 'aplus.atom_authoring.ai_assist.status_polling';
    }
    if (s.status === 'ready') {
      return 'aplus.atom_authoring.ai_assist.status_ready';
    }
    return null;
  });

  readonly errorKey = computed(() => {
    const s = this.jobState();
    return s.status === 'error' ? s.error : null;
  });

  readonly promptAriaKey = computed(() =>
    this.questionType() === 'mcq'
      ? 'aplus.atom_authoring.ai_assist.prompt_aria_mcq'
      : 'aplus.atom_authoring.ai_assist.prompt_aria_oe',
  );

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  onPromptInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.prompt.set(value);
  }

  onDifficultyChange(event: Event): void {
    const raw = (event.target as HTMLSelectElement).value;
    const parsed = Number(raw);
    if (parsed >= 1 && parsed <= 5) {
      this.difficulty.set(parsed as 1 | 2 | 3 | 4 | 5);
    }
  }

  submit(): void {
    if (!this.canGenerate()) {
      return;
    }
    this.generateRequested.emit({
      prompt: this.trimmedPrompt(),
      difficulty: this.difficulty(),
    });
  }
}
