/**
 * CreateTenantComponent (UX Track U, package E1, screen S2): create an
 * organisation.
 *
 * The platform operator's entry point into a fresh instance. Four things this
 * screen must get right.
 *
 *  1. THE OPERATOR IS THE FIRST ADMINISTRATOR, AND IS TOLD SO. `owner_gcid`
 *     wants a GCID, which is minted only when a person first signs in, so a new
 *     organisation's real administrator has by definition never had one. Ruling
 *     R10 takes the honest option: default it to the operator, say plainly that
 *     this is temporary, and point at the handover on /h/members. Inventing an
 *     identity or asking for one that cannot exist are the alternatives.
 *
 *  2. THE ACTIVE TENANT IS SWITCHED BEFORE THE WIZARD. Every /me/ call in the
 *     next step carries the session's tenant. Without the switch a pure operator
 *     is tenant-less (PLATFORM_OPERATOR holds no membership by design, ADR-165)
 *     and steps 2 and 3 return 401. The switch is a session re-mint, reusing
 *     TenantContextService.switchTenant rather than forking it.
 *
 *  3. NO POLL AFTER THE 201. The mint resolves memberships through
 *     chora-identity's /resolve, which makes a gRPC call to chora-tenancy over
 *     the AUTHORITATIVE members table rather than reading the identity mirror,
 *     and Persist writes the owner row inside the create transaction. So the
 *     membership is readable the instant the 201 returns and a bounded wait
 *     would be dead code. What the mirror DOES gate is the H+ roster, fed
 *     asynchronously through the outbox, so the success copy says the roster
 *     catches up shortly instead of showing a stale roster as complete.
 *
 *  4. A FAILURE IS NEVER RENDERED AS A CREATION. A failed create does not
 *     switch tenants and does not route on; a failed SWITCH after a successful
 *     create says so, because the organisation exists while the session does not
 *     point at it, and calling that "ready" would send the operator into the
 *     wizard to collect 401s.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';

import { RouterLink } from '@angular/router';

import { TranslatePipe } from '../../../../shared/pipes/translate.pipe';
import { AuthService } from '../../../../core/auth/auth.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import { CreateTenantService, createTenantFailure } from './create-tenant.service';
import {
  CHORA_MASTER_TENANT_ID,
  CONTINUE_SETUP_PATH,
  DEFAULT_HOSTING_MODE,
  DISPLAY_NAME_MAX,
  DISPLAY_NAME_MIN,
  HOSTING_MODES,
  type CreatedTenant,
  type HostingMode,
} from './create-tenant.model';

/** One row in the add-on picker. */
export interface AddOnChoice {
  readonly code: string;
  readonly displayName: string;
  readonly category: string;
}

@Component({
  selector: 'chora-create-tenant',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-tenant.component.html',
  styleUrl: './create-tenant.component.scss',
})
export class CreateTenantComponent {
  private readonly svc = inject(CreateTenantService);
  private readonly auth = inject(AuthService);
  private readonly tenantContext = inject(TenantContextService);
  private readonly addons = inject(TenantAddonsAdminService);

  readonly hostingModes = HOSTING_MODES;
  readonly nameMin = DISPLAY_NAME_MIN;
  readonly nameMax = DISPLAY_NAME_MAX;

  /** Read-only in v1: nested parents are a horizon per ADR-217. */
  readonly parentTenantId = CHORA_MASTER_TENANT_ID;
  readonly continueSetupPath = CONTINUE_SETUP_PATH;

  readonly displayName = signal('');
  readonly hostingMode = signal<HostingMode>(DEFAULT_HOSTING_MODE);
  readonly ownerGcid = signal(this.auth.gcid() ?? '');

  readonly catalogue = signal<readonly AddOnChoice[]>([]);
  /** A catalogue that failed to load and a catalogue genuinely offering
   *  nothing are different facts, and only the first is a gap. */
  readonly catalogueUnavailable = signal(false);
  readonly chosenAddOns = signal<readonly string[]>([]);

  readonly submitting = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly errorDetail = signal<string | null>(null);
  readonly created = signal<CreatedTenant | null>(null);

  /** True once the organisation exists AND the session points at it. */
  readonly ready = computed(() => this.created() !== null && this.errorKey() === null);

  constructor() {
    this.addons.listMarketplace({}).subscribe((result) => {
      if (!result || result.kind !== 'success') {
        this.catalogueUnavailable.set(true);
        return;
      }
      this.catalogue.set(
        result.items.map((item) => ({
          code: item.code,
          displayName: item.display_name,
          category: item.category,
        })),
      );
    });
  }

  isChosen(code: string): boolean {
    return this.chosenAddOns().includes(code);
  }

  toggleAddOn(code: string): void {
    const current = this.chosenAddOns();
    this.chosenAddOns.set(
      current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code],
    );
  }

  onName(value: string): void {
    this.displayName.set(value);
  }

  onHostingMode(value: string): void {
    this.hostingMode.set(value as HostingMode);
  }

  onOwnerGcid(value: string): void {
    this.ownerGcid.set(value);
  }

  submit(): void {
    if (this.submitting()) return;
    this.errorKey.set(null);
    this.errorDetail.set(null);

    const name = this.displayName().trim();
    if (name.length < DISPLAY_NAME_MIN) {
      this.errorKey.set('hplus.tenants_new.errors.name_too_short');
      return;
    }
    if (name.length > DISPLAY_NAME_MAX) {
      this.errorKey.set('hplus.tenants_new.errors.name_too_long');
      return;
    }
    const owner = this.ownerGcid().trim();
    if (owner === '') {
      this.errorKey.set('hplus.tenants_new.errors.owner_required');
      return;
    }

    this.submitting.set(true);
    this.svc
      .create({
        parent_tenant_id: this.parentTenantId,
        display_name: name,
        hosting_mode: this.hostingMode(),
        owner_gcid: owner,
        add_on_codes: this.chosenAddOns(),
      })
      .subscribe({
        next: (tenant) => {
          this.created.set(tenant);
          this.switchInto(tenant.tenant_id);
        },
        error: (err: unknown) => {
          const failure = createTenantFailure(err);
          this.errorKey.set(failure.key);
          this.errorDetail.set(failure.detail);
          this.submitting.set(false);
        },
      });
  }

  /**
   * Re-mint the session onto the new organisation. A failure here leaves a
   * created organisation the operator's session cannot act in, which is its own
   * state and is reported as such rather than folded into the create error.
   */
  private switchInto(tenantId: string): void {
    this.tenantContext.switchTenant(tenantId).subscribe({
      next: () => {
        this.submitting.set(false);
      },
      error: () => {
        this.errorKey.set('hplus.tenants_new.errors.switch_failed');
        this.submitting.set(false);
      },
    });
  }
}
