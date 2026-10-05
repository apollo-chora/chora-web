/**
 * GuardianDashboardComponent — Overview of linked learners with recent activity summary.
 *
 * Route: /parent/dashboard
 *
 * Features:
 *   - List of guardian-learner links with status badges
 *   - Quick stats per active learner (atoms completed, streak, XP)
 *   - Pending link requests awaiting learner consent
 *   - Unresolved progress alerts banner
 *   - Empty state for no linked learners
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  inject,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ParentService } from '../../services/parent.service';
import {
  GUARDIAN_LINK_STATUS_LABELS,
  GUARDIAN_RELATIONSHIP_LABELS,
  ALERT_SEVERITY_LABELS,
  ALERT_TYPE_LABELS,
} from '../../models/parent.model';

@Component({
  selector: 'chora-guardian-dashboard',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './guardian-dashboard.component.html',
  styleUrl: './guardian-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuardianDashboardComponent implements OnInit, OnDestroy {
  private readonly parentService = inject(ParentService);
  private readonly router = inject(Router);

  // --- State ---
  readonly linkState = this.parentService.linkState;
  readonly alertState = this.parentService.alertState;
  readonly guardianLinks = this.parentService.guardianLinks;
  readonly activeLinks = this.parentService.activeLinks;
  readonly pendingLinks = this.parentService.pendingLinks;
  readonly unresolvedAlerts = this.parentService.unresolvedAlerts;

  // --- Constants ---
  readonly statusLabels = GUARDIAN_LINK_STATUS_LABELS;
  readonly relationshipLabels = GUARDIAN_RELATIONSHIP_LABELS;
  readonly severityLabels = ALERT_SEVERITY_LABELS;
  readonly alertTypeLabels = ALERT_TYPE_LABELS;

  // --- Computed ---
  readonly hasActiveLinks = computed(() => this.activeLinks().length > 0);
  readonly hasPendingLinks = computed(() => this.pendingLinks().length > 0);
  readonly hasAlerts = computed(() => this.unresolvedAlerts().length > 0);

  readonly alertCount = computed(() => this.unresolvedAlerts().length);

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.subscriptions.add(
      this.parentService.loadGuardianLinks().subscribe(),
    );
    this.subscriptions.add(
      this.parentService.loadAlerts().subscribe(),
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  viewProgress(learnerId: string): void {
    this.router.navigate(['/parent', 'progress', learnerId]);
  }

  viewActivity(learnerId: string): void {
    this.router.navigate(['/parent', 'activity', learnerId]);
  }

  manageConsent(): void {
    this.router.navigate(['/parent', 'consent']);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: string): string {
    return `guardian-dashboard__status--${status}`;
  }

  severityClass(severity: string): string {
    return `guardian-dashboard__alert-severity--${severity}`;
  }

  formatDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString();
    } catch {
      return isoString;
    }
  }
}
