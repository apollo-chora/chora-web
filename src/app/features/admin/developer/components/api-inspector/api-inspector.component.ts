/**
 * APIInspectorComponent — View recent API requests/responses, replay requests.
 *
 * Route: /admin/developer/api-inspector
 *
 * Features:
 *   - Request log table with method, URL, status, duration
 *   - Expandable row detail: headers, request/response bodies
 *   - Replay button to re-execute a recorded request
 *   - Filter by HTTP method and status code range
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
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { DeveloperService } from '../../services/developer.service';
import type { APIRequestLog, HttpMethod } from '../../models/developer.model';

const ALL_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

@Component({
  selector: 'chora-api-inspector',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './api-inspector.component.html',
  styleUrl: './api-inspector.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class APIInspectorComponent implements OnInit, OnDestroy {
  private readonly developerService = inject(DeveloperService);
  private readonly toast = inject(ToastService);

  // --- State ---
  readonly requestLogs = signal<APIRequestLog[]>([]);
  readonly loading = signal(false);
  readonly replaying = signal<string | null>(null);
  readonly expandedRequestId = signal<string | null>(null);
  readonly methodFilter = signal<HttpMethod | null>(null);

  // --- Constants ---
  readonly allMethods = ALL_METHODS;

  // --- Computed ---
  readonly filteredLogs = computed(() => {
    const logs = this.requestLogs();
    const method = this.methodFilter();
    if (!method) return logs;
    return logs.filter((l) => l.method === method);
  });

  readonly totalRequests = computed(() => this.requestLogs().length);
  readonly avgDuration = computed(() => {
    const logs = this.requestLogs();
    if (logs.length === 0) return 0;
    return Math.round(logs.reduce((sum, l) => sum + l.durationMs, 0) / logs.length);
  });
  readonly errorCount = computed(
    () => this.requestLogs().filter((l) => l.status >= 400).length,
  );

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadLogs();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadLogs(): void {
    this.loading.set(true);
    this.subscriptions.add(
      this.developerService.getRequestLogs().subscribe({
        next: (logs) => {
          this.requestLogs.set(logs);
          this.loading.set(false);
        },
        error: () => {
          this.toast.show('admin.developer.api_logs_error', 'error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  toggleExpand(requestId: string): void {
    this.expandedRequestId.update((current) =>
      current === requestId ? null : requestId,
    );
  }

  isExpanded(requestId: string): boolean {
    return this.expandedRequestId() === requestId;
  }

  replayRequest(requestId: string): void {
    this.replaying.set(requestId);
    this.subscriptions.add(
      this.developerService.replayRequest(requestId).subscribe({
        next: (result) => {
          this.requestLogs.update((current) => [result, ...current]);
          this.toast.show('admin.developer.replay_success', 'success');
          this.replaying.set(null);
        },
        error: () => {
          this.toast.show('admin.developer.replay_error', 'error');
          this.replaying.set(null);
        },
      }),
    );
  }

  onMethodFilter(method: HttpMethod | null): void {
    this.methodFilter.set(method);
  }

  refresh(): void {
    this.loadLogs();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  statusClass(status: number): string {
    const prefix = Math.floor(status / 100).toString();
    const classMap: Record<string, string> = {
      '2': 'api-inspector__status--success',
      '3': 'api-inspector__status--redirect',
      '4': 'api-inspector__status--client-error',
      '5': 'api-inspector__status--server-error',
    };
    return classMap[prefix] ?? '';
  }

  methodClass(method: string): string {
    return `api-inspector__method--${method.toLowerCase()}`;
  }

  formatTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  }

  headerEntries(headers: Record<string, string>): { key: string; value: string }[] {
    return Object.entries(headers).map(([key, value]) => ({ key, value }));
  }
}
