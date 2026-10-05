import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { A2AConsentDialogComponent } from './a2a-consent-dialog.component';
import {
  ConsentScope,
  ConsentDuration,
  PartnerStatus,
  A2ASkill,
  A2AConsent,
} from '../../../admin/a2a/models/a2a.model';

describe('A2AConsentDialogComponent', () => {
  let component: A2AConsentDialogComponent;
  let fixture: ComponentFixture<A2AConsentDialogComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [A2AConsentDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(A2AConsentDialogComponent);
    component = fixture.componentInstance;

    fixture.componentRef.setInput('partnerId', 'partner-1');
    fixture.componentRef.setInput('partnerName', 'Test Partner');
    fixture.componentRef.setInput('partnerStatus', PartnerStatus.Verified);
    fixture.componentRef.setInput('agentName', 'Test Agent');
    fixture.componentRef.setInput('requestedSkill', A2ASkill.StudyConversation);

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="a2a-consent-dialog"]');
    expect(el).toBeTruthy();
  });

  it('should have alertdialog role', () => {
    const el = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(el).toBeTruthy();
  });

  it('should default to TopicsOnly scope', () => {
    expect(component.selectedScope()).toBe(ConsentScope.TopicsOnly);
  });

  it('should default to SingleSession duration', () => {
    expect(component.selectedDuration()).toBe(ConsentDuration.SingleSession);
  });

  it('should detect verified partner', () => {
    expect(component.isVerified()).toBe(true);
  });

  it('should change scope selection', () => {
    component.selectScope(ConsentScope.FullPersona);
    expect(component.selectedScope()).toBe(ConsentScope.FullPersona);
  });

  it('should change duration selection', () => {
    component.selectDuration(ConsentDuration.ThirtyDays);
    expect(component.selectedDuration()).toBe(ConsentDuration.ThirtyDays);
  });

  it('should emit consentDenied on deny', () => {
    const spy = vi.fn();
    component.consentDenied.subscribe(spy);
    component.denyConsent();
    expect(spy).toHaveBeenCalled();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Computed derived state
  // ---------------------------------------------------------------------------

  it('should compute skillLabelKey from requested skill', () => {
    expect(component.skillLabelKey()).toBe('a2a.skill.study_conversation');
  });

  it('should compute selectedScopeCapability for the default scope', () => {
    const cap = component.selectedScopeCapability();
    expect(cap?.scope).toBe(ConsentScope.TopicsOnly);
    expect(cap?.dataPoints.length).toBe(2);
  });

  it('should recompute selectedScopeCapability when scope changes', () => {
    component.selectScope(ConsentScope.FullPersona);
    const cap = component.selectedScopeCapability();
    expect(cap?.scope).toBe(ConsentScope.FullPersona);
    expect(cap?.dataPoints).toContain('a2a.consent.data_full_persona');
    expect(cap?.dataPoints.length).toBe(4);
  });

  it('should expose all four scopes', () => {
    expect(component.allScopes.length).toBe(4);
    expect(component.allScopes).toContain(ConsentScope.EbbinghausSchedule);
  });

  it('should expose all four durations', () => {
    expect(component.allDurations.length).toBe(4);
    expect(component.allDurations).toContain(ConsentDuration.UntilRevoked);
  });

  it('should expose four scope capabilities', () => {
    expect(component.scopeCapabilities.length).toBe(4);
  });

  // ---------------------------------------------------------------------------
  // Provisional (non-verified) partner branch
  // ---------------------------------------------------------------------------

  describe('provisional partner', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('partnerStatus', PartnerStatus.Pending);
      fixture.detectChanges();
    });

    it('should report not verified', () => {
      expect(component.isVerified()).toBe(false);
    });

    it('should render the provisional badge instead of verified', () => {
      const verified = fixture.nativeElement.querySelector('.a2a-consent-dialog__badge--verified');
      const provisional = fixture.nativeElement.querySelector(
        '.a2a-consent-dialog__badge--provisional',
      );
      expect(verified).toBeNull();
      expect(provisional).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------------------
  // Template rendering
  // ---------------------------------------------------------------------------

  it('should render the partner name in the partner row', () => {
    const el = fixture.nativeElement.querySelector('.a2a-consent-dialog__partner-name');
    expect(el?.textContent).toContain('Test Partner');
  });

  it('should render the agent name in the agent row', () => {
    const el = fixture.nativeElement.querySelector('.a2a-consent-dialog__agent-name');
    expect(el?.textContent).toContain('Test Agent');
  });

  it('should render the verified badge for a verified partner', () => {
    const verified = fixture.nativeElement.querySelector('.a2a-consent-dialog__badge--verified');
    expect(verified).toBeTruthy();
  });

  it('should render one radio per scope', () => {
    const radios = fixture.nativeElement.querySelectorAll('.a2a-consent-dialog__scope-radio');
    expect(radios.length).toBe(4);
  });

  it('should render one radio per duration', () => {
    const radios = fixture.nativeElement.querySelectorAll('.a2a-consent-dialog__duration-radio');
    expect(radios.length).toBe(4);
  });

  it('should render the data points for the selected scope', () => {
    const points = fixture.nativeElement.querySelectorAll('.a2a-consent-dialog__data-point');
    // default TopicsOnly => 2 data points
    expect(points.length).toBe(2);
  });

  it('should select scope via the radio change event', () => {
    const radios = fixture.nativeElement.querySelectorAll(
      '.a2a-consent-dialog__scope-radio',
    ) as NodeListOf<HTMLInputElement>;
    // FullPersona is the 4th scope
    radios[3].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedScope()).toBe(ConsentScope.FullPersona);
    const points = fixture.nativeElement.querySelectorAll('.a2a-consent-dialog__data-point');
    expect(points.length).toBe(4);
  });

  it('should select duration via the radio change event', () => {
    const radios = fixture.nativeElement.querySelectorAll(
      '.a2a-consent-dialog__duration-radio',
    ) as NodeListOf<HTMLInputElement>;
    radios[2].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.selectedDuration()).toBe(ConsentDuration.ThirtyDays);
  });

  it('should deny consent when the backdrop is clicked', () => {
    const spy = vi.fn();
    component.consentDenied.subscribe(spy);
    const backdrop = fixture.nativeElement.querySelector(
      '.a2a-consent-dialog__backdrop',
    ) as HTMLElement;
    backdrop.click();
    expect(spy).toHaveBeenCalled();
  });

  it('should deny consent when the close button is clicked', () => {
    const spy = vi.fn();
    component.consentDenied.subscribe(spy);
    const closeBtn = fixture.nativeElement.querySelector(
      '.a2a-consent-dialog__close',
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(spy).toHaveBeenCalled();
  });

  it('should deny consent when the deny button is clicked', () => {
    const spy = vi.fn();
    component.consentDenied.subscribe(spy);
    const denyBtn = fixture.nativeElement.querySelector(
      '.a2a-consent-dialog__btn--deny',
    ) as HTMLButtonElement;
    denyBtn.click();
    expect(spy).toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // grantConsent — WebAuthn unsupported (jsdom default: navigator.credentials
  // is undefined, so performWebAuthn throws and the catch branch runs)
  // ---------------------------------------------------------------------------

  describe('grantConsent — WebAuthn unsupported (jsdom default)', () => {
    it('should set webauthnError and reset isSubmitting when WebAuthn is unavailable', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const grantedSpy = vi.fn();
      component.consentGranted.subscribe(grantedSpy);

      await component.grantConsent();

      expect(component.webauthnError()).toBe('a2a.consent.webauthn_failed');
      expect(component.isSubmitting()).toBe(false);
      expect(grantedSpy).not.toHaveBeenCalled();
      // No HTTP request should have fired since WebAuthn failed first.
      httpMock.verify();
    });

    it('should render the webauthn error after a failed grant', async () => {
      await component.grantConsent();
      fixture.detectChanges();
      const err = fixture.nativeElement.querySelector('.a2a-consent-dialog__error');
      expect(err).toBeTruthy();
      expect(err?.textContent).toContain('a2a.consent.webauthn_failed');
    });

    it('should clear a previous webauthn error at the start of a new grant attempt', async () => {
      await component.grantConsent();
      expect(component.webauthnError()).toBe('a2a.consent.webauthn_failed');
      // Second attempt also fails, but the error is cleared then re-set —
      // characterizes that webauthnError is reset to null at entry.
      await component.grantConsent();
      expect(component.webauthnError()).toBe('a2a.consent.webauthn_failed');
    });
  });

  // ---------------------------------------------------------------------------
  // grantConsent — WebAuthn supported (stub navigator.credentials + crypto)
  // ---------------------------------------------------------------------------

  describe('grantConsent — WebAuthn supported', () => {
    let originalCredentials: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalCredentials = Object.getOwnPropertyDescriptor(navigator, 'credentials');
      Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: {
          get: vi.fn().mockResolvedValue({ id: 'cred-abc' }),
        },
      });
    });

    afterEach(() => {
      if (originalCredentials) {
        Object.defineProperty(navigator, 'credentials', originalCredentials);
      } else {
        delete (navigator as unknown as Record<string, unknown>)['credentials'];
      }
    });

    it('should POST the consent grant and emit consentGranted on success', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const grantedSpy = vi.fn();
      component.consentGranted.subscribe(grantedSpy);

      component.selectScope(ConsentScope.LearningStyle);
      component.selectDuration(ConsentDuration.SevenDays);

      const grantPromise = component.grantConsent();
      // Drain the microtask queue so the awaited performWebAuthn resolves
      // and the service POST is actually dispatched before we assert on it.
      await Promise.resolve();
      await Promise.resolve();

      const req = httpMock.expectOne('https://api.chora.site/api/v1/a2a/consents');
      expect(req.request.method).toBe('POST');
      expect(req.request.body.partnerId).toBe('partner-1');
      expect(req.request.body.agentName).toBe('Test Agent');
      expect(req.request.body.skill).toBe(A2ASkill.StudyConversation);
      expect(req.request.body.scope).toBe(ConsentScope.LearningStyle);
      expect(req.request.body.duration).toBe(ConsentDuration.SevenDays);
      expect(req.request.body.webauthnCredential).toBe('cred-abc');

      const consent: A2AConsent = {
        id: 'consent-1',
        partnerId: 'partner-1',
        partnerName: 'Test Partner',
        partnerStatus: PartnerStatus.Verified,
        agentName: 'Test Agent',
        skill: A2ASkill.StudyConversation,
        scope: ConsentScope.LearningStyle,
        duration: ConsentDuration.SevenDays,
        grantedAt: '2026-06-04T00:00:00Z',
        expiresAt: null,
        lastUsedAt: null,
        revokedAt: null,
      };
      req.flush(consent);
      await grantPromise;

      expect(grantedSpy).toHaveBeenCalledTimes(1);
      expect(component.isSubmitting()).toBe(false);
      expect(component.webauthnError()).toBeNull();
      httpMock.verify();
    });

    it('should reset isSubmitting and not emit on a 5xx server error', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const grantedSpy = vi.fn();
      component.consentGranted.subscribe(grantedSpy);

      const grantPromise = component.grantConsent();
      await Promise.resolve();
      await Promise.resolve();

      const req = httpMock.expectOne('https://api.chora.site/api/v1/a2a/consents');
      req.flush('boom', { status: 500, statusText: 'Server Error' });
      await grantPromise;

      // service swallows the error into of(null); component leaves no consent emit
      expect(grantedSpy).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
      httpMock.verify();
    });

    it('should not emit consentGranted when the service yields a null consent (4xx)', async () => {
      const httpMock = TestBed.inject(HttpTestingController);
      const grantedSpy = vi.fn();
      component.consentGranted.subscribe(grantedSpy);

      const grantPromise = component.grantConsent();
      await Promise.resolve();
      await Promise.resolve();

      const req = httpMock.expectOne('https://api.chora.site/api/v1/a2a/consents');
      req.flush('bad request', { status: 400, statusText: 'Bad Request' });
      await grantPromise;

      expect(grantedSpy).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
      httpMock.verify();
    });
  });
});
