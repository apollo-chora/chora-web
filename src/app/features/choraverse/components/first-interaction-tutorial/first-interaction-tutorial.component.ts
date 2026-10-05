/**
 * FirstInteractionTutorialComponent — 3-step guided tutorial after summoning.
 *
 * Step 1: Familiar introduces itself (archetype + personality).
 * Step 2: Suggested response chips for learner to practice interaction.
 * Step 3: Familiar demonstrates a learning feature ("Ask me about any topic").
 *
 * Tutorial state is local (not persisted). One-time per summoning.
 *
 * @see docs/design/ux_familiar_companion.md (FirstInteraction)
 * @see CHO-1344
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { FamiliarService } from '../../services/familiar.service';
import { FamiliarChatService } from '../../services/familiar-chat.service';

interface TutorialStep {
  titleKey: string;
  familiarMessageKey: string;
  responseChips: ResponseChip[];
}

interface ResponseChip {
  labelKey: string;
  value: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    titleKey: 'choraverse.tutorial.step1_title',
    familiarMessageKey: 'choraverse.tutorial.step1_message',
    responseChips: [
      { labelKey: 'choraverse.tutorial.chip_hello', value: 'Hello! Nice to meet you!' },
      { labelKey: 'choraverse.tutorial.chip_excited', value: "I'm excited to start learning!" },
      { labelKey: 'choraverse.tutorial.chip_curious', value: 'What can you help me with?' },
    ],
  },
  {
    titleKey: 'choraverse.tutorial.step2_title',
    familiarMessageKey: 'choraverse.tutorial.step2_message',
    responseChips: [
      { labelKey: 'choraverse.tutorial.chip_explain', value: 'Can you explain a topic to me?' },
      { labelKey: 'choraverse.tutorial.chip_quiz', value: "I'd like a quick quiz!" },
      { labelKey: 'choraverse.tutorial.chip_recommend', value: 'What should I learn next?' },
      { labelKey: 'choraverse.tutorial.chip_surprise', value: 'Surprise me!' },
    ],
  },
  {
    titleKey: 'choraverse.tutorial.step3_title',
    familiarMessageKey: 'choraverse.tutorial.step3_message',
    responseChips: [
      { labelKey: 'choraverse.tutorial.chip_ready', value: "I'm ready to start!" },
      { labelKey: 'choraverse.tutorial.chip_explore', value: "Let's explore together!" },
    ],
  },
];

@Component({
  selector: 'chora-first-interaction-tutorial',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './first-interaction-tutorial.component.html',
  styleUrl: './first-interaction-tutorial.component.scss',
})
export class FirstInteractionTutorialComponent implements OnDestroy {
  private readonly familiarService = inject(FamiliarService);
  private readonly chatService = inject(FamiliarChatService);
  private readonly router = inject(Router);

  readonly steps = TUTORIAL_STEPS;
  readonly totalSteps = TUTORIAL_STEPS.length;

  /** Current step index (0-based) */
  readonly currentStep = signal(0);

  /** Messages displayed in the chat area */
  readonly chatMessages = signal<{ role: 'familiar' | 'learner'; contentKey: string }[]>([
    { role: 'familiar', contentKey: TUTORIAL_STEPS[0].familiarMessageKey },
  ]);

  /** Whether the learner has responded in the current step */
  readonly hasResponded = signal(false);

  /** Current step definition */
  readonly step = computed(() => this.steps[this.currentStep()]);

  /** Progress percentage */
  readonly progressPercent = computed(
    () => ((this.currentStep() + 1) / this.totalSteps) * 100,
  );

  /** Whether we're on the last step */
  readonly isLastStep = computed(
    () => this.currentStep() === this.totalSteps - 1,
  );

  /** Familiar species icon */
  readonly familiarIcon = computed(() => {
    const s = this.familiarService.state();
    if (s.status !== 'success') return '🦊';
    const icons: Record<string, string> = {
      fox: '🦊', owl: '🦉', dragon: '🐉', cat: '🐱', robot: '🤖', phoenix: '🔥',
    };
    return icons[s.profile.speciesType] || '🦊';
  });

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Chip selection
  // -------------------------------------------------------------------------

  selectChip(chip: ResponseChip): void {
    if (this.hasResponded()) return;

    // Add learner response to chat
    this.chatMessages.update((msgs) => [
      ...msgs,
      { role: 'learner' as const, contentKey: chip.labelKey },
    ]);
    this.hasResponded.set(true);

    // Send to actual chat service for continuity
    this.chatService.sendMessage(chip.value);
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  nextStep(): void {
    const next = this.currentStep() + 1;
    if (next < this.totalSteps) {
      this.currentStep.set(next);
      this.hasResponded.set(false);
      // Add familiar message for next step
      this.chatMessages.update((msgs) => [
        ...msgs,
        { role: 'familiar' as const, contentKey: this.steps[next].familiarMessageKey },
      ]);
    }
  }

  completeTutorial(): void {
    this.familiarService.justSummoned.set(false);
    this.router.navigate(['/choraverse', 'chat']);
  }

  skipTutorial(): void {
    this.familiarService.justSummoned.set(false);
    this.router.navigate(['/choraverse']);
  }
}
