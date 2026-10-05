import {
  Component, ChangeDetectionStrategy, inject, OnInit, OnDestroy,
  signal, computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ExamCoachingService } from '../../services/exam-coaching.service';
import type { StudyPlanItem } from '../../services/exam-coaching.service';

@Component({
  selector: 'chora-exam-coaching-widget',
  imports: [TranslatePipe],
  templateUrl: './exam-coaching-widget.component.html',
  styleUrl: './exam-coaching-widget.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamCoachingWidgetComponent implements OnInit, OnDestroy {
  private readonly coachingService = inject(ExamCoachingService);
  private readonly router = inject(Router);

  readonly coachingState = this.coachingService.coachingState;
  readonly readinessScore = this.coachingService.readinessScore;
  readonly weakTopics = this.coachingService.weakTopics;
  readonly studyPlan = this.coachingService.studyPlan;
  readonly coachingMessage = this.coachingService.coachingMessage;
  readonly chatState = this.coachingService.chatState;
  readonly chatText = this.coachingService.chatText;
  readonly isChatStreaming = this.coachingService.isChatStreaming;

  readonly expanded = signal(false);
  readonly chatOpen = signal(false);
  readonly chatInput = signal('');

  readonly scoreLevel = computed<'high' | 'medium' | 'low'>(() => {
    const score = this.readinessScore();
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  });

  readonly gaugeWidth = computed(() => {
    return `${this.readinessScore()}%`;
  });

  ngOnInit(): void {
    if (this.coachingState().status === 'idle') {
      this.coachingService.loadCoaching('me').subscribe();
    }
  }

  ngOnDestroy(): void {
    this.coachingService.stopChat();
  }

  toggleExpanded(): void {
    this.expanded.update(v => !v);
  }

  toggleChat(): void {
    this.chatOpen.update(v => !v);
  }

  updateChatInput(value: string): void {
    this.chatInput.set(value);
  }

  sendMessage(): void {
    const msg = this.chatInput().trim();
    if (!msg) return;
    this.coachingService.startChat('me', msg);
    this.chatInput.set('');
  }

  onChatKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  openAtom(atomId: string): void {
    this.router.navigate(['/atoms', atomId]);
  }

  trackByAtomId(_index: number, item: StudyPlanItem): string {
    return item.atom_id;
  }
}
