/**
 * InvestigationWorkspaceComponent — Ops observability workspace for super_admin.
 *
 * Route: /admin/investigation
 *
 * Features:
 *   - Service health overview (calls gateway /health)
 *   - Recent error log viewer (mock data for now)
 *   - Active alert list
 *   - Quick search for entities by ID (GCID, atom ID, tenant ID)
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
import { InvestigationService } from '../../services/investigation.service';
import type {
  ServiceHealthStatus,
  ErrorLogEntry,
  Incident,
  EntityType,
  EntitySearchResult,
} from '../../models/investigation.model';

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: 'gcid', label: 'admin.investigation.entity_gcid' },
  { value: 'atom', label: 'admin.investigation.entity_atom' },
  { value: 'tenant', label: 'admin.investigation.entity_tenant' },
];

@Component({
  selector: 'chora-investigation-workspace',
  standalone: true,
  imports: [FormsModule, UpperCasePipe, RouterLink, TranslatePipe],
  templateUrl: './investigation-workspace.component.html',
  styleUrl: './investigation-workspace.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvestigationWorkspaceComponent implements OnInit, OnDestroy {
  private readonly investigationService = inject(InvestigationService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly serviceHealth = signal<ServiceHealthStatus[]>([]);
  readonly errorLogs = signal<ErrorLogEntry[]>([]);
  readonly activeIncidents = signal<Incident[]>([]);
  readonly searchResults = signal<EntitySearchResult[]>([]);
  readonly loading = signal(false);
  readonly searching = signal(false);

  // --- Entity Search ---
  readonly searchEntityType = signal<EntityType>('gcid');
  readonly searchEntityId = signal('');

  // --- Constants ---
  readonly entityTypes = ENTITY_TYPES;

  // --- Computed ---
  readonly healthyCount = computed(
    () => this.serviceHealth().filter((s) => s.status === 'healthy').length,
  );
  readonly degradedCount = computed(
    () => this.serviceHealth().filter((s) => s.status === 'degraded').length,
  );
  readonly unhealthyCount = computed(
    () => this.serviceHealth().filter((s) => s.status === 'unhealthy').length,
  );
  readonly totalServices = computed(() => this.serviceHealth().length);
  readonly criticalIncidents = computed(
    () => this.activeIncidents().filter((i) => i.severity === 'critical' || i.severity === 'high').length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAll();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAll(): void {
    this.loading.set(true);
    this.loadServiceHealth();
    this.loadErrorLogs();
    this.loadIncidents();
  }

  private loadServiceHealth(): void {
    this.subscriptions.add(
      this.investigationService.getServiceHealth().subscribe({
        next: (health) => {
          this.serviceHealth.set(health);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.investigation.health_load_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  private loadErrorLogs(): void {
    this.subscriptions.add(
      this.investigationService.getRecentErrors().subscribe({
        next: (logs) => this.errorLogs.set(logs),
        error: () => this.toast.show('admin.investigation.errors_load_error', 'error'),
      }),
    );
  }

  private loadIncidents(): void {
    this.subscriptions.add(
      this.investigationService.getActiveIncidents().subscribe({
        next: (incidents) => this.activeIncidents.set(incidents),
        error: () => this.toast.show('admin.investigation.incidents_load_error', 'error'),
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Entity Search
  // -------------------------------------------------------------------------

  onEntityTypeChange(value: string): void {
    this.searchEntityType.set(value as EntityType);
  }

  onSearchIdInput(event: Event): void {
    this.searchEntityId.set((event.target as HTMLInputElement).value);
  }

  searchEntity(): void {
    const entityId = this.searchEntityId().trim();
    if (!entityId) return;

    this.searching.set(true);
    this.subscriptions.add(
      this.investigationService.searchEntity(this.searchEntityType(), entityId).subscribe({
        next: (results) => {
          this.searchResults.set(results);
          this.searching.set(false);
        },
        error: () => {
          this.toast.show('admin.investigation.search_error', 'error');
          this.searching.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Refresh
  // -------------------------------------------------------------------------

  refresh(): void {
    this.loadAll();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  healthStatusClass(status: string): string {
    return `investigation-workspace__health-dot--${status}`;
  }

  logLevelClass(level: string): string {
    return `investigation-workspace__log-level--${level}`;
  }

  severityClass(severity: string): string {
    return `investigation-workspace__severity--${severity}`;
  }

  formatTimestamp(isoString: string): string {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  }

  formatDateTime(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
