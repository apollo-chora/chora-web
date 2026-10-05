/**
 * LiveSessionDashboardComponent — Three-panel layout: agenda (left),
 * current atom display (center), attendance with QR (right).
 *
 * Route: /admin/training/session/:sessionId/live
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
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { Subscription, interval, switchMap, catchError, of } from 'rxjs';
import { TrainingAdminService } from '../../services/training-admin.service';
import { QrAttendanceComponent } from '../../../../../shared/components/qr-attendance/qr-attendance.component';

@Component({
  selector: 'chora-live-session-dashboard',
  standalone: true,
  imports: [TranslatePipe, QrAttendanceComponent],
  templateUrl: './live-session-dashboard.component.html',
  styleUrl: './live-session-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LiveSessionDashboardComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly trainingService = inject(TrainingAdminService);

  readonly liveSessionState = this.trainingService.liveSessionState;
  readonly liveData = this.trainingService.liveData;

  readonly attendanceCount = signal(0);
  readonly sessionId = signal('');

  readonly session = computed(() => this.liveData()?.session ?? null);
  readonly agenda = computed(() => this.session()?.agenda ?? []);
  readonly currentAgendaIndex = computed(
    () => this.liveData()?.current_agenda_index ?? 0,
  );
  readonly currentAtom = computed(() => {
    const items = this.agenda();
    const idx = this.currentAgendaIndex();
    return idx < items.length ? items[idx] : null;
  });
  readonly engagementScore = computed(
    () => this.liveData()?.engagement_score ?? 0,
  );
  readonly totalExpected = computed(
    () => this.liveData()?.total_expected ?? 0,
  );

  readonly isLastItem = computed(
    () => this.currentAgendaIndex() >= this.agenda().length - 1,
  );

  readonly engagementClass = computed(() => {
    const score = this.engagementScore();
    if (score >= 80) return 'live-session-dashboard__engagement--high';
    if (score >= 50) return 'live-session-dashboard__engagement--medium';
    return 'live-session-dashboard__engagement--low';
  });

  readonly liveError = computed(() => {
    const s = this.liveSessionState();
    return s.status === 'error' ? s.error.message : '';
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('sessionId') ?? '';
    this.sessionId.set(id);
    if (!id) return;

    this.subscriptions.add(
      this.trainingService.getLiveSession(id).subscribe(),
    );

    // Auto-refresh live data every 10 seconds
    this.subscriptions.add(
      interval(10000)
        .pipe(
          switchMap(() => this.trainingService.getLiveSession(id)),
          catchError(() => of(null)),
        )
        .subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.trainingService.resetState();
  }

  advanceAgenda(): void {
    const id = this.sessionId();
    if (!id || this.isLastItem()) return;

    this.subscriptions.add(
      this.trainingService.advanceAgenda(id).subscribe(),
    );
  }

  onAttendanceChanged(count: number): void {
    this.attendanceCount.set(count);
  }

  isCurrentItem(index: number): boolean {
    return index === this.currentAgendaIndex();
  }

  isCompletedItem(index: number): boolean {
    return index < this.currentAgendaIndex();
  }
}
