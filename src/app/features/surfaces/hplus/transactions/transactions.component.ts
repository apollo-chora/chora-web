/**
 * H+ Transaction History — tenant-admin / operator unified ledger surface
 * (/h/transactions, ADR-205 / CHO-1945).
 *
 * Rewired from the old payments-admin purchases table to the shared,
 * scope-parameterized <chora-transaction-history> read projection (C1 /
 * CHO-1943). This page owns the ADR-205 D1 scope decision — the component
 * never infers scope from roles:
 *   - PLATFORM_OPERATOR → 'master' — cross-franchisee span-all (ADR-165
 *     WithRLSBypass + audit, server-side) + the per-franchisee selector.
 *   - every other admin role (TENANT_ADMIN / OWNER / AUDITOR) → 'tenant' —
 *     own tenant, all members (auto-scoped by the BFF tenant GUC).
 *
 * Read-only by design: the unified ledger is a CQRS read projection. The
 * inline refund flow that previously lived here was removed at this rewire
 * (owner steer 2026-06-29); refund UX re-introduction is tracked as a
 * follow-up story (CHO-1951). The refund API endpoint
 * (POST /api/v1/admin/payments/{id}/refund) is unchanged and still callable.
 *
 * The route + role gate (roleGuard('tenant:view_payments')) are unchanged in
 * hplus.routes.ts; the parent /h authGuard still applies.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';

import { AuthService } from '../../../../core/auth/auth.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TransactionHistoryComponent } from '../../../../shared/components/transaction-history/transaction-history.component';
import { type TransactionScope } from '../../../../shared/components/transaction-history/transaction-history.model';

@Component({
  selector: 'chora-hplus-transactions',
  standalone: true,
  imports: [TranslatePipe, TransactionHistoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transactions.component.html',
  styleUrl: './transactions.component.scss',
})
export class TransactionsComponent {
  private readonly auth = inject(AuthService);

  /**
   * ADR-205 D1 scope, owned by this mounting surface. Role claims may arrive
   * in either case across IdPs (JWT lowercases them; fixtures upper-case), so
   * compare lowercase. PLATFORM_OPERATOR is the sole cross-tenant role →
   * 'master' (span-all + franchisee selector); all other admin roles see
   * their own tenant → 'tenant'.
   */
  readonly scope = computed<TransactionScope>(() =>
    (this.auth.user()?.roles ?? [])
      .map((r) => r.toLowerCase())
      .includes('platform_operator')
      ? 'master'
      : 'tenant',
  );
}
