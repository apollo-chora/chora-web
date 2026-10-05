/**
 * ApplicationStartComponent — Learner application start page with vertical
 * stepper showing all pipeline stages, timeout countdown, and "Start" button.
 *
 * Route: /admissions/apply/:pipelineId
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
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AdmissionService } from '../../services/admission.service';
import type {
  ApplicationOverview,
  StageProgress,
} from '../../models/admission-learner.model';
import { STAGE_STATUS_LABELS } from '../../models/admission-learner.model';

@Component({
  selector: 'chora-application-start',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './application-start.component.html',
  styleUrl: './application-start.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApplicationStartComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly admissionService = inject(AdmissionService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly starting = signal(false);
  readonly application = signal<ApplicationOverview | null>(null);
  readonly pipelineId = signal<string | null>(null);
  readonly now = signal(Date.now());

  // --- Constants ---
  readonly stageStatusLabels = STAGE_STATUS_LABELS;

  // --- Computed ---
  readonly stages = computed(() => this.application()?.stages ?? []);
  readonly currentStageIndex = computed(
    () => this.application()?.current_stage_index ?? 0,
  );
  readonly hasStarted = computed(() => this.application() !== null);

  readonly estimatedMinutes = computed(() => {
    const stages = this.stages();
    return stages.reduce(
      (acc, s) => acc + (s.timeout_hours ? s.timeout_hours * 60 : 15),
      0,
    );
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const pipelineId = this.route.snapshot.paramMap.get('pipelineId');
    this.pipelineId.set(pipelineId);

    // Update timer every second for countdown
    this.subscriptions.add(
      interval(1000).subscribe(() => {
        this.now.set(Date.now());
      }),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  startApplication(): void {
    const pid = this.pipelineId();
    if (!pid) return;

    this.starting.set(true);
    this.subscriptions.add(
      this.admissionService.startApplication(pid).subscribe({
        next: (app) => {
          this.starting.set(false);
          if (app) {
            this.application.set(app);
            this.toast.show('admissions.application_started', 'success');
          } else {
            this.toast.show('admissions.start_error', 'error');
          }
        },
        error: () => {
          this.starting.set(false);
          this.toast.show('admissions.start_error', 'error');
        },
      }),
    );
  }

  navigateToStage(stage: StageProgress): void {
    const app = this.application();
    if (!app || stage.status === 'pending') return;

    this.router.navigate([
      '/admissions/apply',
      app.pipeline_id,
      'stage',
      stage.id,
    ]);
  }

  getTimeRemaining(stage: StageProgress): string {
    if (!stage.timeout_deadline) return '';

    const deadline = new Date(stage.timeout_deadline).getTime();
    const remaining = deadline - this.now();

    if (remaining <= 0) return '00:00:00';

    const hours = Math.floor(remaining / 3600000);
    const minutes = Math.floor((remaining % 3600000) / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  isStageAccessible(stage: StageProgress): boolean {
    return stage.status === 'active' || stage.status === 'completed';
  }

  trackByStageId(_index: number, stage: StageProgress): string {
    return stage.id;
  }
}
