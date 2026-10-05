/**
 * HplusExternalEgressComponent specs (CHO-2148).
 *
 * Drives the REAL service through HttpTestingController (chora-web CLAUDE.md §6)
 * so the literal BFF path is pinned — this screen decides whether a whole
 * tenant's learners may reach the open web, and a silently-wrong URL would look
 * exactly like a policy denial.
 *
 * The three assertions that matter most are not the happy path:
 *   - a failed READ must NOT render as "egress off"
 *   - a failed WRITE must NOT render as saved
 *   - "never opted in" must be distinguishable from "explicitly off"
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { HplusExternalEgressComponent } from './hplus-external-egress.component';
import { ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH } from './external-egress.model';
import type { ExternalEgressPolicy } from './external-egress.model';
import { TranslateService } from '../../../../core/services/translate.service';
import { environment } from '../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${ADMIN_TENANTS_ME_EXTERNAL_EGRESS_PATH}`;

const OPTED_IN: ExternalEgressPolicy = {
  tenant_id: '11111111-1111-7111-8111-111111111111',
  egress_enabled: true,
  daily_call_ceiling: 50,
  opted_in: true,
  max_daily_call_ceiling: 1000,
  version: 3,
  updated_at: '2026-07-14T10:00:00Z',
};

const NEVER_OPTED_IN: ExternalEgressPolicy = {
  tenant_id: '11111111-1111-7111-8111-111111111111',
  egress_enabled: false,
  daily_call_ceiling: 50,
  opted_in: false,
  max_daily_call_ceiling: 1000,
  version: 0,
};

function setup() {
  TestBed.configureTestingModule({
    imports: [HplusExternalEgressComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(HplusExternalEgressComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, cmp: fixture.componentInstance, httpMock };
}

describe('HplusExternalEgressComponent', () => {
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
  });

  it('reads the tenant policy from the canonical BFF path', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(OPTED_IN);

    expect(s.cmp.loadState().status).toBe('success');
    expect(s.cmp.enabledDraft()).toBe(true);
    expect(s.cmp.ceilingDraft()).toBe(50);
  });

  // Both of the next two render egress_enabled=false. Conflating them would hide
  // the default-deny posture — the very thing that keeps a franchise tenant safe
  // — from the admin who has to reason about it.
  it('shows the never-opted-in note when NO policy row exists', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(NEVER_OPTED_IN);
    s.fixture.detectChanges();

    expect(s.cmp.optedIn()).toBe(false);
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="hplus-egress-never-opted-in"]',
      ),
    ).toBeTruthy();
  });

  it('does NOT show the never-opted-in note for an explicitly-disabled tenant', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock
      .expectOne(URL)
      .flush({ ...OPTED_IN, egress_enabled: false, opted_in: true });
    s.fixture.detectChanges();

    expect(s.cmp.optedIn()).toBe(true);
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="hplus-egress-never-opted-in"]',
      ),
    ).toBeNull();
  });

  it('PATCHes the opt-in and adopts the BACKEND policy, not the draft', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(NEVER_OPTED_IN);

    s.cmp.onToggle(true);
    s.cmp.onCeilingInput(25);
    expect(s.cmp.canSave()).toBe(true);

    s.cmp.save();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({
      egress_enabled: true,
      daily_call_ceiling: 25,
    });

    // The backend clamps the ceiling to something else — the screen must show
    // what was PERSISTED, not what was typed.
    req.flush({
      ...OPTED_IN,
      egress_enabled: true,
      daily_call_ceiling: 20,
      version: 1,
    });

    expect(s.cmp.saveState().status).toBe('saved');
    expect(s.cmp.ceilingDraft()).toBe(20);
    expect(s.cmp.policy()?.daily_call_ceiling).toBe(20);
  });

  it('does NOT render a failed read as "egress off"', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    httpMock
      .expectOne(URL)
      .flush(
        { error: { code: 'internal', message: 'boom' } },
        { status: 500, statusText: 'Server Error' },
      );
    s.fixture.detectChanges();

    // Loud error, and crucially NO form — a rendered "off" here would be
    // indistinguishable from a real policy denial.
    expect(s.cmp.loadState().status).toBe('error');
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="hplus-egress-load-error"]',
      ),
    ).toBeTruthy();
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="hplus-egress-toggle"]'),
    ).toBeNull();
  });

  it('does NOT show a false success when the write fails', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(NEVER_OPTED_IN);

    s.cmp.onToggle(true);
    s.cmp.save();

    httpMock
      .expectOne(URL)
      .flush(
        { error: { code: 'forbidden', message: 'role not permitted' } },
        { status: 403, statusText: 'Forbidden' },
      );
    s.fixture.detectChanges();

    expect(s.cmp.saveState().status).toBe('error');
    expect(s.cmp.saveErrorKey()).toBe('hplus.externalEgress.error.forbidden');
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="hplus-egress-save-error"]',
      ),
    ).toBeTruthy();
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="hplus-egress-saved"]'),
    ).toBeNull();

    // The persisted policy is UNCHANGED — the toggle must not have "stuck".
    expect(s.cmp.policy()?.egress_enabled).toBe(false);
  });

  it('surfaces a 409 concurrent-update distinctly', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(OPTED_IN);

    s.cmp.onToggle(false);
    s.cmp.save();

    httpMock
      .expectOne(URL)
      .flush(
        { error: { code: 'conflict', message: 'changed concurrently' } },
        { status: 409, statusText: 'Conflict' },
      );

    expect(s.cmp.saveErrorKey()).toBe('hplus.externalEgress.error.conflict');
  });

  it('refuses to save a ceiling above the platform max', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(OPTED_IN);

    s.cmp.onCeilingInput(99999);

    expect(s.cmp.ceilingValid()).toBe(false);
    expect(s.cmp.canSave()).toBe(false);
    // No request is made — httpMock.verify() in afterEach proves it.
  });

  it('accepts a zero ceiling (entitled but budgeted to nothing)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(OPTED_IN);

    s.cmp.onCeilingInput(0);

    expect(s.cmp.ceilingValid()).toBe(true);
    expect(s.cmp.canSave()).toBe(true);

    s.cmp.save();
    const req = httpMock.expectOne(URL);
    expect(req.request.body.daily_call_ceiling).toBe(0);
    req.flush({ ...OPTED_IN, daily_call_ceiling: 0 });
  });

  it('cancel reverts the draft to the persisted policy', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(OPTED_IN);

    s.cmp.onToggle(false);
    s.cmp.onCeilingInput(1);
    expect(s.cmp.isDirty()).toBe(true);

    s.cmp.cancel();

    expect(s.cmp.enabledDraft()).toBe(true);
    expect(s.cmp.ceilingDraft()).toBe(50);
    expect(s.cmp.isDirty()).toBe(false);
  });
});
