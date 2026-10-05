/**
 * A2AActivityIndicatorComponent — shows A2A activity on the Familiar panel.
 *
 * Displays a pulsing indicator when an external agent is communicating
 * with the learner's Familiar, with tooltip and optional read-only
 * chat tab for multi-turn study_conversation skill.
 *
 * Respects `prefers-reduced-motion` — static icon replaces pulse.
 *
 * @see docs/design/ux_a2a_protocol.md (Live indicator)
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Subscription, interval } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { A2AConsentService } from '../../services/a2a-consent.service';
import {
  A2ATask,
  A2ASkill,
  A2A_SKILL_LABELS,
} from '../../../admin/a2a/models/a2a.model';

/** Chat message in the read-only conversation view */
interface A2AChatMessage {
  id: string;
  sender: 'external_agent' | 'familiar';
  content: string;
  timestamp: string;
}

@Component({
  selector: 'chora-a2a-activity-indicator',
  standalone: true,
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a2a-activity-indicator.component.html',
  styleUrl: './a2a-activity-indicator.component.scss',
})
export class A2AActivityIndicatorComponent implements OnInit, OnDestroy {
  private readonly consentService = inject(A2AConsentService);
  private subscriptions = new Subscription();

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  /** Whether the chat tab is open */
  readonly isChatOpen = signal(false);

  /** Whether tooltip is visible */
  readonly isTooltipVisible = signal(false);

  /** Read-only chat messages */
  readonly chatMessages = signal<A2AChatMessage[]>([]);

  /** Skill label map */
  readonly skillLabels = A2A_SKILL_LABELS;

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  readonly hasActiveSession = this.consentService.hasActiveA2ASession;

  readonly activeTasks = this.consentService.activeTasks;

  /** Primary active task (first one) */
  readonly primaryTask = computed<A2ATask | null>(() => {
    const tasks = this.activeTasks();
    return tasks.length > 0 ? tasks[0] : null;
  });

  /** Whether the active task is a study_conversation (supports chat view) */
  readonly isStudyConversation = computed(() => {
    const task = this.primaryTask();
    return task?.skill === A2ASkill.StudyConversation;
  });

  /** Tooltip text */
  readonly tooltipText = computed(() => {
    const task = this.primaryTask();
    if (!task) return '';
    return task.partnerName;
  });

  /** Active task count */
  readonly activeTaskCount = computed(() => this.activeTasks().length);

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  ngOnInit(): void {
    // Poll active tasks every 10 seconds
    this.subscriptions.add(
      interval(10_000).pipe(
        switchMap(() => this.consentService.getActiveTasks()),
      ).subscribe(),
    );

    // Initial load
    this.subscriptions.add(
      this.consentService.getActiveTasks().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  toggleChat(): void {
    this.isChatOpen.update((open) => !open);
  }

  showTooltip(): void {
    this.isTooltipVisible.set(true);
  }

  hideTooltip(): void {
    this.isTooltipVisible.set(false);
  }

  closeChat(): void {
    this.isChatOpen.set(false);
  }

  formatTimestamp(timestamp: string): string {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return timestamp;
    }
  }
}
