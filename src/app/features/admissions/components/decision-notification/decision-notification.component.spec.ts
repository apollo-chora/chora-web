import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router, ActivatedRoute } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { DecisionNotificationComponent } from './decision-notification.component';
import { ToastService } from '../../../../shared/components/toast/toast.service';
import { environment } from '../../../../../environments/environment';
import type { DecisionResult } from '../../models/admission-learner.model';

const DECISION_URL = (appId: string) =>
  `${environment.bffBaseUrl}/api/v1/admissions/my-applications/${appId}/decision`;

const APPROVED: DecisionResult = {
  decision: 'approved',
  message: 'Congratulations, you are in!',
  decided_at: '2026-01-15T00:00:00Z',
  reason_summary: null,
  next_steps: ['Complete enrollment', 'Pay fees'],
  enrollment_action_url: '/enroll/cs-2026',
  next_intake_date: null,
  auto_carry_forward: false,
  reapplication_eligible: false,
  reapplication_earliest_date: null,
};

const REJECTED: DecisionResult = {
  decision: 'rejected',
  message: 'We regret to inform you of this outcome.',
  decided_at: '2026-01-15T00:00:00Z',
  reason_summary: 'Prerequisites not met',
  next_steps: [],
  enrollment_action_url: null,
  next_intake_date: null,
  auto_carry_forward: false,
  reapplication_eligible: true,
  reapplication_earliest_date: '2026-06-01',
};

const DEFERRED: DecisionResult = {
  decision: 'deferred',
  message: 'Your application has been deferred to the next intake.',
  decided_at: '2026-01-15T00:00:00Z',
  reason_summary: null,
  next_steps: [],
  enrollment_action_url: null,
  next_intake_date: '2026-09-01',
  auto_carry_forward: true,
  reapplication_eligible: false,
  reapplication_earliest_date: null,
};

/**
 * Build a fixture whose ActivatedRoute snapshot exposes the given
 * `applicationId` param, so ngOnInit fires loadDecision against the BFF.
 * Pass `null` to characterise the no-param (no fetch) branch.
 */
function setupWithRouteParam(appId: string | null): {
  fixture: ComponentFixture<DecisionNotificationComponent>;
  component: DecisionNotificationComponent;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [DecisionNotificationComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(
              appId === null ? {} : { applicationId: appId },
            ),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DecisionNotificationComponent);
  const component = fixture.componentInstance;
  const element = fixture.nativeElement as HTMLElement;
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, component, element, httpMock };
}

describe('DecisionNotificationComponent', () => {
  let component: DecisionNotificationComponent;
  let fixture: ComponentFixture<DecisionNotificationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionNotificationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DecisionNotificationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with no decision', () => {
    expect(component.decision()).toBeNull();
    expect(component.hasDecision()).toBe(false);
  });

  it('should identify approved decision', () => {
    const approved: DecisionResult = {
      decision: 'approved',
      message: 'Congratulations!',
      decided_at: '2026-01-15T00:00:00Z',
      reason_summary: null,
      next_steps: ['Complete enrollment', 'Pay fees'],
      enrollment_action_url: '/enroll/cs-2026',
      next_intake_date: null,
      auto_carry_forward: false,
      reapplication_eligible: false,
      reapplication_earliest_date: null,
    };
    component.decision.set(approved);

    expect(component.isApproved()).toBe(true);
    expect(component.isRejected()).toBe(false);
    expect(component.isDeferred()).toBe(false);
    expect(component.badgeClass()).toBe('decision-notification__badge--approved');
    expect(component.badgeIcon()).toBe('\u2713');
  });

  it('should identify rejected decision', () => {
    const rejected: DecisionResult = {
      decision: 'rejected',
      message: 'We regret to inform you...',
      decided_at: '2026-01-15T00:00:00Z',
      reason_summary: 'Prerequisites not met',
      next_steps: [],
      enrollment_action_url: null,
      next_intake_date: null,
      auto_carry_forward: false,
      reapplication_eligible: true,
      reapplication_earliest_date: '2026-06-01',
    };
    component.decision.set(rejected);

    expect(component.isRejected()).toBe(true);
    expect(component.badgeClass()).toBe('decision-notification__badge--rejected');
    expect(component.badgeIcon()).toBe('\u2717');
  });

  it('should identify deferred decision', () => {
    const deferred: DecisionResult = {
      decision: 'deferred',
      message: 'Your application has been deferred...',
      decided_at: '2026-01-15T00:00:00Z',
      reason_summary: null,
      next_steps: [],
      enrollment_action_url: null,
      next_intake_date: '2026-09-01',
      auto_carry_forward: true,
      reapplication_eligible: false,
      reapplication_earliest_date: null,
    };
    component.decision.set(deferred);

    expect(component.isDeferred()).toBe(true);
    expect(component.badgeClass()).toBe('decision-notification__badge--deferred');
    expect(component.badgeIcon()).toBe('\u23F0');
  });

  it('returns empty badgeClass and badgeIcon when there is no decision', () => {
    expect(component.decision()).toBeNull();
    expect(component.badgeClass()).toBe('');
    expect(component.badgeIcon()).toBe('');
  });

  it('exposes the canonical decision label + icon constants', () => {
    expect(component.decisionLabels.approved).toBe('admissions.decision_approved');
    expect(component.decisionLabels.rejected).toBe('admissions.decision_rejected');
    expect(component.decisionLabels.deferred).toBe('admissions.decision_deferred');
    expect(component.decisionIcons.approved).toBe('check_circle');
    expect(component.decisionIcons.rejected).toBe('cancel');
    expect(component.decisionIcons.deferred).toBe('schedule');
  });

  it('trackByIndex returns the index', () => {
    expect(component.trackByIndex(0)).toBe(0);
    expect(component.trackByIndex(7)).toBe(7);
  });
});

describe('DecisionNotificationComponent \u2014 shell render', () => {
  it('renders the header title + main region without a route param (no fetch)', () => {
    const { fixture, element, httpMock } = setupWithRouteParam(null);
    fixture.detectChanges();

    const root = element.querySelector('[data-testid="decision-notification"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute('role')).toBe('main');

    const title = element.querySelector('[data-testid="decision-title"]');
    expect(title?.textContent).toContain('admissions.decision_title');

    // No appId \u2192 loadDecision never runs \u2192 no HTTP, not loading, no decision.
    expect(fixture.componentInstance.loading()).toBe(false);
    expect(fixture.componentInstance.applicationId()).toBeNull();
    httpMock.verify();
  });

  it('renders the no-decision empty state when there is no decision', () => {
    const { fixture, element, httpMock } = setupWithRouteParam(null);
    fixture.detectChanges();

    const empty = element.querySelector('[data-testid="no-decision"]');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('admissions.no_decision_yet');
    httpMock.verify();
  });
});

describe('DecisionNotificationComponent \u2014 load lifecycle', () => {
  it('sets loading true and shows the skeleton while the decision request is in flight', () => {
    const { fixture, component, element, httpMock } =
      setupWithRouteParam('app-123');
    fixture.detectChanges(); // ngOnInit \u2192 loadDecision

    expect(component.applicationId()).toBe('app-123');
    expect(component.loading()).toBe(true);

    const skeleton = element.querySelector('[data-testid="decision-loading"]');
    expect(skeleton).not.toBeNull();

    const req = httpMock.expectOne(DECISION_URL('app-123'));
    expect(req.request.method).toBe('GET');
    req.flush(APPROVED);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    httpMock.verify();
  });

  it('encodes the application id in the decision URL', () => {
    const { fixture, httpMock } = setupWithRouteParam('app/with space');
    fixture.detectChanges();

    const req = httpMock.expectOne(DECISION_URL('app%2Fwith%20space'));
    req.flush(APPROVED);
    fixture.detectChanges();
    httpMock.verify();
  });

  it('does not stay in loading and keeps decision null when the server returns null body', () => {
    const { fixture, component, element, httpMock } =
      setupWithRouteParam('app-null');
    fixture.detectChanges();

    httpMock.expectOne(DECISION_URL('app-null')).flush(null);
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.decision()).toBeNull();
    expect(component.hasDecision()).toBe(false);
    // Falls through to the no-decision empty state.
    expect(element.querySelector('[data-testid="no-decision"]')).not.toBeNull();
    httpMock.verify();
  });
});

describe('DecisionNotificationComponent \u2014 approved render', () => {
  let fixture: ComponentFixture<DecisionNotificationComponent>;
  let component: DecisionNotificationComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    const built = setupWithRouteParam('app-approved');
    fixture = built.fixture;
    component = built.component;
    element = built.element;
    httpMock = built.httpMock;
    fixture.detectChanges();
    httpMock.expectOne(DECISION_URL('app-approved')).flush(APPROVED);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('renders the approved badge section + decision message', () => {
    expect(component.isApproved()).toBe(true);
    const badge = element.querySelector('[data-testid="decision-badge-section"]');
    expect(badge).not.toBeNull();

    const message = element.querySelector('[data-testid="decision-message"]');
    expect(message?.textContent).toContain('Congratulations, you are in!');
  });

  it('renders the next-steps list with one item per step', () => {
    const nextSteps = element.querySelector('[data-testid="next-steps"]');
    expect(nextSteps).not.toBeNull();
    const items = element.querySelectorAll(
      '.decision-notification__step-item',
    );
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Complete enrollment');
    expect(items[1].textContent).toContain('Pay fees');
  });

  it('renders the enroll CTA and routes to the enrollment URL on click', () => {
    const router = TestBed.inject(Router);
    const spy = vi
      .spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true as unknown as boolean);

    const enroll = element.querySelector(
      '[data-testid="enroll-btn"]',
    ) as HTMLButtonElement;
    expect(enroll).not.toBeNull();
    enroll.click();

    expect(spy).toHaveBeenCalledWith('/enroll/cs-2026');
  });

  it('does not show rejection or deferral sections for an approved decision', () => {
    expect(element.querySelector('[data-testid="rejection-details"]')).toBeNull();
    expect(element.querySelector('[data-testid="deferral-details"]')).toBeNull();
  });

  it('navigateToEnrollment is a no-op when the enrollment_action_url is absent', () => {
    const router = TestBed.inject(Router);
    const spy = vi.spyOn(router, 'navigateByUrl');
    component.decision.set({ ...APPROVED, enrollment_action_url: null });
    fixture.detectChanges();

    component.navigateToEnrollment();
    expect(spy).not.toHaveBeenCalled();
  });

  it('goToApplications navigates to the admissions list', () => {
    const router = TestBed.inject(Router);
    const spy = vi
      .spyOn(router, 'navigate')
      .mockResolvedValue(true as unknown as boolean);

    const back = element.querySelector(
      '[data-testid="back-to-applications"]',
    ) as HTMLButtonElement;
    back.click();

    expect(spy).toHaveBeenCalledWith(['/admissions']);
  });
});

describe('DecisionNotificationComponent \u2014 rejected render', () => {
  it('renders the rejection reason + eligible re-application with earliest date', () => {
    const { fixture, component, element, httpMock } =
      setupWithRouteParam('app-rejected');
    fixture.detectChanges();
    httpMock.expectOne(DECISION_URL('app-rejected')).flush(REJECTED);
    fixture.detectChanges();

    expect(component.isRejected()).toBe(true);
    const rejection = element.querySelector(
      '[data-testid="rejection-details"]',
    );
    expect(rejection).not.toBeNull();
    expect(rejection?.textContent).toContain('Prerequisites not met');
    expect(rejection?.textContent).toContain(
      'admissions.reapplication_eligible',
    );
    // earliest re-apply date branch renders.
    expect(rejection?.textContent).toContain('admissions.earliest_reapply');

    // No approved or deferred sections.
    expect(element.querySelector('[data-testid="next-steps"]')).toBeNull();
    expect(element.querySelector('[data-testid="deferral-details"]')).toBeNull();
    httpMock.verify();
  });

  it('renders the not-eligible message when re-application is barred', () => {
    const { fixture, element, httpMock } = setupWithRouteParam('app-rej2');
    fixture.detectChanges();
    httpMock
      .expectOne(DECISION_URL('app-rej2'))
      .flush({
        ...REJECTED,
        reason_summary: null,
        reapplication_eligible: false,
        reapplication_earliest_date: null,
      });
    fixture.detectChanges();

    const rejection = element.querySelector(
      '[data-testid="rejection-details"]',
    );
    expect(rejection?.textContent).toContain(
      'admissions.reapplication_not_eligible',
    );
    // reason_summary null \u2192 no reason section.
    expect(
      element.querySelector('.decision-notification__reason-section'),
    ).toBeNull();
    httpMock.verify();
  });
});

describe('DecisionNotificationComponent \u2014 deferred render', () => {
  it('renders the deferral info with next intake date + auto carry-forward', () => {
    const { fixture, component, element, httpMock } =
      setupWithRouteParam('app-deferred');
    fixture.detectChanges();
    httpMock.expectOne(DECISION_URL('app-deferred')).flush(DEFERRED);
    fixture.detectChanges();

    expect(component.isDeferred()).toBe(true);
    const deferral = element.querySelector('[data-testid="deferral-details"]');
    expect(deferral).not.toBeNull();
    expect(deferral?.textContent).toContain('admissions.next_intake');

    const carry = element.querySelector('[data-testid="carry-forward"]');
    expect(carry).not.toBeNull();
    expect(carry?.textContent).toContain('admissions.auto_carry_forward');
    httpMock.verify();
  });

  it('renders the manual-reapply note when auto carry-forward is off', () => {
    const { fixture, element, httpMock } = setupWithRouteParam('app-def2');
    fixture.detectChanges();
    httpMock
      .expectOne(DECISION_URL('app-def2'))
      .flush({ ...DEFERRED, auto_carry_forward: false, next_intake_date: null });
    fixture.detectChanges();

    const deferral = element.querySelector('[data-testid="deferral-details"]');
    expect(deferral?.textContent).toContain(
      'admissions.manual_reapply_needed',
    );
    // carry-forward block absent.
    expect(element.querySelector('[data-testid="carry-forward"]')).toBeNull();
    httpMock.verify();
  });
});

describe('DecisionNotificationComponent \u2014 error path', () => {
  // NOTE: AdmissionService.getDecision wraps the BFF call in catchError(of(null)),
  // so an HTTP error never propagates to the component's subscribe `error`
  // callback \u2014 the component receives `null` via `next` instead. The
  // component's own `toast.show('admissions.decision_load_error', ...)` error
  // branch is therefore effectively DEAD via the service path. These tests
  // characterise the actual (graceful-degradation) behaviour: on a 4xx/5xx the
  // component clears loading, keeps decision null, fires no error toast, and
  // falls through to the no-decision empty state.
  it('clears loading + shows the empty state (no toast) on a 500 from the BFF', () => {
    const { fixture, component, element, httpMock } =
      setupWithRouteParam('app-err');
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(DECISION_URL('app-err'))
      .flush(
        { error: 'boom' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.decision()).toBeNull();
    // Service swallowed the error \u2192 component's toast branch never reached.
    expect(toastSpy).not.toHaveBeenCalled();
    // Renders the no-decision empty state after the swallowed error.
    expect(element.querySelector('[data-testid="no-decision"]')).not.toBeNull();
    httpMock.verify();
  });

  it('clears loading + fires no toast on a 404 too', () => {
    const { fixture, component, httpMock } = setupWithRouteParam('app-404');
    const toast = TestBed.inject(ToastService);
    const toastSpy = vi.spyOn(toast, 'show');

    fixture.detectChanges();
    httpMock
      .expectOne(DECISION_URL('app-404'))
      .flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();

    expect(toastSpy).not.toHaveBeenCalled();
    expect(component.loading()).toBe(false);
    httpMock.verify();
  });
});

describe('DecisionNotificationComponent \u2014 teardown', () => {
  it('unsubscribes on destroy without leaking the in-flight request', () => {
    const { fixture, httpMock } = setupWithRouteParam('app-destroy');
    fixture.detectChanges();
    httpMock.expectOne(DECISION_URL('app-destroy')).flush(APPROVED);
    fixture.detectChanges();

    // Should not throw on destroy.
    expect(() => fixture.destroy()).not.toThrow();
    httpMock.verify();
  });
});
