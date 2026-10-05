/**
 * H+ Add-on Deactivation Modal spec (CHO-1731 STITCH-H-ADD-2).
 *
 * Strict TDD per chora/.claude/rules/development-execution.md: this
 * file is written BEFORE the component exists. Compile must fail with
 * "Cannot find module './addon-deactivate-modal.component'".
 *
 * Drives the modal through TestBed against a TenantAddonsAdminService
 * mock. Asserts:
 *   - Render: role=alertdialog + aria-modal + reason dropdown + 4 standard
 *     action buttons + type-to-confirm input + refund-timing notice.
 *   - Behaviour: `other` reveals free-text, type-to-confirm gates submit,
 *     effective-at radio defaults to end_of_cycle, submit fires service
 *     with the right payload, success emits `deactivated`, error renders
 *     banner, Escape + Cancel dismiss the modal.
 *
 * Lesson from Dale's CHO-1694 catch: every `vi.fn()` in the mock gets
 * an explicit typed signature so `mock.calls[0][0]` is the real tuple
 * (TS2493 / TS18048 trap).
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, Subject, of } from 'rxjs';
import { vi } from 'vitest';

import { AddonDeactivateModalComponent } from './addon-deactivate-modal.component';
import { TenantAddonsAdminService } from '../../../admin/tenant-admin/services/tenant-addons-admin.service';
import type {
  DeactivateAddonRequest,
  DeactivateAddonResponse,
  DeactivateAddonResult,
} from '../../../admin/tenant-admin/models/tenant-addons-admin.model';

const PLAN_ID = '019e0000-0000-7000-8000-bbbbbbbbbbbb';
const DISPLAY_NAME = 'Familiar';
const ADDON_CODE = 'familiar';
const BILLING_CYCLE_END = '2026-07-01';

const immediateResponse: DeactivateAddonResponse = {
  tenant_id: '01970000-0000-7000-8000-aaaaaaaaaaaa',
  addon_plan_id: PLAN_ID,
  status: 'DEACTIVATED',
  requested_at: '2026-06-12T00:00:00Z',
  effective_at: null,
  reason: 'cost',
};

function makeServiceMock(opts: { deactivate?: DeactivateAddonResult } = {}) {
  return {
    deactivate: vi.fn(
      (_planId: string, _payload: DeactivateAddonRequest): Observable<DeactivateAddonResult> =>
        of(
          opts.deactivate ?? ({ kind: 'success-immediate', response: immediateResponse } as DeactivateAddonResult),
        ),
    ),
  };
}

async function setup(
  inputs: {
    displayName?: string;
    addonCode?: string;
    billingCycleEnd?: string | null;
  } = {},
  opts: { deactivate?: DeactivateAddonResult } = {},
): Promise<{
  fixture: ComponentFixture<AddonDeactivateModalComponent>;
  component: AddonDeactivateModalComponent;
  element: HTMLElement;
  serviceMock: ReturnType<typeof makeServiceMock>;
}> {
  const serviceMock = makeServiceMock(opts);
  await TestBed.configureTestingModule({
    imports: [AddonDeactivateModalComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TenantAddonsAdminService, useValue: serviceMock },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(AddonDeactivateModalComponent);
  const component = fixture.componentInstance;
  fixture.componentRef.setInput('addonPlanId', PLAN_ID);
  fixture.componentRef.setInput('displayName', inputs.displayName ?? DISPLAY_NAME);
  fixture.componentRef.setInput('addonCode', inputs.addonCode ?? ADDON_CODE);
  fixture.componentRef.setInput(
    'billingCycleEnd',
    inputs.billingCycleEnd === undefined ? BILLING_CYCLE_END : inputs.billingCycleEnd,
  );
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, component, element, serviceMock };
}

function setReason(element: HTMLElement, value: string): void {
  const select = element.querySelector(
    '[data-testid="addon-deactivate-reason"]',
  ) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

function setTypeToConfirm(element: HTMLElement, value: string): void {
  const input = element.querySelector(
    '[data-testid="addon-deactivate-confirm-name"]',
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

describe('AddonDeactivateModalComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  describe('rendering', () => {
    it('uses role=alertdialog and aria-modal=true', async () => {
      const { element } = await setup();
      const dialog = element.querySelector(
        '[data-testid="addon-deactivate-modal"]',
      );
      expect(dialog?.getAttribute('role')).toBe('alertdialog');
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });

    it('renders the addon display name in the title', async () => {
      const { element } = await setup();
      const title = element.querySelector(
        '[data-testid="addon-deactivate-title"]',
      );
      expect(title?.textContent ?? '').toContain(DISPLAY_NAME);
    });

    it('renders all 6 reason options in the dropdown', async () => {
      const { element } = await setup();
      const opts = element.querySelectorAll(
        '[data-testid="addon-deactivate-reason"] option',
      );
      // 6 reasons + maybe a placeholder. Filter to real values.
      const values = Array.from(opts)
        .map((o) => (o as HTMLOptionElement).value)
        .filter((v) => v !== '');
      expect(values).toEqual([
        'no_longer_needed',
        'cost',
        'consolidation',
        'migration',
        'compliance',
        'other',
      ]);
    });

    it('renders the refund-timing notice using billingCycleEnd', async () => {
      const { element } = await setup();
      const notice = element.querySelector(
        '[data-testid="addon-deactivate-refund-notice"]',
      );
      expect(notice).toBeTruthy();
      expect(notice?.textContent ?? '').toContain(BILLING_CYCLE_END);
    });

    it('omits the refund-timing notice when billingCycleEnd is null', async () => {
      const { element } = await setup({ billingCycleEnd: null });
      const notice = element.querySelector(
        '[data-testid="addon-deactivate-refund-notice"]',
      );
      expect(notice).toBeNull();
    });

    it('renders the effective-at radio with end_of_cycle pre-selected', async () => {
      const { element } = await setup();
      const endOfCycle = element.querySelector(
        '[data-testid="addon-deactivate-effective-end_of_cycle"]',
      ) as HTMLInputElement;
      const immediate = element.querySelector(
        '[data-testid="addon-deactivate-effective-immediate"]',
      ) as HTMLInputElement;
      expect(endOfCycle.checked).toBe(true);
      expect(immediate.checked).toBe(false);
    });
  });

  describe('reason=other free-text', () => {
    it('hides the free-text textarea when reason !== "other"', async () => {
      const { element } = await setup();
      expect(
        element.querySelector('[data-testid="addon-deactivate-reason-text"]'),
      ).toBeNull();
    });

    it('reveals the free-text textarea when reason="other" is selected', async () => {
      const { fixture, element } = await setup();
      setReason(element, 'other');
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-deactivate-reason-text"]'),
      ).toBeTruthy();
    });
  });

  describe('type-to-confirm', () => {
    it('keeps Confirm disabled when the typed name does not match', async () => {
      const { fixture, element } = await setup();
      setReason(element, 'cost');
      setTypeToConfirm(element, 'wrong-name');
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('enables Confirm when the typed name matches case-insensitive', async () => {
      const { fixture, element } = await setup();
      setReason(element, 'cost');
      setTypeToConfirm(element, '  FAMILIAR  ');
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    it('keeps Confirm disabled when reason=other but free-text is empty', async () => {
      const { fixture, element } = await setup();
      setReason(element, 'other');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });
  });

  describe('submit', () => {
    it('fires service.deactivate with the assembled payload', async () => {
      const { fixture, element, serviceMock } = await setup();
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      expect(serviceMock.deactivate).toHaveBeenCalledTimes(1);
      const [planId, payload] = serviceMock.deactivate.mock.calls[0]!;
      expect(planId).toBe(PLAN_ID);
      expect(payload.reason).toBe('cost');
      // Default effective_at radio is end_of_cycle → carries the billing cycle end as ISO.
      expect(payload.effective_at).not.toBeUndefined();
    });

    it('emits `deactivated` with the response on success-immediate', async () => {
      const { fixture, element, component } = await setup();
      const emitted: DeactivateAddonResult[] = [];
      component.deactivated.subscribe((r) => emitted.push(r));
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      expect(emitted.length).toBe(1);
      expect(emitted[0]!.kind).toBe('success-immediate');
    });

    it('sends effective_at=null when the radio is set to immediate', async () => {
      const { fixture, element, serviceMock } = await setup();
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      const immediate = element.querySelector(
        '[data-testid="addon-deactivate-effective-immediate"]',
      ) as HTMLInputElement;
      immediate.checked = true;
      immediate.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      const [, payload] = serviceMock.deactivate.mock.calls[0]!;
      expect(payload.effective_at).toBeNull();
    });

    // CHO-1782 follow-up — when end_of_cycle is picked AND no billingCycleEnd
    // input is supplied (the BE emits no `billing_cycle_end` field on the list
    // endpoint today), the modal MUST still send a FUTURE date so the BE
    // schedules instead of silently falling back to immediate. The previous
    // fallback was `cycleEnd ?? null` which degraded end_of_cycle to
    // immediate, defeating the whole flow.
    it('sends a future effective_at when end_of_cycle is picked and billingCycleEnd is null', async () => {
      const { fixture, element, serviceMock } = await setup({ billingCycleEnd: null });
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      const [, payload] = serviceMock.deactivate.mock.calls[0]!;
      expect(payload.effective_at).not.toBeNull();
      expect(typeof payload.effective_at).toBe('string');
      const parsed = new Date(payload.effective_at as string).getTime();
      expect(Number.isFinite(parsed)).toBe(true);
      expect(parsed).toBeGreaterThan(Date.now());
    });

    // CHO-1784 — when billingCycleEnd is supplied (the BE now emits
    // next_renewal_at on the snapshot), the modal MUST send THAT value as
    // effective_at, not the +30d client-side fallback. Pinning to the
    // server-supplied date keeps the displayed badge in sync with the
    // BE-scheduled deactivation.
    it('sends billingCycleEnd as effective_at when end_of_cycle is picked and the input is supplied', async () => {
      const serverProvidedCycleEnd = '2026-09-21T00:00:00.000Z';
      const { fixture, element, serviceMock } = await setup({
        billingCycleEnd: serverProvidedCycleEnd,
      });
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      const [, payload] = serviceMock.deactivate.mock.calls[0]!;
      expect(payload.effective_at).toBe(serverProvidedCycleEnd);
    });

    it('sends reason_text when reason=other', async () => {
      const { fixture, element, serviceMock } = await setup();
      setReason(element, 'other');
      fixture.detectChanges();
      const textarea = element.querySelector(
        '[data-testid="addon-deactivate-reason-text"]',
      ) as HTMLTextAreaElement;
      textarea.value = 'replaced by something else';
      textarea.dispatchEvent(new Event('input'));
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      const [, payload] = serviceMock.deactivate.mock.calls[0]!;
      expect(payload.reason).toBe('other');
      expect(payload.reason_text).toBe('replaced by something else');
    });

    it('disables submit while the request is in flight', async () => {
      const subject = new Subject<DeactivateAddonResult>();
      const serviceMock = {
        deactivate: vi.fn(
          (_planId: string, _payload: DeactivateAddonRequest): Observable<DeactivateAddonResult> =>
            subject.asObservable(),
        ),
      };
      await TestBed.configureTestingModule({
        imports: [AddonDeactivateModalComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: TenantAddonsAdminService, useValue: serviceMock },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(AddonDeactivateModalComponent);
      fixture.componentRef.setInput('addonPlanId', PLAN_ID);
      fixture.componentRef.setInput('displayName', DISPLAY_NAME);
      fixture.componentRef.setInput('addonCode', ADDON_CODE);
      fixture.componentRef.setInput('billingCycleEnd', BILLING_CYCLE_END);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      const submit = element.querySelector(
        '[data-testid="addon-deactivate-submit"]',
      ) as HTMLButtonElement;
      submit.click();
      fixture.detectChanges();
      expect(submit.disabled).toBe(true);
      subject.next({ kind: 'success-immediate', response: immediateResponse });
      subject.complete();
      fixture.detectChanges();
    });
  });

  describe('error states', () => {
    it('renders a compliance-locked banner when service returns compliance-locked', async () => {
      const { fixture, element } = await setup(
        {},
        { deactivate: { kind: 'compliance-locked' } },
      );
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-deactivate-submit"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-deactivate-error"]'),
      ).toBeTruthy();
    });

    it('renders a server-error banner when service returns server-error', async () => {
      const { fixture, element } = await setup(
        {},
        { deactivate: { kind: 'server-error' } },
      );
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-deactivate-submit"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="addon-deactivate-error"]'),
      ).toBeTruthy();
    });

    it('does NOT emit `deactivated` when service returns an error kind', async () => {
      const { fixture, element, component } = await setup(
        {},
        { deactivate: { kind: 'server-error' } },
      );
      const emitted: DeactivateAddonResult[] = [];
      component.deactivated.subscribe((r) => emitted.push(r));
      setReason(element, 'cost');
      setTypeToConfirm(element, DISPLAY_NAME);
      fixture.detectChanges();
      (
        element.querySelector(
          '[data-testid="addon-deactivate-submit"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(emitted.length).toBe(0);
    });
  });

  describe('dismiss', () => {
    it('emits `dismissed` when the Cancel button is clicked', async () => {
      const { fixture, element, component } = await setup();
      const dismissedSpy = vi.fn();
      component.dismissed.subscribe(dismissedSpy);
      (
        element.querySelector(
          '[data-testid="addon-deactivate-cancel"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(dismissedSpy).toHaveBeenCalledTimes(1);
    });

    it('emits `dismissed` on Escape key', async () => {
      const { fixture, component } = await setup();
      const dismissedSpy = vi.fn();
      component.dismissed.subscribe(dismissedSpy);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(dismissedSpy).toHaveBeenCalledTimes(1);
    });
  });
});
