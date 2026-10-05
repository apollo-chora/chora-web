/**
 * H+ ownership handover at `/h/ownership` (screens S7a to S7c).
 *
 * # WHY THIS SCREEN IS STATE-DRIVEN AND NOT TABBED
 *
 * The pass 4 mockup draws four tabs, because a walkthrough has to let a
 * reviewer see every state at once. A real screen shows the one that is true.
 * Tabs here would be a mode switch, which the integrative-UI invariant rules
 * out, and worse: they would put a nominee's Accept button in front of the
 * owner, and an operator's override in front of somebody who cannot use it.
 *
 * So the screen asks three questions, and every answer comes from the server:
 * is an offer open, who is the session, and who holds the owner row. It renders
 * exactly one of five outcomes.
 *
 * # WHAT THIS COMPONENT DOES NOT DECIDE
 *
 * It does not decide who may hand over. The owner check here is what keeps a
 * tenant admin from being shown a form whose every submission can only 403; the
 * REAL gate is chora-tenancy, which checks the live owner row inside the write
 * transaction. Same for the nominee: the picker is a convenience, and
 * membership is verified again at acceptance, because the roster changes
 * between nomination and answer.
 *
 * It does not decide whether an offer is still live either. `is_live` is
 * computed by the server; no reaper writes the expired status, so a row past
 * its TTL is still `pending` in the table, and a local clock comparison here
 * could disagree with the write that follows it.
 */
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { TenantMembersAdminService } from '../../../admin/tenant-admin/services/tenant-members-admin.service';
import type { TenantMemberSummary } from '../../../admin/tenant-admin/models/tenant-members-admin.model';
import { OwnershipService } from './ownership.service';
import type { OwnershipRefusal, OwnershipVerb } from './ownership.model';

/** One roster row as the screen renders it. */
export interface OwnershipRosterRow {
  readonly gcid: string;
  readonly name: string;
  readonly email: string;
  readonly roles: readonly string[];
  readonly isOwner: boolean;
}

/** Roster load outcome. `forbidden` is a real answer, not a fault. */
type RosterState = 'loading' | 'ready' | 'unavailable';

@Component({
  selector: 'chora-h-ownership',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ownership.component.html',
  styleUrl: './ownership.component.scss',
})
export class OwnershipComponent implements OnInit {
  private readonly ownership = inject(OwnershipService);
  private readonly membersApi = inject(TenantMembersAdminService);
  private readonly auth = inject(AuthService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly rbac = inject(RbacService);

  readonly offerState = this.ownership.offerState;

  private readonly _roster = signal<readonly OwnershipRosterRow[]>([]);
  private readonly _rosterState = signal<RosterState>('loading');
  readonly roster = this._roster.asReadonly();
  readonly rosterState = this._rosterState.asReadonly();

  private readonly _nominee = signal<string>('');
  private readonly _note = signal<string>('');
  private readonly _reason = signal<string>('');
  private readonly _busy = signal<boolean>(false);
  private readonly _refusal = signal<OwnershipRefusal | null>(null);
  private readonly _failed = signal<boolean>(false);

  readonly nominee = this._nominee.asReadonly();
  readonly note = this._note.asReadonly();
  readonly reason = this._reason.asReadonly();
  readonly busy = this._busy.asReadonly();
  readonly refusal = this._refusal.asReadonly();
  readonly failed = this._failed.asReadonly();

  /** The signed-in GCID, or empty before the session resolves. */
  readonly sessionGcid = computed<string>(() => this.auth.gcid() ?? '');

  readonly isOperator = computed<boolean>(() => this.rbac.hasRole('platform_operator'));

  readonly isLoading = computed<boolean>(() => this.offerState().status === 'loading');
  readonly errorKey = computed<string>(() => {
    const s = this.offerState();
    return s.status === 'error' ? s.error : '';
  });

  /** The open offer, or null when none is. */
  readonly offer = computed(() => {
    const s = this.offerState();
    return s.status === 'open' ? s.offer : null;
  });

  /** Who holds the owner row, per the roster. Null when nobody does. */
  readonly ownerRow = computed<OwnershipRosterRow | null>(
    () => this.roster().find((r) => r.isOwner) ?? null,
  );

  readonly callerIsOwner = computed<boolean>(() => {
    const owner = this.ownerRow();
    const me = this.sessionGcid();
    return owner !== null && me !== '' && owner.gcid === me;
  });

  /** Everybody except the current owner. The owner cannot nominate themselves. */
  readonly candidates = computed<readonly OwnershipRosterRow[]>(() =>
    this.roster().filter((r) => !r.isOwner),
  );

  readonly hasCandidates = computed<boolean>(() => this.candidates().length > 0);

  // --- which state the screen is in ---------------------------------------

  readonly viewerIsNominee = computed<boolean>(() => {
    const o = this.offer();
    return o !== null && o.to_gcid === this.sessionGcid();
  });

  readonly viewerIsInitiator = computed<boolean>(() => {
    const o = this.offer();
    return o !== null && o.initiated_by === this.sessionGcid();
  });

  /** An offer stands but the viewer is neither party. */
  readonly viewerIsBystander = computed<boolean>(
    () => this.offer() !== null && !this.viewerIsNominee() && !this.viewerIsInitiator(),
  );

  readonly offerLapsed = computed<boolean>(() => {
    const o = this.offer();
    return o !== null && !o.is_live;
  });

  /** S7a is shown only with no offer open, to the owner, with somebody to pick. */
  readonly canHandOver = computed<boolean>(
    () => this.offer() === null && this.callerIsOwner(),
  );

  /** S7c is shown to an operator whenever no offer stands. */
  readonly canAssign = computed<boolean>(
    () => this.offer() === null && this.isOperator(),
  );

  /**
   * Nobody on this screen can do anything: no offer, not the owner, not an
   * operator. Saying so is better than an empty panel that reads as a fault.
   */
  readonly nothingToDo = computed<boolean>(
    () => this.offer() === null && !this.canHandOver() && !this.canAssign(),
  );

  /** The nominee's display name, for the waiting copy. */
  readonly nomineeName = computed<string>(() => {
    const o = this.offer();
    if (o === null) return '';
    return this.roster().find((r) => r.gcid === o.to_gcid)?.name ?? o.to_gcid;
  });

  /**
   * The organisation the override acts on: the SESSION's active tenant.
   *
   * Not the open offer's tenant_id, which is null by construction here (this
   * form only renders when no offer is open), and not a route param, because
   * the roster and every me-route on this screen are already scoped to the
   * session. An operator acts on an organisation by being switched into it,
   * which is how every other H+ screen works and what /h/tenants/new does on
   * its 201.
   */
  readonly activeTenantId = computed<string>(() => this.tenantContext.tenantId() ?? '');

  readonly assignReady = computed<boolean>(
    () =>
      this._nominee() !== '' &&
      this._reason().trim() !== '' &&
      this.activeTenantId() !== '' &&
      !this._busy(),
  );

  readonly offerReady = computed<boolean>(
    () => this._nominee() !== '' && !this._busy(),
  );

  ngOnInit(): void {
    this.ownership.loadOffer();
    this.loadRoster();
  }

  setNominee(value: string): void {
    this._nominee.set(value);
  }

  setNote(value: string): void {
    this._note.set(value);
  }

  setReason(value: string): void {
    this._reason.set(value);
  }

  /** S7a. Offer ownership to the chosen member. */
  sendOffer(): void {
    if (!this.offerReady()) return;
    this.begin();
    this.ownership
      .offer(this._nominee(), this._note())
      .pipe(take(1))
      .subscribe((r) => this.finish(r));
  }

  /** S7b and S7a. Answer the open offer by its id. */
  settle(verb: OwnershipVerb): void {
    const o = this.offer();
    if (o === null || this._busy()) return;
    this.begin();
    this.ownership
      .settle(o.offer_id, verb)
      .pipe(take(1))
      .subscribe((r) => this.finish(r));
  }

  /** S7c. The operator override. The reason is mandatory. */
  sendAssign(): void {
    if (!this.assignReady()) return;
    this.begin();
    this.ownership
      .assignOwner(this.activeTenantId(), this._nominee(), this._reason().trim())
      .pipe(take(1))
      .subscribe((r) => this.finish(r));
  }

  retry(): void {
    this.ownership.loadOffer();
    this.loadRoster();
  }

  private begin(): void {
    this._busy.set(true);
    this._refusal.set(null);
    this._failed.set(false);
  }

  /**
   * Every write ends with a re-read rather than a local edit of the state. The
   * server decides what the tenant looks like afterwards, and an optimistic
   * update here would be this screen's own opinion of a transaction it did not
   * run.
   */
  private finish(result: {
    kind: 'success' | 'refused' | 'failed';
    reason?: OwnershipRefusal;
  }): void {
    this._busy.set(false);
    if (result.kind === 'refused') {
      this._refusal.set(result.reason ?? null);
      return;
    }
    if (result.kind === 'failed') {
      this._failed.set(true);
      return;
    }
    this._nominee.set('');
    this._note.set('');
    this._reason.set('');
    this.ownership.loadOffer();
    this.loadRoster();
  }

  /**
   * The roster read. A forbidden or failed read is `unavailable`, not an empty
   * organisation: rendering "nobody else is here" for a read that never ran
   * would tell an owner they cannot hand over when in fact nobody looked.
   */
  private loadRoster(): void {
    this._rosterState.set('loading');
    this.membersApi
      .roster()
      .pipe(take(1))
      .subscribe((res) => {
        if (res.kind !== 'success') {
          this._roster.set([]);
          this._rosterState.set('unavailable');
          return;
        }
        this._roster.set(res.rows.map((r) => toRow(r)));
        this._rosterState.set('ready');
      });
  }
}

/**
 * Map a roster row. The owner test is case-insensitive and matches the whole
 * role: the identity mirror sends roles UPPERCASE, the tenancy enum stores
 * them lowercase, and role-capabilities.ts maps both. There is deliberately no
 * allowlist of known roles here, because the one in members.component.ts fell
 * back to `learner` and would have shown the owner as a learner on the first
 * load after the migration that widened the enum.
 */
function toRow(r: TenantMemberSummary): OwnershipRosterRow {
  const roles = r.roles ?? [];
  return {
    gcid: r.gcid,
    name: r.display_name || r.email || r.gcid,
    email: r.email,
    roles,
    isOwner: roles.some((role) => role.trim().toLowerCase() === 'owner'),
  };
}
