/**
 * ExplainabilityViewerComponent — Search and browse AI agent decision investigations.
 * Filter by agent name, date range, verdict. Expand to see reasoning trace and policies.
 *
 * Route: /admin/governance/explainability
 * Guard: addOnGuard('governance_trust')
 */
import {
  Component,
  ChangeDetectionStrategy,
  OnDestroy,
  inject,
  signal,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { UpperCasePipe } from '@angular/common';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { ToastService } from '../../../../../shared/components/toast/toast.service';
import { ExplainabilityService } from '../../services/explainability.service';
import type { Investigation, Verdict } from '../../services/explainability.service';
import { ReasoningTraceComponent } from '../reasoning-trace/reasoning-trace.component';
import { PolicyReferenceComponent } from '../policy-reference/policy-reference.component';

const VERDICT_OPTIONS: { value: Verdict | ''; label: string }[] = [
  { value: '', label: 'admin.explainability.all_verdicts' },
  { value: 'approved', label: 'admin.explainability.verdict_approved' },
  { value: 'denied', label: 'admin.explainability.verdict_denied' },
  { value: 'escalated', label: 'admin.explainability.verdict_escalated' },
  { value: 'inconclusive', label: 'admin.explainability.verdict_inconclusive' },
];

@Component({
  selector: 'chora-explainability-viewer',
  standalone: true,
  imports: [UpperCasePipe, TranslatePipe, ReasoningTraceComponent, PolicyReferenceComponent],
  templateUrl: './explainability-viewer.component.html',
  styleUrl: './explainability-viewer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplainabilityViewerComponent implements OnDestroy {
  private readonly explainabilityService = inject(ExplainabilityService);
  private readonly toast = inject(ToastService);

  // --- Filter State ---
  readonly agentNameFilter = signal('');
  readonly verdictFilter = signal<Verdict | ''>('');
  readonly dateFromFilter = signal('');
  readonly dateToFilter = signal('');

  // --- Expanded ---
  readonly expandedDecisionId = signal<string | null>(null);

  // --- Delegate to service ---
  readonly investigationState = this.explainabilityService.investigationState;
  readonly investigations = this.explainabilityService.investigations;

  // --- Constants ---
  readonly verdictOptions = VERDICT_OPTIONS;

  private subscriptions = new Subscription();

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  // -------------------------------------------------------------------------
  // Filters
  // -------------------------------------------------------------------------

  onAgentNameInput(event: Event): void {
    this.agentNameFilter.set((event.target as HTMLInputElement).value);
  }

  onVerdictChange(event: Event): void {
    this.verdictFilter.set((event.target as HTMLSelectElement).value as Verdict | '');
  }

  onDateFromInput(event: Event): void {
    this.dateFromFilter.set((event.target as HTMLInputElement).value);
  }

  onDateToInput(event: Event): void {
    this.dateToFilter.set((event.target as HTMLInputElement).value);
  }

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  search(): void {
    this.expandedDecisionId.set(null);
    const verdict = this.verdictFilter();
    this.subscriptions.add(
      this.explainabilityService
        .investigate({
          agent_name: this.agentNameFilter().trim() || undefined,
          verdict: verdict || undefined,
          date_from: this.dateFromFilter() || undefined,
          date_to: this.dateToFilter() || undefined,
        })
        .subscribe({
          error: () => this.toast.show('admin.explainability.search_error', 'error'),
        }),
    );
  }

  // -------------------------------------------------------------------------
  // Expand / Collapse
  // -------------------------------------------------------------------------

  toggleInvestigation(decisionId: string): void {
    if (this.expandedDecisionId() === decisionId) {
      this.expandedDecisionId.set(null);
    } else {
      this.expandedDecisionId.set(decisionId);
    }
  }

  isExpanded(decisionId: string): boolean {
    return this.expandedDecisionId() === decisionId;
  }

  getExpandedInvestigation(): Investigation | null {
    const id = this.expandedDecisionId();
    if (!id) return null;
    return this.investigations().find((inv) => inv.decision_id === id) ?? null;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  verdictClass(verdict: string): string {
    return `explainability-viewer__verdict--${verdict}`;
  }

  formatTimestamp(isoString: string): string {
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  }
}
