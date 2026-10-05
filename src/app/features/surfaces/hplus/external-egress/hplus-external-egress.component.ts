/**
 * HplusExternalEgressComponent — CHO-2148 (ADR-220 D4, ADR-231 D6).
 *
 * H+ Hub+ surface: the Tenant Admin decides whether THIS tenant's learners may
 * reach the OPEN WEB through the Far Sight / Seeker grounded-search egress, and
 * sets a daily budget for it.
 *
 * Three things this screen must get right, because the whole governance model
 * leans on them:
 *
 *  1. DEFAULT-DENY IS VISIBLE. A tenant with no policy row is OFF (that is how
 *     franchise tenants — schools, minors — stay safe with no seeding). The
 *     screen renders "not opted in" DIFFERENTLY from "explicitly turned off",
 *     because collapsing the two would hide the default from the admin.
 *
 *  2. A FAILED READ IS NEVER RENDERED AS "OFF". That is indistinguishable from
 *     a real denial, and an admin could conclude their tenant is safely disabled
 *     when in fact we simply could not read the policy. Load errors are loud.
 *
 *  3. A FAILED WRITE IS NEVER RENDERED AS SUCCESS. The toggle reflects what the
 *     backend confirmed, not what the user clicked.
 *
 * Role-gated upstream: chora-tenancy enforces the tenant-admin role on the mesh
 * header, fail-closed. The surface guard hides the nav, but the API is the gate.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import {
  ExternalEgressService,
  externalEgressErrorKey,
} from './external-egress.service';
import type {
  ExternalEgressLoadState,
  ExternalEgressPatch,
  ExternalEgressPolicy,
  ExternalEgressSaveState,
} from './external-egress.model';

@Component({
  selector: 'chora-hplus-external-egress',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './hplus-external-egress.component.html',
  styleUrl: './hplus-external-egress.component.scss',
})
export class HplusExternalEgressComponent {
  private readonly svc = inject(ExternalEgressService);

  readonly loadState = signal<ExternalEgressLoadState>({ status: 'loading' });
  readonly saveState = signal<ExternalEgressSaveState>({ status: 'idle' });

  /** Draft form state, kept separate from the persisted policy so cancel works
   *  and so an in-flight edit never masquerades as saved truth. */
  readonly enabledDraft = signal<boolean>(false);
  readonly ceilingDraft = signal<number>(50);

  /** The last policy the BACKEND confirmed. Never the draft. */
  readonly policy = computed<ExternalEgressPolicy | null>(() => {
    const s = this.loadState();
    return s.status === 'success' ? s.policy : null;
  });

  readonly maxCeiling = computed<number>(
    () => this.policy()?.max_daily_call_ceiling ?? 1000,
  );

  /** True only when the tenant has an actual persisted policy row. */
  readonly optedIn = computed<boolean>(() => this.policy()?.opted_in ?? false);

  /**
   * Error keys pulled out as computed signals. Angular cannot narrow a
   * discriminated union through a signal CALL in a template (`@switch
   * (loadState().status)` does not narrow `loadState()`), so reading
   * `.errorKey` off the union in the template would need a non-null assertion —
   * i.e. a lie the compiler cannot check. These do the narrowing in TypeScript,
   * where it is verified.
   */
  readonly loadErrorKey = computed<string | null>(() => {
    const s = this.loadState();
    return s.status === 'error' ? s.errorKey : null;
  });

  readonly saveErrorKey = computed<string | null>(() => {
    const s = this.saveState();
    return s.status === 'error' ? s.errorKey : null;
  });

  readonly saving = computed<boolean>(() => this.saveState().status === 'saving');
  readonly justSaved = computed<boolean>(() => this.saveState().status === 'saved');

  readonly isDirty = computed<boolean>(() => {
    const p = this.policy();
    if (!p) return false;
    return (
      this.enabledDraft() !== p.egress_enabled ||
      this.ceilingDraft() !== p.daily_call_ceiling
    );
  });

  readonly ceilingValid = computed<boolean>(() => {
    const c = this.ceilingDraft();
    return Number.isInteger(c) && c >= 0 && c <= this.maxCeiling();
  });

  readonly canSave = computed<boolean>(
    () => this.isDirty() && this.ceilingValid() && !this.saving(),
  );

  constructor() {
    this.load();
  }

  /**
   * Adopt the policy the BACKEND confirmed as the new truth and reseed the form
   * from it — never from the draft. If the two disagree (say the backend clamped
   * a ceiling), the backend is right and the screen must show what was actually
   * persisted.
   *
   * Done explicitly here rather than in an effect(): an effect only flushes on
   * change detection, so the form state would lag the response by a tick and the
   * data flow would be invisible at the call site.
   */
  private adopt(policy: ExternalEgressPolicy): void {
    this.loadState.set({ status: 'success', policy });
    this.enabledDraft.set(policy.egress_enabled);
    this.ceilingDraft.set(policy.daily_call_ceiling);
  }

  load(): void {
    this.loadState.set({ status: 'loading' });
    this.svc.get().subscribe({
      next: (policy) => this.adopt(policy),
      error: (err: unknown) =>
        // Loud. Never a rendered "off" — see the class doc, point 2.
        this.loadState.set({
          status: 'error',
          errorKey: externalEgressErrorKey(err),
        }),
    });
  }

  onToggle(next: boolean): void {
    this.enabledDraft.set(next);
    this.clearSaveStatus();
  }

  onCeilingInput(value: string | number): void {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return;
    this.ceilingDraft.set(Math.round(n));
    this.clearSaveStatus();
  }

  save(): void {
    if (!this.canSave()) return;

    const patch: ExternalEgressPatch = {
      egress_enabled: this.enabledDraft(),
      daily_call_ceiling: this.ceilingDraft(),
    };

    this.saveState.set({ status: 'saving' });
    this.svc.update(patch).subscribe({
      next: (policy) => {
        this.adopt(policy);
        this.saveState.set({ status: 'saved' });
      },
      error: (err: unknown) =>
        // Loud. The toggle must not show a false success — see doc point 3.
        this.saveState.set({
          status: 'error',
          errorKey: externalEgressErrorKey(err),
        }),
    });
  }

  cancel(): void {
    const p = this.policy();
    if (!p) return;
    this.enabledDraft.set(p.egress_enabled);
    this.ceilingDraft.set(p.daily_call_ceiling);
    this.clearSaveStatus();
  }

  private clearSaveStatus(): void {
    if (this.saveState().status !== 'idle') {
      this.saveState.set({ status: 'idle' });
    }
  }
}
