/**
 * OplusEgressAuditComponent specs (CHO-2245).
 *
 * A read-only transparency panel: one fetch on init, a manual refresh, and four
 * honest states (loading / success / empty / error). The assertions that matter:
 *
 *   - it FETCHES on init and re-fetches on refresh (poll-free, no timers)
 *   - a decision reads permitted vs denied unmistakably, and a denied row shows
 *     its reason
 *   - web_search_queries render as "what was searched" chips — the QUERY, never
 *     the web-sourced content/knowledge (proto constraint)
 *   - empty and error states are explicit; a 403 says "insufficient role" rather
 *     than an empty list (which would read as "no egress happened")
 *
 * Mocks the EgressAuditService seam (house pattern) — no HTTP, no timers.
 */
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OplusEgressAuditComponent } from './oplus-egress-audit.component';
import { EgressAuditService } from './egress-audit.service';
import type { EgressAuditResponse } from './egress-audit.model';
import { TranslateService } from '../../../../../core/services/translate.service';
import { ApiError } from '../../../../../core/interceptors/api-error.model';

const PERMITTED = {
  event_id: 'e-allow',
  tenant_id: 't1',
  action: 'external_egress',
  decision: 'permitted',
  subject_type: 'agent',
  subject_id: 'familiar_seeker',
  created_at: '2026-07-17T09:00:00Z',
  after: {
    agentId: 'familiar_seeker',
    actionCode: 'grounded_web_search',
    webSearchQueries: ['ebbinghaus forgetting curve', 'spaced repetition intervals'],
    citationCount: 3,
    result: 'AUDIT_RESULT_ALLOWED',
    vendor: 'vertex_ai_gemini',
    modelVersion: 'gemini-3-pro',
    modelArmorVerdictPre: 'ALLOW',
    modelArmorVerdictPost: 'ALLOW',
  },
} as const;

const DENIED = {
  event_id: 'e-deny',
  tenant_id: 't1',
  action: 'external_egress',
  decision: 'denied',
  reason: 'external egress denied; denial_reason=model_armor_pre_block',
  subject_type: 'agent',
  subject_id: 'familiar_seeker',
  created_at: '2026-07-17T10:00:00Z',
  after: {
    agentId: 'familiar_seeker',
    actionCode: 'grounded_web_search',
    citationCount: 0,
    result: 'AUDIT_RESULT_DENIED',
    denialReason: 'model_armor_pre_block',
    modelArmorVerdictPre: 'BLOCK',
  },
} as const;

function response(...items: unknown[]): EgressAuditResponse {
  return {
    fetched_at: '2026-07-17T10:05:00Z',
    count: items.length,
    items: items as EgressAuditResponse['items'],
  };
}

class EgressAuditServiceStub {
  list = vi.fn();
}

function setup(listReturn: Observable<EgressAuditResponse>) {
  const svc = new EgressAuditServiceStub();
  svc.list.mockReturnValue(listReturn);
  TestBed.configureTestingModule({
    imports: [OplusEgressAuditComponent],
    providers: [
      provideRouter([]),
      TranslateService,
      { provide: EgressAuditService, useValue: svc },
    ],
  });
  const fixture: ComponentFixture<OplusEgressAuditComponent> =
    TestBed.createComponent(OplusEgressAuditComponent);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, cmp: fixture.componentInstance, svc, el };
}

const q = (el: HTMLElement, testid: string) =>
  el.querySelector(`[data-testid="${testid}"]`);
const all = (el: HTMLElement, testid: string) =>
  Array.from(el.querySelectorAll(`[data-testid="${testid}"]`));

describe('OplusEgressAuditComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('fetches the audit slice once on init', () => {
    const { svc, fixture } = setup(of(response(PERMITTED)));
    fixture.detectChanges();
    expect(svc.list).toHaveBeenCalledTimes(1);
  });

  it('renders the surface accent + title on the screen root', () => {
    const { fixture, el } = setup(of(response(PERMITTED)));
    fixture.detectChanges();
    const root = q(el, 'oplus-egress-audit-root');
    expect(root).toBeTruthy();
    expect(root?.className).toContain('surface-oplus');
    expect(q(el, 'oplus-ea-title')?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('renders one row per audited decision', () => {
    const { fixture, el } = setup(of(response(PERMITTED, DENIED)));
    fixture.detectChanges();
    expect(all(el, 'oplus-ea-row').length).toBe(2);
  });

  it('reads permitted vs denied unmistakably per row', () => {
    const { fixture, el } = setup(of(response(PERMITTED, DENIED)));
    fixture.detectChanges();
    const chips = all(el, 'oplus-ea-decision') as HTMLElement[];
    expect(chips.map((c) => c.dataset['decision'])).toEqual(['permitted', 'denied']);
  });

  it('shows the reason on a denied row and none on a permitted row', () => {
    const { fixture, el } = setup(of(response(PERMITTED, DENIED)));
    fixture.detectChanges();
    const rows = all(el, 'oplus-ea-row') as HTMLElement[];
    expect(rows[0].querySelector('[data-testid="oplus-ea-reason"]')).toBeNull();
    const reason = rows[1].querySelector('[data-testid="oplus-ea-reason"]');
    expect(reason?.textContent).toContain('model_armor_pre_block');
  });

  it('renders the action_code from the after payload', () => {
    const { fixture, el } = setup(of(response(PERMITTED)));
    fixture.detectChanges();
    expect(q(el, 'oplus-ea-action-code')?.textContent).toContain('grounded_web_search');
  });

  it('renders web_search_queries as "what was searched" chips, not content', () => {
    const { fixture, el } = setup(of(response(PERMITTED)));
    fixture.detectChanges();
    // The queries live inside a labelled "searched" block (never a content block).
    const searched = q(el, 'oplus-ea-searched');
    expect(searched).toBeTruthy();
    const chips = all(el, 'oplus-ea-query') as HTMLElement[];
    expect(chips.map((c) => c.textContent?.trim())).toEqual([
      'ebbinghaus forgetting curve',
      'spaced repetition intervals',
    ]);
  });

  it('renders the row timestamp (created_at)', () => {
    const { fixture, el } = setup(of(response(PERMITTED)));
    fixture.detectChanges();
    expect(q(el, 'oplus-ea-time')?.textContent?.trim().length).toBeGreaterThan(0);
  });

  it('shows an explicit empty state when there are no decisions', () => {
    const { fixture, el } = setup(of(response()));
    fixture.detectChanges();
    expect(q(el, 'oplus-ea-empty')).toBeTruthy();
    expect(all(el, 'oplus-ea-row').length).toBe(0);
  });

  it('shows a loading state before the fetch resolves', () => {
    // A never-emitting stream keeps the component in loading.
    const { fixture, el } = setup(new Observable<EgressAuditResponse>(() => {}));
    fixture.detectChanges();
    expect(q(el, 'oplus-ea-loading')).toBeTruthy();
    expect(q(el, 'oplus-ea-empty')).toBeNull();
  });

  it('surfaces a 403 as an insufficient-role message, not an empty list', () => {
    const err = new ApiError(
      403,
      { code: 'GATEWAY_FORBIDDEN', message: 'auditor role required', correlation_id: 'c1' },
      { code: 'GATEWAY_FORBIDDEN' },
    );
    const { fixture, el, cmp } = setup(throwError(() => err));
    fixture.detectChanges();
    expect(cmp.errorKey()).toBe('oplus.egressAudit.error.forbidden');
    expect(q(el, 'oplus-ea-error')).toBeTruthy();
    // NOT an empty state — that would read as "no egress happened".
    expect(q(el, 'oplus-ea-empty')).toBeNull();
    expect(q(el, 'oplus-ea-forbidden')).toBeTruthy();
  });

  it('renders a generic error block with a retry for an unknown failure', () => {
    const { fixture, el, cmp } = setup(throwError(() => new Error('boom')));
    fixture.detectChanges();
    expect(cmp.errorKey()).toBe('oplus.egressAudit.error.generic');
    expect(q(el, 'oplus-ea-error')).toBeTruthy();
    expect(q(el, 'oplus-ea-retry')).toBeTruthy();
  });

  it('re-fetches when the refresh control is used', () => {
    const { svc, cmp } = setup(of(response(PERMITTED)));
    cmp.load();
    expect(svc.list).toHaveBeenCalledTimes(2); // once on init + once on refresh
  });
});
