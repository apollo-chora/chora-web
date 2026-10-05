/**
 * OplusEgressKillSwitchComponent — CHO-2148 (ADR-231 D6).
 *
 * O+ runtime control: the platform's override on Far Sight web egress.
 *
 * ENGAGING THIS DENIES EVERY GROUNDED WEB CALL, FOR EVERY TENANT, IMMEDIATELY —
 * regardless of what any tenant has opted into in H+. It is not a tenant
 * setting; it is the emergency stop. Three consequences for this screen:
 *
 *  1. ENGAGING REQUIRES AN EXPLICIT CONFIRM. A single mis-click must not take
 *     the capability away from every tenant on the platform.
 *
 *  2. THE STATE RENDERS UNAMBIGUOUSLY. An operator glancing at this page must
 *     never be unsure whether egress is currently blocked. "Engaged" is loud.
 *
 *  3. A FAILED READ IS NEVER RENDERED AS "NOT ENGAGED". That is indistinguish-
 *     able from a real answer, and an operator could believe the platform is
 *     open (or closed) when we simply could not read the switch.
 *
 * PLATFORM_OPERATOR only. The role check here HIDES the control; the API is the
 * gate — the gateway checks the validated session roles fail-closed, and
 * chora-observability re-gates on the mesh header fail-closed. surfaceGuard
 * ('oplus') is NOT sufficient on its own: it admits anyone with O+ surface
 * membership, with operator only as a bypass.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../../shared/pipes/translate.pipe';
import { RbacService } from '../../../../../core/services/rbac.service';
import {
  EgressKillSwitchService,
  killSwitchErrorKey,
} from './egress-kill-switch.service';
import type {
  EgressKillSwitch,
  KillSwitchLoadState,
  KillSwitchWriteState,
} from './egress-kill-switch.model';

@Component({
  selector: 'chora-oplus-egress-kill-switch',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './oplus-egress-kill-switch.component.html',
  styleUrl: './oplus-egress-kill-switch.component.scss',
})
export class OplusEgressKillSwitchComponent {
  private readonly svc = inject(EgressKillSwitchService);
  private readonly rbac = inject(RbacService);

  readonly loadState = signal<KillSwitchLoadState>({ status: 'loading' });
  readonly writeState = signal<KillSwitchWriteState>({ status: 'idle' });
  readonly reasonDraft = signal<string>('');

  /** Hides the control for a non-operator. The API is the real gate. */
  readonly isOperator = computed<boolean>(() =>
    this.rbac.hasRole('platform_operator'),
  );

  readonly killSwitch = computed<EgressKillSwitch | null>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.killSwitch : null;
  });

  /** The CURRENT platform state, as confirmed by the backend. */
  readonly engaged = computed<boolean>(
    () => this.killSwitch()?.engaged ?? false,
  );

  // Angular cannot narrow a discriminated union through a signal call in a
  // template, so the narrowing happens here in TypeScript where it is verified.
  readonly loadErrorKey = computed<string | null>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.errorKey : null;
  });

  readonly writeErrorKey = computed<string | null>(() => {
    const s = this.writeState();
    return s.status === 'error' ? s.errorKey : null;
  });

  readonly writing = computed<boolean>(
    () => this.writeState().status === 'writing',
  );

  /** The pending change awaiting confirmation, if any. */
  readonly pendingChange = computed<boolean | null>(() => {
    const s = this.writeState();
    return s.status === 'confirming' ? s.next : null;
  });

  readonly confirming = computed<boolean>(() => this.pendingChange() !== null);

  constructor() {
    // Don't issue a read we know the API will refuse. Both hops gate this
    // operator-only and fail closed, so a non-operator would just collect a 403.
    if (this.isOperator()) {
      this.load();
    }
  }

  load(): void {
    this.loadState.set({ status: 'loading' });
    this.svc.get().subscribe({
      next: (killSwitch) => {
        this.loadState.set({ status: 'success', killSwitch });
        this.reasonDraft.set(killSwitch.reason ?? '');
      },
      error: (err: unknown) =>
        // Loud. Never a rendered "not engaged" — see the class doc, point 3.
        this.loadState.set({
          status: 'error',
          errorKey: killSwitchErrorKey(err),
        }),
    });
  }

  /** Step 1 — ask. Never writes. */
  requestChange(next: boolean): void {
    if (this.writing()) return;
    this.writeState.set({ status: 'confirming', next });
  }

  /** Step 2 — the operator confirmed. This is the only path that writes. */
  confirm(): void {
    const next = this.pendingChange();
    if (next === null) return;

    this.writeState.set({ status: 'writing' });
    this.svc
      .set({ engaged: next, reason: this.reasonDraft().trim() || undefined })
      .subscribe({
        next: (killSwitch) => {
          // Adopt what the BACKEND confirmed, never the intent.
          this.loadState.set({ status: 'success', killSwitch });
          this.reasonDraft.set(killSwitch.reason ?? '');
          this.writeState.set({ status: 'done' });
        },
        error: (err: unknown) =>
          // Loud. A failed flip must not look like it took effect.
          this.writeState.set({
            status: 'error',
            errorKey: killSwitchErrorKey(err),
          }),
      });
  }

  cancel(): void {
    this.writeState.set({ status: 'idle' });
  }

  onReasonInput(value: string): void {
    this.reasonDraft.set(value);
  }
}
