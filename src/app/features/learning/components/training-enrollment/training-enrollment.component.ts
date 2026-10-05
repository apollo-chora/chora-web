import {
  Component,
  ChangeDetectionStrategy,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { TrainingSessionDetailModalComponent } from './training-session-detail-modal.component';
import {
  type TrainingSession,
  type TrainingSessionListResponse,
  type EnrollmentResponse,
  getCapacityLevel,
} from './models/training.model';

@Component({
  selector: 'chora-training-enrollment',
  standalone: true,
  imports: [TranslatePipe, TrainingSessionDetailModalComponent],
  templateUrl: './training-enrollment.component.html',
  styleUrl: './training-enrollment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrainingEnrollmentBrowserComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);

  readonly sessions = signal<TrainingSession[]>([]);
  readonly enrolledIds = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectedSubject = signal<string>('');
  readonly trainerSearch = signal<string>('');
  readonly selectedSession = signal<TrainingSession | null>(null);
  readonly enrollingId = signal<string | null>(null);

  readonly availableTopics = computed(() => {
    const topics = new Set<string>();
    for (const session of this.sessions()) {
      for (const topic of session.topics) {
        topics.add(topic);
      }
    }
    return Array.from(topics).sort();
  });

  readonly filteredSessions = computed(() => {
    let result = this.sessions();
    const subject = this.selectedSubject();
    const search = this.trainerSearch().toLowerCase().trim();

    if (subject) {
      result = result.filter((s) => s.topics.includes(subject));
    }
    if (search) {
      result = result.filter((s) =>
        s.trainerName.toLowerCase().includes(search),
      );
    }
    return result;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadSessions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onSubjectFilterChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedSubject.set(value);
  }

  onTrainerSearchChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.trainerSearch.set(value);
  }

  openDetail(session: TrainingSession): void {
    this.selectedSession.set(session);
  }

  closeDetail(): void {
    this.selectedSession.set(null);
  }

  onEnroll(sessionId: string): void {
    this.enrollingId.set(sessionId);

    this.subscriptions.add(
      this.bff.post<EnrollmentResponse>(
        `/api/v1/training/sessions/${encodeURIComponent(sessionId)}/enroll`,
        {},
      ).subscribe({
        next: (result) => {
          this.enrollingId.set(null);
          this.enrolledIds.update((ids) => {
            const next = new Set(ids);
            next.add(sessionId);
            return next;
          });
          this.sessions.update((list) =>
            list.map((s) =>
              s.id === sessionId
                ? {
                    ...s,
                    isEnrolled: true,
                    enrolledCount: s.enrolledCount + (result.waitlistPosition === null ? 1 : 0),
                    waitlistPosition: result.waitlistPosition,
                  }
                : s,
            ),
          );
          // Update selected session if detail modal is open
          const selected = this.selectedSession();
          if (selected?.id === sessionId) {
            const updated = this.sessions().find((s) => s.id === sessionId);
            if (updated) this.selectedSession.set(updated);
          }
          this.toast.show('training.toast.enrolled', 'success');
        },
        error: () => {
          this.enrollingId.set(null);
          this.toast.show('training.toast.enroll-failed', 'error');
        },
      }),
    );
  }

  onWithdraw(sessionId: string): void {
    this.enrollingId.set(sessionId);

    this.subscriptions.add(
      this.bff.delete<void>(
        `/api/v1/training/sessions/${encodeURIComponent(sessionId)}/enroll`,
      ).subscribe({
        next: () => {
          this.enrollingId.set(null);
          this.enrolledIds.update((ids) => {
            const next = new Set(ids);
            next.delete(sessionId);
            return next;
          });
          this.sessions.update((list) =>
            list.map((s) =>
              s.id === sessionId
                ? { ...s, isEnrolled: false, enrolledCount: Math.max(0, s.enrolledCount - 1), waitlistPosition: null }
                : s,
            ),
          );
          const selected = this.selectedSession();
          if (selected?.id === sessionId) {
            const updated = this.sessions().find((s) => s.id === sessionId);
            if (updated) this.selectedSession.set(updated);
          }
          this.toast.show('training.toast.withdrawn', 'success');
        },
        error: () => {
          this.enrollingId.set(null);
          this.toast.show('training.toast.withdraw-failed', 'error');
        },
      }),
    );
  }

  formatDateTime(isoString: string): string {
    try {
      const dt = new Date(isoString);
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(dt);
    } catch {
      return isoString;
    }
  }

  getCapacityLevel(session: TrainingSession) {
    return getCapacityLevel(session);
  }

  private loadSessions(): void {
    this.loading.set(true);
    this.error.set(null);

    this.subscriptions.add(
      this.bff.get<TrainingSessionListResponse>(
        '/api/v1/training/sessions?status=published',
      ).subscribe({
        next: (response) => {
          this.sessions.set(response.data);
          const enrolled = new Set<string>();
          for (const s of response.data) {
            if (s.isEnrolled) enrolled.add(s.id);
          }
          this.enrolledIds.set(enrolled);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message || 'Failed to load sessions');
          this.loading.set(false);
        },
      }),
    );
  }
}
