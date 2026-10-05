/**
 * OplusEgressKillSwitchComponent specs (CHO-2148).
 *
 * Engaging this switch denies EVERY grounded web call for EVERY tenant. The
 * assertions that matter are therefore not the happy path:
 *
 *   - clicking "engage" must NOT write — a confirm step stands between a
 *     mis-click and taking the capability away from the whole platform
 *   - a failed READ must NOT render as "not engaged"
 *   - a failed WRITE must NOT look like it took effect
 *   - a non-operator must not be shown the control
 */
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { OplusEgressKillSwitchComponent } from './oplus-egress-kill-switch.component';
import { ADMIN_EGRESS_KILL_SWITCH_PATH } from './egress-kill-switch.model';
import type { EgressKillSwitch } from './egress-kill-switch.model';
import { RbacService } from '../../../../../core/services/rbac.service';
import { TranslateService } from '../../../../../core/services/translate.service';
import { environment } from '../../../../../../environments/environment';

const URL = `${environment.bffBaseUrl}${ADMIN_EGRESS_KILL_SWITCH_PATH}`;

const CLEAR: EgressKillSwitch = { engaged: false };
const ENGAGED: EgressKillSwitch = {
  engaged: true,
  reason: 'incident-42',
  updated_by_gcid: '00000000-0000-7000-8000-000000001999',
  updated_at: '2026-07-14T10:00:00Z',
};

function setup(isOperator = true) {
  TestBed.configureTestingModule({
    imports: [OplusEgressKillSwitchComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: RbacService,
        useValue: { hasRole: (r: string) => isOperator && r === 'platform_operator' },
      },
    ],
  });
  const fixture = TestBed.createComponent(OplusEgressKillSwitchComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, cmp: fixture.componentInstance, httpMock };
}

describe('OplusEgressKillSwitchComponent', () => {
  let httpMock: HttpTestingController;

  afterEach(() => {
    httpMock.verify();
  });

  it('reads the kill-switch from the canonical BFF path', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush(CLEAR);

    expect(s.cmp.engaged()).toBe(false);
  });

  it('renders the engaged state unmistakably', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(ENGAGED);
    s.fixture.detectChanges();

    expect(s.cmp.engaged()).toBe(true);
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="oplus-ks-engaged-banner"]',
      ),
    ).toBeTruthy();
    expect(
      s.fixture.nativeElement.querySelector(
        '[data-testid="oplus-ks-clear-banner"]',
      ),
    ).toBeNull();
  });

  // THE most important test on this screen.
  it('clicking engage does NOT write — it asks first', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(CLEAR);

    s.cmp.requestChange(true);
    s.fixture.detectChanges();

    expect(s.cmp.confirming()).toBe(true);
    expect(s.cmp.pendingChange()).toBe(true);
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-confirm"]'),
    ).toBeTruthy();

    // Still NOT engaged, and no PATCH was issued — httpMock.verify() in
    // afterEach proves the second part. A mis-click must not take web egress
    // away from every tenant on the platform.
    expect(s.cmp.engaged()).toBe(false);
  });

  it('confirming issues the PATCH and adopts the backend state', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(CLEAR);

    s.cmp.onReasonInput('incident-42');
    s.cmp.requestChange(true);
    s.cmp.confirm();

    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ engaged: true, reason: 'incident-42' });
    req.flush(ENGAGED);

    expect(s.cmp.engaged()).toBe(true);
    expect(s.cmp.writeState().status).toBe('done');
  });

  it('cancelling the confirm writes nothing', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(CLEAR);

    s.cmp.requestChange(true);
    s.cmp.cancel();

    expect(s.cmp.confirming()).toBe(false);
    expect(s.cmp.engaged()).toBe(false);
    // No PATCH — httpMock.verify() in afterEach proves it.
  });

  it('omits an empty reason rather than sending a blank string', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(CLEAR);

    s.cmp.onReasonInput('   ');
    s.cmp.requestChange(true);
    s.cmp.confirm();

    const req = httpMock.expectOne(URL);
    expect(req.request.body).toEqual({ engaged: true, reason: undefined });
    req.flush({ engaged: true });
  });

  it('does NOT render a failed read as "not engaged"', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    httpMock
      .expectOne(URL)
      .flush({ code: 'internal' }, { status: 500, statusText: 'Server Error' });
    s.fixture.detectChanges();

    expect(s.cmp.loadState().status).toBe('error');
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-load-error"]'),
    ).toBeTruthy();
    // Crucially: NO "clear" banner — an operator must not read a failed load as
    // "the platform is open".
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-clear-banner"]'),
    ).toBeNull();
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-engage"]'),
    ).toBeNull();
  });

  it('does NOT look like it took effect when the write fails', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    httpMock.expectOne(URL).flush(CLEAR);

    s.cmp.requestChange(true);
    s.cmp.confirm();

    httpMock
      .expectOne(URL)
      .flush(
        { code: 'GATEWAY_FORBIDDEN', message: 'operator only' },
        { status: 403, statusText: 'Forbidden' },
      );
    s.fixture.detectChanges();

    expect(s.cmp.writeErrorKey()).toBe('oplus.egressKillSwitch.error.forbidden');
    // The platform state is UNCHANGED.
    expect(s.cmp.engaged()).toBe(false);
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-write-error"]'),
    ).toBeTruthy();
  });

  it('hides the control from a non-operator', () => {
    const s = setup(false);
    httpMock = s.httpMock;
    s.fixture.detectChanges();

    expect(s.cmp.isOperator()).toBe(false);
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-not-operator"]'),
    ).toBeTruthy();
    expect(
      s.fixture.nativeElement.querySelector('[data-testid="oplus-ks-engage"]'),
    ).toBeNull();
  });
});
