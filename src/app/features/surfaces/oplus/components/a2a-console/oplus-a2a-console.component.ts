/**
 * O+ A2A Console — pending or live (Phase-D, plan §D6).
 *
 * Hydrated from the polled `a2a()` signal on `GovernanceService`. The
 * BFF route `/bff/oplus/a2a` returns either a `mode: 'pending'` payload
 * (when chora-a2a backend isn't LIVE yet — per plan §B6) or a
 * `mode: 'live'` payload with real contracts/identities/invocations.
 *
 *   if (data.mode === 'pending') {
 *     // render data + visible 'A2A backend deployment pending' banner
 *   } else {
 *     // render real data
 *   }
 *
 * `Issue API key` + `Pause partner` actions remain `disabled` until
 * the A2A backend lands — per the deferred-action convention (anchor
 * #5 — read-only this wave).
 *
 * Surface accent: IMDA violet (`#7b2d8e`) + magenta (`#c4107b`) via
 * `.surface-oplus`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import {
  GovernanceService,
  badgeVariant,
  hasData,
  type A2aData,
  type LiveBadgeVariant,
} from '../../../../../core/services/governance.service';

@Component({
  selector: 'chora-oplus-a2a-console',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './oplus-a2a-console.component.html',
  styleUrl: './oplus-a2a-console.component.scss',
})
export class OplusA2aConsoleComponent {
  private readonly svc = inject(GovernanceService);

  /** Polled A2A state. */
  protected readonly state = this.svc.a2a();

  /** Cached payload — null until first load lands. */
  protected readonly data = computed<A2aData | null>(() => {
    const s = this.state();
    return hasData(s) ? s.data : null;
  });

  /** Whether the BFF reported `mode: 'pending'`. */
  protected readonly isPendingMode = computed<boolean>(() => {
    const d = this.data();
    return d?.mode === 'pending';
  });

  protected readonly contracts = computed(() => this.data()?.contracts ?? []);
  protected readonly externalAgents = computed(() => this.data()?.external_agents ?? []);
  protected readonly invocations = computed(() => this.data()?.invocations ?? []);

  /** Counter chips. */
  protected readonly activeContracts = computed(
    () => this.contracts().filter((c) => c.status === 'active').length,
  );

  protected readonly pausedContracts = computed(
    () => this.contracts().filter((c) => c.status === 'paused').length,
  );

  protected readonly deniedRecent = computed(
    () => this.invocations().filter((i) => i.status === 'denied').length,
  );

  /** Header badge. */
  protected readonly badge = computed<LiveBadgeVariant>(() => badgeVariant(this.state()));

  protected readonly badgeKey = computed<string>(() => {
    switch (this.badge()) {
      case 'live':
        return 'oplus.dashboard.badge_live';
      case 'stale':
        return 'oplus.dashboard.badge_stale';
      case 'offline':
        return 'oplus.dashboard.badge_offline';
      default:
        return 'oplus.dashboard.badge_loading';
    }
  });

  /** Auditor / error branching. */
  protected readonly isAuditorGated = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && s.error.kind === 'forbidden';
  });

  protected readonly hasErrorOnly = computed<boolean>(() => {
    const s = this.state();
    return s.state === 'error' && this.data() === null;
  });

  protected readonly errorKey = computed<string>(() => {
    const s = this.state();
    return s.state === 'error' ? s.error.messageKey : 'oplus.errors.generic';
  });

  // ─── Template helpers ───────────────────────────────────────────────

  /** Format ISO timestamp for table display. */
  protected fmtTime(iso: string | null): string {
    if (iso === null) return '–';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  protected fmtScope(scope: readonly string[]): string {
    return scope.join(', ');
  }
}
