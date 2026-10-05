/**
 * IncidentDashboardComponent — Active incidents list with resolution workflow.
 *
 * Route: /admin/investigation/incidents
 *
 * Features:
 *   - Active incidents list (severity, status, assigned)
 *   - Resolution timeline
 *   - Affected services view
 *   - Action buttons (acknowledge, escalate, resolve)
 *   - Role-gated: super_admin only
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
import { FormsModule } from '@angular/forms';
import { UpperCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { InvestigationService } from '../../services/investigation.service';
import type {
  Incident,
  IncidentSeverity,
  IncidentStatus,
  ResolutionTimelineEntry,
} from '../../models/investigation.model';
import {
  ALL_INCIDENT_SEVERITIES,
  ALL_INCIDENT_STATUSES,
  SEVERITY_LABELS,
  STATUS_LABELS,
} from '../../models/investigation.model';

@Component({
  selector: 'chora-incident-dashboard',
  standalone: true,
  imports: [FormsModule, UpperCasePipe, RouterLink, TranslatePipe],
  templateUrl: './incident-dashboard.component.html',
  styleUrl: './incident-dashboard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncidentDashboardComponent implements OnInit, OnDestroy {
  private readonly investigationService = inject(InvestigationService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly incidents = signal<Incident[]>([]);
  readonly loading = signal(false);
  readonly selectedIncidentId = signal<string | null>(null);
  readonly timeline = signal<ResolutionTimelineEntry[]>([]);
  readonly timelineLoading = signal(false);

  // --- Filters ---
  readonly filterSeverity = signal<IncidentSeverity | null>(null);
  readonly filterStatus = signal<IncidentStatus | null>(null);

  // --- Constants ---
  readonly allSeverities = ALL_INCIDENT_SEVERITIES;
  readonly allStatuses = ALL_INCIDENT_STATUSES;
  readonly severityLabels = SEVERITY_LABELS;
  readonly statusLabels = STATUS_LABELS;

  // --- Computed ---
  readonly filteredIncidents = computed(() => {
    let result = this.incidents();
    const severity = this.filterSeverity();
    const status = this.filterStatus();

    if (severity) {
      result = result.filter((i) => i.severity === severity);
    }
    if (status) {
      result = result.filter((i) => i.status === status);
    }

    return result;
  });

  readonly selectedIncident = computed(() => {
    const id = this.selectedIncidentId();
    if (!id) return null;
    return this.incidents().find((i) => i.id === id) ?? null;
  });

  readonly isEmpty = computed(
    () => !this.loading() && this.filteredIncidents().length === 0,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadIncidents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadIncidents(): void {
    this.loading.set(true);

    this.subscriptions.add(
      this.investigationService.getActiveIncidents().subscribe({
        next: (incidents) => {
          this.incidents.set(incidents);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.investigation.incidents_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Selection & Timeline
  // -------------------------------------------------------------------------

  selectIncident(id: string): void {
    if (this.selectedIncidentId() === id) {
      this.selectedIncidentId.set(null);
      this.timeline.set([]);
      return;
    }

    this.selectedIncidentId.set(id);
    this.loadTimeline(id);
  }

  private loadTimeline(incidentId: string): void {
    this.timelineLoading.set(true);

    this.subscriptions.add(
      this.investigationService.getIncidentTimeline(incidentId).subscribe({
        next: (entries) => {
          this.timeline.set(entries);
          this.timelineLoading.set(false);
        },
        error: () => {
          this.toast.show('admin.investigation.timeline_load_error', 'error');
          this.timelineLoading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onSeverityFilter(value: string): void {
    this.filterSeverity.set(value === '' ? null : value as IncidentSeverity);
  }

  onStatusFilter(value: string): void {
    this.filterStatus.set(value === '' ? null : value as IncidentStatus);
  }

  // -------------------------------------------------------------------------
  // Incident Actions
  // -------------------------------------------------------------------------

  async acknowledgeIncident(incident: Incident): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.investigation.acknowledge_title',
      message: 'admin.investigation.acknowledge_message',
      confirmText: 'admin.investigation.acknowledge',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.investigationService.transitionIncident(incident.id, 'acknowledged').subscribe({
        next: () => {
          this.toast.show('admin.investigation.acknowledged', 'success');
          this.loadIncidents();
        },
        error: () => {
          this.toast.show('admin.investigation.acknowledge_error', 'error');
        },
      }),
    );
  }

  async escalateIncident(incident: Incident): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.investigation.escalate_title',
      message: 'admin.investigation.escalate_message',
      confirmText: 'admin.investigation.escalate',
      variant: 'danger',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.investigationService.transitionIncident(incident.id, 'investigating').subscribe({
        next: () => {
          this.toast.show('admin.investigation.escalated', 'success');
          this.loadIncidents();
        },
        error: () => {
          this.toast.show('admin.investigation.escalate_error', 'error');
        },
      }),
    );
  }

  async resolveIncident(incident: Incident): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.investigation.resolve_title',
      message: 'admin.investigation.resolve_message',
      confirmText: 'admin.investigation.resolve',
      variant: 'info',
    });

    if (!confirmed) return;

    this.subscriptions.add(
      this.investigationService.transitionIncident(incident.id, 'resolved').subscribe({
        next: () => {
          this.toast.show('admin.investigation.resolved', 'success');
          this.loadIncidents();
        },
        error: () => {
          this.toast.show('admin.investigation.resolve_error', 'error');
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  isSelected(id: string): boolean {
    return this.selectedIncidentId() === id;
  }

  severityClass(severity: string): string {
    return `incident-dashboard__severity--${severity}`;
  }

  statusClass(status: string): string {
    return `incident-dashboard__status--${status}`;
  }

  canAcknowledge(incident: Incident): boolean {
    return incident.status === 'open';
  }

  canEscalate(incident: Incident): boolean {
    return incident.status === 'open' || incident.status === 'acknowledged';
  }

  canResolve(incident: Incident): boolean {
    return incident.status !== 'resolved';
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  formatTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  }
}
