/**
 * StudyPlanDashboardComponent — Week-by-week schedule view with daily atom targets,
 * timeline countdown to exam date, and pace adjustment controls.
 *
 * Route: /engagement/study-plan/:examId
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
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { Subscription } from 'rxjs';
import {
  StudyPlanService,
  type PaceLevel,
  type StudyPlanWeek,
} from '../../services/study-plan.service';

@Component({
  selector: 'chora-study-plan-dashboard',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './study-plan-dashboard.component.html',
  styleUrl: './study-plan-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StudyPlanDashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly studyPlanService = inject(StudyPlanService);

  readonly planState = this.studyPlanService.planState;
  readonly plan = this.studyPlanService.currentPlan;
  readonly currentWeek = this.studyPlanService.currentWeek;
  readonly daysRemaining = this.studyPlanService.daysRemaining;
  readonly overallProgress = this.studyPlanService.overallProgress;

  readonly selectedPace = signal<PaceLevel>('standard');
  readonly expandedWeek = signal<number | null>(null);

  readonly paceOptions: PaceLevel[] = ['light', 'standard', 'intensive'];

  readonly progressBarWidth = computed(() => `${this.overallProgress()}%`);

  readonly countdownClass = computed(() => {
    const days = this.daysRemaining();
    if (days <= 7) return 'study-plan-dashboard__countdown--urgent';
    if (days <= 14) return 'study-plan-dashboard__countdown--warning';
    return 'study-plan-dashboard__countdown--normal';
  });

  readonly planError = computed(() => {
    const s = this.planState();
    return s.status === 'error' ? s.error.message : '';
  });

  private subscriptions = new Subscription();
  private examId = '';

  ngOnInit(): void {
    this.examId = this.route.snapshot.paramMap.get('examId') ?? '';
    if (!this.examId) return;

    this.subscriptions.add(
      this.studyPlanService.loadPlan(this.examId).subscribe((plan) => {
        if (plan) {
          this.selectedPace.set(plan.pace);
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.studyPlanService.resetState();
  }

  onPaceChange(pace: PaceLevel): void {
    this.selectedPace.set(pace);
    this.subscriptions.add(
      this.studyPlanService.updatePace(this.examId, pace).subscribe(),
    );
  }

  toggleWeek(weekNumber: number): void {
    this.expandedWeek.update((current) =>
      current === weekNumber ? null : weekNumber,
    );
  }

  weekProgressPct(week: StudyPlanWeek): number {
    if (week.total_atoms === 0) return 0;
    return Math.round((week.completed_atoms / week.total_atoms) * 100);
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return isoString;
    }
  }
}
