/**
 * DecisionNotificationComponent — Learner decision notification display.
 * Shows application status with decision badge (color + icon per WCAG 1.4.1),
 * next steps for approved, reason summary for rejected, and carry-forward
 * for deferred decisions.
 *
 * Route: /admissions/applications/:applicationId
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
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { AdmissionService } from '../../services/admission.service';
import type { DecisionResult } from '../../models/admission-learner.model';
import {
  DECISION_LABELS,
  DECISION_ICONS,
} from '../../models/admission-learner.model';

@Component({
  selector: 'chora-decision-notification',
  standalone: true,
  imports: [TranslatePipe, DatePipe],
  templateUrl: './decision-notification.component.html',
  styleUrl: './decision-notification.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DecisionNotificationComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly admissionService = inject(AdmissionService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly loading = signal(false);
  readonly decision = signal<DecisionResult | null>(null);
  readonly applicationId = signal<string | null>(null);

  // --- Constants ---
  readonly decisionLabels = DECISION_LABELS;
  readonly decisionIcons = DECISION_ICONS;

  // --- Computed ---
  readonly isApproved = computed(
    () => this.decision()?.decision === 'approved',
  );
  readonly isRejected = computed(
    () => this.decision()?.decision === 'rejected',
  );
  readonly isDeferred = computed(
    () => this.decision()?.decision === 'deferred',
  );
  readonly hasDecision = computed(() => this.decision() !== null);

  readonly badgeClass = computed(() => {
    const dec = this.decision();
    if (!dec) return '';
    switch (dec.decision) {
      case 'approved':
        return 'decision-notification__badge--approved';
      case 'rejected':
        return 'decision-notification__badge--rejected';
      case 'deferred':
        return 'decision-notification__badge--deferred';
      default:
        return '';
    }
  });

  readonly badgeIcon = computed(() => {
    const dec = this.decision();
    if (!dec) return '';
    switch (dec.decision) {
      case 'approved':
        return '\u2713'; // checkmark
      case 'rejected':
        return '\u2717'; // cross
      case 'deferred':
        return '\u23F0'; // clock
      default:
        return '';
    }
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    const appId = this.route.snapshot.paramMap.get('applicationId');
    this.applicationId.set(appId);

    if (appId) {
      this.loadDecision(appId);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private loadDecision(applicationId: string): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.admissionService.getDecision(applicationId).subscribe({
        next: (result) => {
          if (result) {
            this.decision.set(result);
          }
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admissions.decision_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  navigateToEnrollment(): void {
    const dec = this.decision();
    if (dec?.enrollment_action_url) {
      this.router.navigateByUrl(dec.enrollment_action_url);
    }
  }

  goToApplications(): void {
    this.router.navigate(['/admissions']);
  }

  trackByIndex(index: number): number {
    return index;
  }
}
