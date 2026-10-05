/**
 * CircuitBreakerControlsComponent — Agent circuit breaker state management.
 *
 * Route: /admin/investigation/circuit-breaker
 *
 * Features:
 *   - Agent list with current circuit breaker state (closed/open/half-open)
 *   - Color-coded state badges
 *   - Quarantine button per agent with confirmation dialog
 *   - Traffic routing override controls (canary percentage slider)
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
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BffClientService } from '../../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type CircuitState = 'closed' | 'open' | 'half-open';

interface AgentCircuitBreaker {
  agent_id: string;
  agent_name: string;
  service: string;
  state: CircuitState;
  failure_count: number;
  last_failure_at: string | null;
  canary_pct: number;
  is_quarantined: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATE_LABELS: Record<CircuitState, string> = {
  closed: 'admin.investigation.cb_closed',
  open: 'admin.investigation.cb_open',
  'half-open': 'admin.investigation.cb_half_open',
};

@Component({
  selector: 'chora-circuit-breaker-controls',
  standalone: true,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './circuit-breaker-controls.component.html',
  styleUrl: './circuit-breaker-controls.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CircuitBreakerControlsComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly agents = signal<AgentCircuitBreaker[]>([]);
  readonly loading = signal(false);
  /** i18n key for a fail-loud load failure (null = no error). */
  readonly error = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);

  // --- Computed ---
  readonly closedCount = computed(
    () => this.agents().filter((a) => a.state === 'closed').length,
  );
  readonly openCount = computed(
    () => this.agents().filter((a) => a.state === 'open').length,
  );
  readonly halfOpenCount = computed(
    () => this.agents().filter((a) => a.state === 'half-open').length,
  );
  readonly quarantinedCount = computed(
    () => this.agents().filter((a) => a.is_quarantined).length,
  );

  // --- Constants ---
  readonly stateLabels = STATE_LABELS;

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadAgents();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadAgents(): void {
    this.loading.set(true);
    this.error.set(null);

    this.subscriptions.add(
      this.bff.get<AgentCircuitBreaker[]>('/api/v1/admin/agents/circuit-breakers').subscribe({
        next: (agents) => {
          this.agents.set(agents);
          this.loading.set(false);
        },
        error: () => {
          // Fail loud — a breaker console must NEVER show fabricated agent
          // states (that would mask a real outage / mislead an operator).
          this.agents.set([]);
          this.error.set('admin.investigation.load_error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Quarantine
  // -------------------------------------------------------------------------

  async toggleQuarantine(agent: AgentCircuitBreaker): Promise<void> {
    const action = agent.is_quarantined ? 'unquarantine' : 'quarantine';
    const confirmed = await this.confirmDialog.confirm({
      title: `admin.investigation.${action}_title`,
      message: `admin.investigation.${action}_message`,
      confirmText: `admin.investigation.${action}`,
      variant: agent.is_quarantined ? 'info' : 'danger',
    });

    if (!confirmed) return;

    this.actionInProgress.set(agent.agent_id);

    this.subscriptions.add(
      this.bff.post<void>(
        `/api/v1/admin/agents/${encodeURIComponent(agent.agent_id)}/${action}`,
        {},
      ).subscribe({
        next: () => {
          this.agents.update((list) =>
            list.map((a) =>
              a.agent_id === agent.agent_id
                ? {
                    ...a,
                    is_quarantined: !a.is_quarantined,
                    state: !a.is_quarantined ? 'open' : a.state,
                    canary_pct: !a.is_quarantined ? 0 : a.canary_pct,
                  } as AgentCircuitBreaker
                : a,
            ),
          );
          this.toast.show(`admin.investigation.${action}_success`, 'success');
          this.actionInProgress.set(null);
        },
        error: () => {
          this.toast.show(`admin.investigation.${action}_error`, 'error');
          this.actionInProgress.set(null);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Canary routing
  // -------------------------------------------------------------------------

  onCanaryChange(agentId: string, event: Event): void {
    const pct = Number((event.target as HTMLInputElement).value);
    this.agents.update((list) =>
      list.map((a) => (a.agent_id === agentId ? { ...a, canary_pct: pct } : a)),
    );
  }

  applyCanaryRouting(agent: AgentCircuitBreaker): void {
    this.actionInProgress.set(agent.agent_id);

    this.subscriptions.add(
      this.bff.put<void>(
        `/api/v1/admin/agents/${encodeURIComponent(agent.agent_id)}/routing`,
        { canary_pct: agent.canary_pct },
      ).subscribe({
        next: () => {
          this.toast.show('admin.investigation.routing_updated', 'success');
          this.actionInProgress.set(null);
        },
        error: () => {
          this.toast.show('admin.investigation.routing_error', 'error');
          this.actionInProgress.set(null);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  stateClass(state: CircuitState): string {
    return `circuit-breaker-controls__state--${state}`;
  }

  isActionInProgress(agentId: string): boolean {
    return this.actionInProgress() === agentId;
  }

  formatTimestamp(isoString: string | null): string {
    if (!isoString) return '-';
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  refresh(): void {
    this.loadAgents();
  }
}
