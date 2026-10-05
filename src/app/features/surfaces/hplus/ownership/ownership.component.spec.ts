/**
 * Ownership screen specs (UX Track U, E3 slice 7; screens S7a to S7c).
 *
 * The screen is STATE-DRIVEN, not tabbed. The pass 4 mockup shows four tabs
 * because a walkthrough has to let a reviewer see every state at once; the real
 * screen shows the one that is true. A tab for a state the person is not in is
 * a mode switch, which the integrative-UI invariant rules out, and it would
 * offer an owner a nominee's Accept button.
 *
 * So these specs are about WHICH state renders and WHO can act, and the state
 * comes from three facts the server owns: whether an offer is open, who the
 * session is, and who holds the owner row.
 */
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthService } from '../../../../core/auth/auth.service';
import { RbacService } from '../../../../core/services/rbac.service';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { TenantMembersAdminService } from '../../../admin/tenant-admin/services/tenant-members-admin.service';
import { OwnershipComponent } from './ownership.component';
import { OwnershipService } from './ownership.service';
import type { OwnershipOffer, OwnershipOfferState } from './ownership.model';

const TENANT = '11111111-1111-7111-8111-111111111111';
const OWNER = '22222222-2222-7222-8222-222222222222';
const NOMINEE = '33333333-3333-7333-8333-333333333333';
const BYSTANDER = '55555555-5555-7555-8555-555555555555';
const OFFER = '44444444-4444-7444-8444-444444444444';

function offerBody(over: Partial<OwnershipOffer> = {}): OwnershipOffer {
  return {
    offer_id: OFFER,
    tenant_id: TENANT,
    from_gcid: OWNER,
    to_gcid: NOMINEE,
    initiated_by: OWNER,
    initiator: 'owner',
    status: 'pending',
    is_live: true,
    created_at: '2026-09-02T00:00:00Z',
    expires_at: '2026-09-16T00:00:00Z',
    ...over,
  };
}

const ROSTER = [
  { gcid: OWNER, email: 'ada@northwind.test', display_name: 'Ada Okonkwo', roles: ['OWNER', 'ADMIN'], last_active_at: '2026-09-02T00:00:00Z' },
  { gcid: NOMINEE, email: 'priya@northwind.test', display_name: 'Priya Nair', roles: ['ADMIN'], last_active_at: '2026-09-02T00:00:00Z' },
  { gcid: BYSTANDER, email: 'sam@northwind.test', display_name: 'Sam Okafor', roles: ['INSTRUCTOR'], last_active_at: '2026-09-02T00:00:00Z' },
];

interface Harness {
  fixture: ComponentFixture<OwnershipComponent>;
  ownership: {
    offerState: ReturnType<typeof signal<OwnershipOfferState>>;
    loadOffer: ReturnType<typeof vi.fn>;
    offer: ReturnType<typeof vi.fn>;
    settle: ReturnType<typeof vi.fn>;
    assignOwner: ReturnType<typeof vi.fn>;
  };
}

async function setup(opts: {
  gcid: string;
  state?: OwnershipOfferState;
  operator?: boolean;
  roster?: typeof ROSTER;
  activeTenant?: string | null;
}): Promise<Harness> {
  const offerState = signal<OwnershipOfferState>(opts.state ?? { status: 'none' });
  const ownership = {
    offerState,
    loadOffer: vi.fn(),
    offer: vi.fn().mockReturnValue(of({ kind: 'success' })),
    settle: vi.fn().mockReturnValue(of({ kind: 'success' })),
    assignOwner: vi.fn().mockReturnValue(of({ kind: 'success' })),
  };

  TestBed.configureTestingModule({
    imports: [OwnershipComponent],
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: OwnershipService, useValue: ownership },
      {
        provide: TenantMembersAdminService,
        useValue: {
          roster: vi.fn().mockReturnValue(of({ kind: 'success', rows: opts.roster ?? ROSTER })),
        },
      },
      { provide: AuthService, useValue: { gcid: signal(opts.gcid) } },
      {
        provide: TenantContextService,
        useValue: {
          tenantId: signal(opts.activeTenant === undefined ? TENANT : opts.activeTenant),
        },
      },
      { provide: RbacService, useValue: { hasRole: () => opts.operator === true } },
    ],
  });

  const fixture = TestBed.createComponent(OwnershipComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, ownership };
}

const text = (f: ComponentFixture<OwnershipComponent>): string =>
  (f.nativeElement as HTMLElement).textContent ?? '';

const el = (f: ComponentFixture<OwnershipComponent>, sel: string): HTMLElement | null =>
  (f.nativeElement as HTMLElement).querySelector(sel);

describe('OwnershipComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('loads the offer on init', async () => {
    const { ownership } = await setup({ gcid: OWNER });
    expect(ownership.loadOffer).toHaveBeenCalledTimes(1);
  });

  describe('the roster panel', () => {
    it('marks the owner and nobody else', async () => {
      const { fixture } = await setup({ gcid: OWNER });
      const chips = (fixture.nativeElement as HTMLElement).querySelectorAll(
        '[data-testid="owner-chip"]',
      );
      expect(chips.length).toBe(1);
      expect(chips[0].closest('tr')?.textContent).toContain('Ada Okonkwo');
    });

    // The identity mirror sends roles UPPERCASE, the tenancy enum stores them
    // lowercase, and role-capabilities.ts maps both. A case-sensitive match
    // here would show an organisation with no owner at all.
    it('recognises the owner role whatever its case', async () => {
      const { fixture } = await setup({
        gcid: OWNER,
        roster: [{ ...ROSTER[0], roles: ['owner'] }, ROSTER[1]],
      });
      expect(
        (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="owner-chip"]').length,
      ).toBe(1);
    });
  });

  describe('no offer open', () => {
    it('offers the hand-over form to the owner', async () => {
      const { fixture } = await setup({ gcid: OWNER });
      expect(el(fixture, '[data-testid="handover-form"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="assign-form"]')).toBeNull();
    });

    // Only the current owner may hand over. An admin sees why, not a form whose
    // every submission can only 403.
    it('refuses the form to an admin who is not the owner', async () => {
      const { fixture } = await setup({ gcid: NOMINEE });
      expect(el(fixture, '[data-testid="handover-form"]')).toBeNull();
      expect(el(fixture, '[data-testid="not-permitted"]')).not.toBeNull();
    });

    it('shows the empty state when there is nobody to hand over to', async () => {
      const { fixture } = await setup({ gcid: OWNER, roster: [ROSTER[0]] });
      expect(el(fixture, '[data-testid="nobody-to-hand-to"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="handover-form"]')).toBeNull();
    });

    it('never lists the current owner as a nominee', async () => {
      const { fixture } = await setup({ gcid: OWNER });
      const options = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll(
          '[data-testid="nominee-select"] option',
        ),
      ).map((o) => (o as HTMLOptionElement).value);
      expect(options).not.toContain(OWNER);
      expect(options).toContain(NOMINEE);
    });

    it('gives a platform operator the assign form as well', async () => {
      const { fixture } = await setup({ gcid: BYSTANDER, operator: true });
      expect(el(fixture, '[data-testid="assign-form"]')).not.toBeNull();
    });
  });

  describe('an offer is open', () => {
    it('shows the nominee the accept and decline pair', async () => {
      const { fixture } = await setup({
        gcid: NOMINEE,
        state: { status: 'open', offer: offerBody() },
      });
      expect(el(fixture, '[data-testid="accept-offer"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="decline-offer"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="withdraw-offer"]')).toBeNull();
    });

    it('shows the initiator the waiting state and the withdraw action', async () => {
      const { fixture } = await setup({
        gcid: OWNER,
        state: { status: 'open', offer: offerBody() },
      });
      expect(el(fixture, '[data-testid="withdraw-offer"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="accept-offer"]')).toBeNull();
    });

    // A third party must not be able to answer somebody else's offer, and must
    // still be told one is in flight: hiding it would make the missing
    // hand-over form look like a fault.
    it('shows a bystander the offer but no action', async () => {
      const { fixture } = await setup({
        gcid: BYSTANDER,
        state: { status: 'open', offer: offerBody() },
      });
      expect(el(fixture, '[data-testid="offer-in-flight"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="accept-offer"]')).toBeNull();
      expect(el(fixture, '[data-testid="withdraw-offer"]')).toBeNull();
    });

    // A lapsed row is still returned by the server, pending in the table and
    // not live in fact. The screen has to say so rather than offer an Accept
    // that can only be refused.
    it('says a lapsed offer has expired and offers no accept', async () => {
      const { fixture } = await setup({
        gcid: NOMINEE,
        state: { status: 'open', offer: offerBody({ is_live: false }) },
      });
      expect(el(fixture, '[data-testid="offer-expired"]')).not.toBeNull();
      expect(el(fixture, '[data-testid="accept-offer"]')).toBeNull();
    });

    it('does not offer the hand-over form while an offer stands', async () => {
      const { fixture } = await setup({
        gcid: OWNER,
        state: { status: 'open', offer: offerBody() },
      });
      expect(el(fixture, '[data-testid="handover-form"]')).toBeNull();
    });
  });

  describe('actions', () => {
    it('sends the offer with the chosen nominee', async () => {
      const { fixture, ownership } = await setup({ gcid: OWNER });
      const select = el(fixture, '[data-testid="nominee-select"]') as HTMLSelectElement;
      select.value = NOMINEE;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (el(fixture, '[data-testid="send-offer"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(ownership.offer).toHaveBeenCalledWith(NOMINEE, '');
    });

    it('accepts by offer id, never by "whatever is pending"', async () => {
      const { fixture, ownership } = await setup({
        gcid: NOMINEE,
        state: { status: 'open', offer: offerBody() },
      });
      (el(fixture, '[data-testid="accept-offer"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(ownership.settle).toHaveBeenCalledWith(OFFER, 'accept');
    });

    it('re-reads the offer after a write, rather than guessing the new state', async () => {
      const { fixture, ownership } = await setup({
        gcid: NOMINEE,
        state: { status: 'open', offer: offerBody() },
      });
      ownership.loadOffer.mockClear();
      (el(fixture, '[data-testid="decline-offer"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(ownership.settle).toHaveBeenCalledWith(OFFER, 'decline');
      expect(ownership.loadOffer).toHaveBeenCalled();
    });

    // The override refuses an empty reason, and it refuses it HERE so the
    // operator is told before a round trip rather than after one.
    it('will not assign an owner without a reason', async () => {
      const { fixture, ownership } = await setup({ gcid: BYSTANDER, operator: true });
      const btn = el(fixture, '[data-testid="send-assign"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      btn.click();
      await fixture.whenStable();
      expect(ownership.assignOwner).not.toHaveBeenCalled();
    });

    // The override needs a tenant id, and with no offer open there is none on
    // the wire. It comes from the SESSION's active tenant, which is the same
    // tenant the roster and the me-routes are scoped to. An operator acts on an
    // organisation by being switched into it, exactly as every other H+ screen
    // requires; taking the id from the open offer instead would be null by
    // construction here, because this form only renders when none is open.
    it('assigns an owner against the session tenant', async () => {
      const { fixture, ownership } = await setup({ gcid: BYSTANDER, operator: true });
      const select = el(fixture, '[data-testid="assign-nominee-select"]') as HTMLSelectElement;
      select.value = NOMINEE;
      select.dispatchEvent(new Event('change'));
      const reason = el(fixture, '#ownership-reason') as HTMLTextAreaElement;
      reason.value = 'the owner left the company';
      reason.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      (el(fixture, '[data-testid="send-assign"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(ownership.assignOwner).toHaveBeenCalledWith(
        TENANT,
        NOMINEE,
        'the owner left the company',
      );
    });

    // A tenant-less operator cannot be assigning an owner to anything: the
    // roster they are looking at belongs to no organisation. Saying so beats a
    // request that would be refused downstream for a reason nobody can read.
    it('refuses to assign when the session has no active organisation', async () => {
      const { fixture, ownership } = await setup({
        gcid: BYSTANDER,
        operator: true,
        activeTenant: null,
      });
      const select = el(fixture, '[data-testid="assign-nominee-select"]') as HTMLSelectElement;
      select.value = NOMINEE;
      select.dispatchEvent(new Event('change'));
      const reason = el(fixture, '#ownership-reason') as HTMLTextAreaElement;
      reason.value = 'the owner left';
      reason.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      const btn = el(fixture, '[data-testid="send-assign"]') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
      btn.click();
      await fixture.whenStable();
      expect(ownership.assignOwner).not.toHaveBeenCalled();
    });

    it('renders a named refusal instead of a generic failure', async () => {
      const { fixture, ownership } = await setup({ gcid: OWNER });
      ownership.offer.mockReturnValue(
        of({ kind: 'refused', reason: 'nominee_suspended' }),
      );
      const select = el(fixture, '[data-testid="nominee-select"]') as HTMLSelectElement;
      select.value = NOMINEE;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (el(fixture, '[data-testid="send-offer"]') as HTMLButtonElement).click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el(fixture, '[data-testid="refusal"]')?.textContent).toContain(
        'nominee_suspended',
      );
    });
  });

  describe('failures', () => {
    it('renders the named error for a tenant-less session', async () => {
      const { fixture } = await setup({
        gcid: OWNER,
        state: { status: 'error', error: 'hplus.ownership.error_no_active_tenant' },
      });
      expect(text(fixture)).toContain('hplus.ownership.error_no_active_tenant');
    });
  });
});
