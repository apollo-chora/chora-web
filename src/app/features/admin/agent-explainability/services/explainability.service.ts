/**
 * ExplainabilityService — REST adapter for the governance investigation agent.
 *
 * Source of truth: chora-contracts/openapi/governance-admin.yaml
 * All HTTP calls go through BffClientService.
 */
import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, tap, catchError, of } from 'rxjs';
import { BffClientService } from '../../../../core/services/bff-client.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Verdict = 'approved' | 'denied' | 'escalated' | 'inconclusive';

export interface ReasoningStep {
  step_number: number;
  description: string;
  evidence: string;
  confidence: number;
}

export interface PolicyReference {
  name: string;
  description: string;
  trigger_reason: string;
}

export interface Investigation {
  decision_id: string;
  agent_name: string;
  verdict: Verdict;
  reasoning_steps: ReasoningStep[];
  reasoning_summary: string;
  policy_references: PolicyReference[];
  timestamp: string;
}

export interface InvestigationRequest {
  agent_name?: string;
  date_from?: string;
  date_to?: string;
  verdict?: Verdict;
}

export interface InvestigationResponse {
  investigations: Investigation[];
  governance: Record<string, unknown>;
}

export type InvestigationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: InvestigationResponse }
  | { status: 'error'; error: { code: string; message: string } };

// ---------------------------------------------------------------------------
// Endpoint Path
// ---------------------------------------------------------------------------

const INVESTIGATE_PATH = '/api/v1/governance/agents/investigate';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable({ providedIn: 'root' })
export class ExplainabilityService {
  private readonly bff = inject(BffClientService);

  // --- State ---
  private readonly _investigationState = signal<InvestigationState>({ status: 'idle' });
  readonly investigationState = this._investigationState.asReadonly();

  // --- Computed ---
  readonly investigations = computed(() => {
    const s = this._investigationState();
    return s.status === 'success' ? s.data.investigations : [];
  });

  // ---------------------------------------------------------------------------
  // Investigate
  // ---------------------------------------------------------------------------

  investigate(request: InvestigationRequest): Observable<InvestigationResponse | null> {
    this._investigationState.set({ status: 'loading' });

    return this.bff.post<InvestigationResponse>(INVESTIGATE_PATH, request).pipe(
      tap((data) => {
        this._investigationState.set({ status: 'success', data });
      }),
      catchError((err: Error) => {
        this._investigationState.set({
          status: 'error',
          error: { code: 'INVESTIGATION_FAILED', message: err.message },
        });
        return of(null);
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  reset(): void {
    this._investigationState.set({ status: 'idle' });
  }
}
