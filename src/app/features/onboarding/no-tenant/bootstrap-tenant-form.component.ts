/**
 * BootstrapTenantFormComponent — H+ Setup-Tenant Phase 4 MVP (CHO-1642).
 *
 * Single-input form that lets an authenticated, no-tenant user
 * self-bootstrap a tenant via `POST /api/v1/tenants/bootstrap` (chora-
 * gateway Phase 3, CHO-1632). Embedded in NoTenantComponent at the
 * `/welcome/no-tenant` route — replaces the old external dead-URL CTA.
 *
 * On 201 success: refreshes the Chora session (so the new
 * TenantMembership claim lands) + navigates to `/h/tenant`.
 *
 * Per chora-web/CLAUDE.md §3 (BFF-only via BootstrapTenantService),
 * §6 (signals + standalone + reactive forms), §10 (a11y), §13
 * (vocabulary — "tenant" only).
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../core/auth/auth.service';
import { BootstrapTenantService } from './bootstrap-tenant.service';
import type { BootstrapTenantResult } from './bootstrap-tenant.model';

/** UI state machine — drives the template via @if. */
type FormState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'invalid-name'; message: string }
  | { kind: 'already-member' }
  | { kind: 'unauthenticated' }
  | { kind: 'server-error' }
  | { kind: 'network-error' };

@Component({
  selector: 'chora-bootstrap-tenant-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TranslatePipe],
  templateUrl: './bootstrap-tenant-form.component.html',
  styleUrl: './bootstrap-tenant-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BootstrapTenantFormComponent {
  private readonly bootstrapSvc = inject(BootstrapTenantService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Name input — 3..256 chars, trimmed at the service layer. */
  readonly nameControl = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(256),
    ],
  });

  // CHO-1651 — the FormGroup wrapper is what lets Angular's
  // FormGroupDirective attach to the <form> element and surface
  // `(ngSubmit)`. Without it the template binding is a no-op and the
  // browser performs a native form submit (page reload) on click.
  readonly form = new FormGroup({ name: this.nameControl });

  private readonly _state = signal<FormState>({ kind: 'idle' });
  readonly state = this._state.asReadonly();

  readonly isLoading = computed(() => this._state().kind === 'loading');
  readonly invalidNameMessage = computed(() => {
    const s = this._state();
    return s.kind === 'invalid-name' ? s.message : null;
  });
  readonly showAlreadyMember = computed(() => this._state().kind === 'already-member');
  readonly showServerError = computed(() => this._state().kind === 'server-error');
  readonly showNetworkError = computed(() => this._state().kind === 'network-error');
  readonly showUnauthError = computed(() => this._state().kind === 'unauthenticated');

  submit(): void {
    if (this.nameControl.invalid || this.isLoading()) {
      this.nameControl.markAsTouched();
      return;
    }
    this._state.set({ kind: 'loading' });
    this.nameControl.disable({ emitEvent: false });

    this.bootstrapSvc.bootstrap(this.nameControl.value).subscribe({
      next: (result) => this.handleResult(result),
      error: () => this.handleResult({ kind: 'server-error' }),
    });
  }

  private handleResult(result: BootstrapTenantResult): void {
    switch (result.kind) {
      case 'success':
        // Re-mint the Chora session so the new TenantMembership claim
        // lands in `AuthService.user()`, then route into H+.
        this.auth.silentRefresh().subscribe({
          next: () => {
            // Phase A.5 — land on the Setup Wizard so the new admin
            // immediately configures branding / add-ons / identity for
            // their fresh tenant. /h/tenant remains the home page but
            // is reachable from the wizard's "Skip for now" affordance.
            void this.router.navigate(['/admin/tenant/settings/wizard']);
          },
          error: () => {
            // Mint failed but the tenant DID create — still route into
            // the wizard. authGuard / silentRefresh-on-load will
            // recover the JWT state on landing.
            void this.router.navigate(['/admin/tenant/settings/wizard']);
          },
        });
        return;
      case 'already-member':
        this._state.set({ kind: 'already-member' });
        // Keep the form locked — there is nothing to submit; the
        // template renders a link to /h/tenant instead.
        return;
      case 'invalid-name':
        this._state.set({ kind: 'invalid-name', message: result.message });
        this.nameControl.enable({ emitEvent: false });
        return;
      case 'unauthenticated':
        this._state.set({ kind: 'unauthenticated' });
        this.nameControl.enable({ emitEvent: false });
        return;
      case 'server-error':
        this._state.set({ kind: 'server-error' });
        this.nameControl.enable({ emitEvent: false });
        return;
      case 'network-error':
        this._state.set({ kind: 'network-error' });
        this.nameControl.enable({ emitEvent: false });
        return;
    }
  }
}
