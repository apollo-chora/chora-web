/**
 * AppealTimelineComponent — Appeal status timeline for learners.
 *
 * Route: /settings/account/appeal/status
 *
 * Features:
 *   - Vertical timeline showing appeal stages: Submitted -> Under Review -> Decision Pending -> Resolved
 *   - Each stage with date and optional notes
 *   - Current stage highlighted with active indicator
 *   - Resolved stage shows decision (upheld/overturned) with color coding
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { BffClientService } from '../../../../core/services/bff-client.service';
import type {
  AppealTimeline,
  AppealTimelineState,
  AppealStage,
} from '../../../admin/governance/models/escalation.model';
import { APPEAL_DECISION_LABELS } from '../../../admin/governance/models/escalation.model';

@Component({
  selector: 'chora-appeal-timeline',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './appeal-timeline.component.html',
  styleUrl: './appeal-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppealTimelineComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _state = signal<AppealTimelineState>({ status: 'idle' });
  readonly state = this._state.asReadonly();

  readonly timeline = computed(() => {
    const s = this._state();
    return s.status === 'success' ? s.data : null;
  });

  readonly isLoading = computed(() => this._state().status === 'loading');
  readonly isError = computed(() => this._state().status === 'error');

  // --- Derived ---
  readonly stages = computed<AppealStage[]>(() => this.timeline()?.stages ?? []);
  readonly currentStageIndex = computed(() => this.timeline()?.current_stage_index ?? -1);

  // --- Constants ---
  readonly decisionLabels = APPEAL_DECISION_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadTimeline();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadTimeline(): void {
    this._state.set({ status: 'loading' });
    this.subscriptions.add(
      this.bff
        .get<AppealTimeline>('/api/v1/identity/appeals/status')
        .subscribe({
          next: (data) => this._state.set({ status: 'success', data }),
          error: (err: Error) =>
            this._state.set({
              status: 'error',
              error: { code: 'APPEAL_TIMELINE_LOAD_FAILED', message: err.message },
            }),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  stageClass(stage: AppealStage, _idx: number): string {
    const base = 'appeal-timeline__stage';
    if (stage.status === 'completed') return `${base} ${base}--completed`;
    if (stage.status === 'active') return `${base} ${base}--active`;
    return `${base} ${base}--pending`;
  }

  decisionClass(decision: string | null): string {
    if (!decision) return '';
    return `appeal-timeline__decision--${decision}`;
  }

  formatDate(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }

  isResolved(stage: AppealStage): boolean {
    return stage.status === 'completed' && stage.decision !== null;
  }
}
