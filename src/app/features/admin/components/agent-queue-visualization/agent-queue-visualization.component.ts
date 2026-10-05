/**
 * AgentQueueVisualizationComponent — Support agent workload & ticket distribution.
 *
 * Route: /admin/support
 *
 * Features:
 *   - Agent workload cards (ticket count, avg resolution time)
 *   - Assignment routing UI (drag tickets between agent queues via select)
 *   - Ticket distribution view (category breakdown)
 *   - Role-gated: support_admin or super_admin
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
import { Subscription } from 'rxjs';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

type TicketPriority = 'urgent' | 'high' | 'normal' | 'low';
type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved';
type TicketCategory = 'account' | 'billing' | 'technical' | 'content' | 'compliance' | 'other';

interface SupportAgent {
  id: string;
  name: string;
  avatar_url: string | null;
  ticket_count: number;
  avg_resolution_minutes: number;
  is_online: boolean;
  current_capacity: number;
  max_capacity: number;
}

interface SupportTicket {
  id: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assigned_agent_id: string | null;
  created_at: string;
  gcid: string;
}

interface CategoryDistribution {
  category: TicketCategory;
  count: number;
  pct: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  urgent: 'admin.support.priority_urgent',
  high: 'admin.support.priority_high',
  normal: 'admin.support.priority_normal',
  low: 'admin.support.priority_low',
};

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  account: 'admin.support.category_account',
  billing: 'admin.support.category_billing',
  technical: 'admin.support.category_technical',
  content: 'admin.support.category_content',
  compliance: 'admin.support.category_compliance',
  other: 'admin.support.category_other',
};

@Component({
  selector: 'chora-agent-queue-visualization',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './agent-queue-visualization.component.html',
  styleUrl: './agent-queue-visualization.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentQueueVisualizationComponent implements OnInit, OnDestroy {
  private readonly bff = inject(BffClientService);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  // --- State ---
  readonly agents = signal<SupportAgent[]>([]);
  readonly tickets = signal<SupportTicket[]>([]);
  readonly loading = signal(false);
  /** i18n key for a fail-loud load failure (null = no error). */
  readonly error = signal<string | null>(null);
  readonly reassigning = signal<string | null>(null);

  // --- Constants ---
  readonly priorityLabels = PRIORITY_LABELS;
  readonly categoryLabels = CATEGORY_LABELS;

  // --- Computed ---
  readonly totalTickets = computed(() => this.tickets().length);

  readonly openTickets = computed(
    () => this.tickets().filter((t) => t.status === 'open').length,
  );

  readonly unassignedTickets = computed(
    () => this.tickets().filter((t) => !t.assigned_agent_id).length,
  );

  readonly categoryDistribution = computed<CategoryDistribution[]>(() => {
    const total = this.tickets().length;
    if (total === 0) return [];

    const counts: Record<string, number> = {};
    for (const ticket of this.tickets()) {
      counts[ticket.category] = (counts[ticket.category] ?? 0) + 1;
    }

    return Object.entries(counts)
      .map(([category, count]) => ({
        category: category as TicketCategory,
        count,
        pct: Math.round((count / total) * 100),
      }))
      .sort((a, b) => b.count - a.count);
  });

  readonly agentTicketMap = computed(() => {
    const map = new Map<string, SupportTicket[]>();
    for (const agent of this.agents()) {
      map.set(
        agent.id,
        this.tickets().filter((t) => t.assigned_agent_id === agent.id),
      );
    }
    return map;
  });

  private subscriptions = new Subscription();

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    this.subscriptions.add(
      this.bff.get<{ agents: SupportAgent[]; tickets: SupportTicket[] }>(
        '/api/v1/admin/support/queue',
      ).subscribe({
        next: (data) => {
          this.agents.set(data.agents);
          this.tickets.set(data.tickets);
          this.loading.set(false);
        },
        error: () => {
          // Fail loud — never seed a fake support queue. Fabricated agent
          // workloads / tickets would misdirect real operator triage.
          this.agents.set([]);
          this.tickets.set([]);
          this.error.set('admin.support.load_error');
          this.loading.set(false);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Ticket reassignment
  // -------------------------------------------------------------------------

  async reassignTicket(ticketId: string, newAgentId: string): Promise<void> {
    if (!newAgentId) return;

    const ticket = this.tickets().find((t) => t.id === ticketId);
    const agent = this.agents().find((a) => a.id === newAgentId);
    if (!ticket || !agent) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'admin.support.reassign_title',
      message: 'admin.support.reassign_message',
      confirmText: 'admin.support.reassign',
      variant: 'info',
    });

    if (!confirmed) return;

    this.reassigning.set(ticketId);

    this.subscriptions.add(
      this.bff.put<void>(
        `/api/v1/admin/support/tickets/${encodeURIComponent(ticketId)}/assign`,
        { agent_id: newAgentId },
      ).subscribe({
        next: () => {
          this.tickets.update((list) =>
            list.map((t) =>
              t.id === ticketId ? { ...t, assigned_agent_id: newAgentId } : t,
            ),
          );
          // Update agent ticket counts
          this.agents.update((list) =>
            list.map((a) => {
              if (a.id === newAgentId) {
                return { ...a, ticket_count: a.ticket_count + 1, current_capacity: a.current_capacity + 1 };
              }
              if (a.id === ticket.assigned_agent_id) {
                return { ...a, ticket_count: Math.max(0, a.ticket_count - 1), current_capacity: Math.max(0, a.current_capacity - 1) };
              }
              return a;
            }),
          );
          this.toast.show('admin.support.reassign_success', 'success');
          this.reassigning.set(null);
        },
        error: () => {
          this.toast.show('admin.support.reassign_error', 'error');
          this.reassigning.set(null);
        },
      }),
    );
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  priorityClass(priority: TicketPriority): string {
    return `agent-queue__priority--${priority}`;
  }

  capacityPct(agent: SupportAgent): number {
    if (agent.max_capacity === 0) return 0;
    return Math.round((agent.current_capacity / agent.max_capacity) * 100);
  }

  capacityBarClass(agent: SupportAgent): string {
    const pct = this.capacityPct(agent);
    if (pct >= 90) return 'agent-queue__capacity-fill--critical';
    if (pct >= 70) return 'agent-queue__capacity-fill--warning';
    return 'agent-queue__capacity-fill--normal';
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }

  formatTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }

  isReassigning(ticketId: string): boolean {
    return this.reassigning() === ticketId;
  }

  refresh(): void {
    this.loadData();
  }

  distributionBarWidth(pct: number): string {
    return `${pct}%`;
  }
}
