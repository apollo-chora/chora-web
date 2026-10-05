/**
 * OplusEgressAuditComponent — CHO-2245 (ADR-231 Amendment 2026-07-17).
 *
 * The O+ read-only transparency trail of external web egress: every grounded
 * web call a learner's Familiar routed through chora-model-gateway, permitted
 * or denied. IMDA D1 accountability + D2 transparency.
 *
 * AUDITOR / ADMIN / OWNER. The AuditorGate on `/bff/oplus/*` is the real gate;
 * this panel does no role check of its own. A refused read (403) renders as an
 * insufficient-role message, NEVER as an empty list — an empty list reads as
 * "no egress happened", which is a different and dangerous claim.
 *
 * Poll-free: one fetch on init, plus a manual refresh. No timers.
 *
 * `webSearchQueries` is rendered strictly as "what was searched" — the search
 * QUERY the model issued, never the web-sourced content or knowledge it
 * returned (proto §web_search_queries constraint).
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { EgressAuditService, egressAuditErrorKey } from './egress-audit.service';
import type {
  EgressAuditEvent,
  EgressAuditLoadState,
} from './egress-audit.model';

@Component({
  selector: 'chora-oplus-egress-audit',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './oplus-egress-audit.component.html',
  styleUrl: './oplus-egress-audit.component.scss',
})
export class OplusEgressAuditComponent {
  private readonly svc = inject(EgressAuditService);

  readonly loadState = signal<EgressAuditLoadState>({ status: 'loading' });

  readonly items = computed<readonly EgressAuditEvent[]>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.response.items : [];
  });

  readonly count = computed<number>(() => this.items().length);
  readonly hasItems = computed<boolean>(() => this.items().length > 0);
  readonly loading = computed<boolean>(() => this.loadState().status === 'loading');

  // Narrowing a discriminated union through a signal call is not possible in a
  // template, so it happens here in TypeScript where the compiler checks it.
  readonly errorKey = computed<string | null>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.errorKey : null;
  });

  /** A refused read (403) gets its own message, distinct from a real outage. */
  readonly isForbidden = computed<boolean>(
    () => this.errorKey() === 'oplus.egressAudit.error.forbidden',
  );

  constructor() {
    this.load();
  }

  load(): void {
    this.loadState.set({ status: 'loading' });
    this.svc.list().subscribe({
      next: (response) => this.loadState.set({ status: 'success', response }),
      error: (err: unknown) =>
        this.loadState.set({ status: 'error', errorKey: egressAuditErrorKey(err) }),
    });
  }

  // ─── Template helpers (pure formatting — no fabrication) ─────────────────

  protected isDenied(ev: EgressAuditEvent): boolean {
    return ev.decision === 'denied';
  }

  /** ANOMALY maps to decision="permitted" upstream; keep it visible. */
  protected isAnomaly(ev: EgressAuditEvent): boolean {
    return ev.after?.result === 'AUDIT_RESULT_ANOMALY';
  }

  protected subjectOf(ev: EgressAuditEvent): string {
    return (ev.subject_id ?? ev.after?.agentId ?? '').trim();
  }

  protected actionCodeOf(ev: EgressAuditEvent): string {
    return (ev.after?.actionCode ?? '').trim();
  }

  protected queriesOf(ev: EgressAuditEvent): readonly string[] {
    return ev.after?.webSearchQueries ?? [];
  }

  protected hasQueries(ev: EgressAuditEvent): boolean {
    return this.queriesOf(ev).length > 0;
  }

  protected citationCountOf(ev: EgressAuditEvent): number | null {
    return ev.after?.citationCount ?? null;
  }

  protected armorPreOf(ev: EgressAuditEvent): string {
    return (ev.after?.modelArmorVerdictPre ?? '').trim();
  }

  protected armorPostOf(ev: EgressAuditEvent): string {
    return (ev.after?.modelArmorVerdictPost ?? '').trim();
  }

  protected vendorOf(ev: EgressAuditEvent): string {
    return (ev.after?.vendor ?? '').trim();
  }

  protected modelOf(ev: EgressAuditEvent): string {
    return (ev.after?.modelVersion ?? '').trim();
  }

  /** Format the RFC3339 audit timestamp for display; echo the raw on parse fail. */
  protected fmtTime(iso: string): string {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  /** Stable @for track key. */
  protected trackRow = (_: number, ev: EgressAuditEvent): string => ev.event_id;
}
