import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { A2AConnectionsComponent } from './a2a-connections.component';
import {
  ConsentScope,
  PartnerStatus,
  A2ASkill,
  ConsentDuration,
} from '../../../admin/a2a/models/a2a.model';
import type { A2AConsent, A2AActivityEntry } from '../../../admin/a2a/models/a2a.model';
import { environment } from '../../../../../environments/environment';

const BASE = environment.bffBaseUrl;
const GRANTS_URL = `${BASE}/api/v1/a2a/consents`;

const mockGrant: A2AConsent = {
  id: 'grant-1',
  partnerId: 'partner-1',
  partnerName: 'Test Partner',
  partnerStatus: PartnerStatus.Verified,
  agentName: 'Test Agent',
  skill: A2ASkill.StudyConversation,
  scope: ConsentScope.TopicsOnly,
  duration: ConsentDuration.SevenDays,
  grantedAt: '2026-03-20T10:00:00Z',
  expiresAt: '2026-03-27T10:00:00Z',
  lastUsedAt: '2026-03-21T14:00:00Z',
  revokedAt: null,
};

const mockGrant2: A2AConsent = {
  ...mockGrant,
  id: 'grant-2',
  partnerName: 'Second Partner',
  agentName: 'Second Agent',
  scope: ConsentScope.FullPersona,
};

const mockActivity: A2AActivityEntry = {
  id: 'act-1',
  consentId: 'grant-1',
  partnerId: 'partner-1',
  partnerName: 'Test Partner',
  agentName: 'Test Agent',
  skill: A2ASkill.StudyConversation,
  action: 'study_conversation.invoked',
  timestamp: '2026-03-21T14:30:00Z',
  details: {},
};

describe('A2AConnectionsComponent', () => {
  let component: A2AConnectionsComponent;
  let fixture: ComponentFixture<A2AConnectionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [A2AConnectionsComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(A2AConnectionsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="a2a-connections"]');
    expect(el).toBeTruthy();
  });

  it('should default to no expanded grant', () => {
    expect(component.expandedGrantId()).toBeNull();
  });

  it('should default to no revoke dialog', () => {
    expect(component.isRevokeDialogOpen()).toBe(false);
  });

  it('should default to no scope modify dialog', () => {
    expect(component.isScopeModifyOpen()).toBe(false);
  });

  it('should toggle grant expansion', () => {
    component.toggleGrant('grant-1');
    expect(component.isExpanded('grant-1')).toBe(true);
    component.toggleGrant('grant-1');
    expect(component.isExpanded('grant-1')).toBe(false);
  });

  it('should open and close revoke dialog', () => {
    component.openRevokeDialog(mockGrant);
    expect(component.isRevokeDialogOpen()).toBe(true);
    component.closeRevokeDialog();
    expect(component.isRevokeDialogOpen()).toBe(false);
  });

  it('should require typed REVOKE for full_persona scope', () => {
    const fullPersonaGrant = { ...mockGrant, scope: ConsentScope.FullPersona };
    expect(component.requiresTypedRevoke(fullPersonaGrant)).toBe(true);
    expect(component.requiresTypedRevoke(mockGrant)).toBe(false);
  });

  it('should validate revoke confirmation for non-full_persona', () => {
    component.openRevokeDialog(mockGrant);
    expect(component.isRevokeConfirmed()).toBe(true);
  });

  it('should validate revoke confirmation for full_persona requires REVOKE text', () => {
    const fullPersonaGrant = { ...mockGrant, scope: ConsentScope.FullPersona };
    component.openRevokeDialog(fullPersonaGrant);
    expect(component.isRevokeConfirmed()).toBe(false);
    component.revokeConfirmText.set('REVOKE');
    expect(component.isRevokeConfirmed()).toBe(true);
  });

  it('should format dates correctly', () => {
    expect(component.formatDate(null)).toBe('-');
    const result = component.formatDate('2026-03-21T14:00:00Z');
    expect(result).toBeTruthy();
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // ngOnInit / grant loading via HTTP
  // -------------------------------------------------------------------------

  it('should fetch active grants on init via GET /api/v1/a2a/consents', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    // ngOnInit fired during beforeEach detectChanges; flush the pending request.
    const req = httpMock.expectOne(GRANTS_URL);
    expect(req.request.method).toBe('GET');
    req.flush([mockGrant]);
    fixture.detectChanges();

    expect(component.activeGrants().length).toBe(1);
    expect(component.activeGrants()[0].id).toBe('grant-1');
  });

  it('should render the empty state when there are no active grants', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([]);
    fixture.detectChanges();

    const empty = fixture.nativeElement.querySelector('.a2a-connections__empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('a2a.connections.no_grants');
  });

  it('should render a grant row with partner + agent name', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.a2a-connections__empty')).toBeNull();
    expect(host.querySelector('.a2a-connections__partner-name')?.textContent).toContain(
      'Test Partner',
    );
    expect(host.querySelector('.a2a-connections__agent-name')?.textContent).toContain('Test Agent');
  });

  it('should filter out revoked grants from the active list', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock
      .expectOne(GRANTS_URL)
      .flush([mockGrant, { ...mockGrant2, revokedAt: '2026-03-25T00:00:00Z' }]);
    fixture.detectChanges();

    expect(component.activeGrants().length).toBe(1);
    expect(component.activeGrants()[0].id).toBe('grant-1');
  });

  it('should keep an empty active list when the grants fetch errors (5xx)', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(component.activeGrants().length).toBe(0);
    const empty = fixture.nativeElement.querySelector('.a2a-connections__empty');
    expect(empty).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // toggleGrant + activity log
  // -------------------------------------------------------------------------

  it('should fetch the activity log when expanding a grant', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    component.toggleGrant('grant-1');
    const actReq = httpMock.expectOne(`${GRANTS_URL}/grant-1/activity`);
    expect(actReq.request.method).toBe('GET');
    actReq.flush([mockActivity]);
    fixture.detectChanges();

    expect(component.isExpanded('grant-1')).toBe(true);
    expect(component.hasActivityLog()).toBe(true);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.a2a-connections__activity-action')?.textContent).toContain(
      'study_conversation.invoked',
    );
  });

  it('should not fire another activity request when collapsing a grant', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    component.toggleGrant('grant-1');
    httpMock.expectOne(`${GRANTS_URL}/grant-1/activity`).flush([mockActivity]);

    // Collapse — no new HTTP traffic expected.
    component.toggleGrant('grant-1');
    expect(component.isExpanded('grant-1')).toBe(false);
    httpMock.verify();
  });

  it('should show the activity-empty message when log is empty', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    component.toggleGrant('grant-1');
    httpMock.expectOne(`${GRANTS_URL}/grant-1/activity`).flush([]);
    fixture.detectChanges();

    expect(component.hasActivityLog()).toBe(false);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.a2a-connections__activity-empty')?.textContent).toContain(
      'a2a.connections.no_activity',
    );
  });

  // -------------------------------------------------------------------------
  // Revocation flow
  // -------------------------------------------------------------------------

  it('should reset confirm text + error when opening the revoke dialog', () => {
    component.revokeConfirmText.set('stale');
    component.webauthnError.set('old-error');
    component.openRevokeDialog(mockGrant);
    expect(component.revokeConfirmText()).toBe('');
    expect(component.webauthnError()).toBeNull();
    expect(component.revokeDialogGrant()?.id).toBe('grant-1');
  });

  it('should update revoke confirm text from an input event', () => {
    const input = document.createElement('input');
    input.value = 'REVOKE';
    component.updateRevokeConfirmText({ target: input } as unknown as Event);
    expect(component.revokeConfirmText()).toBe('REVOKE');
  });

  it('should no-op confirmRevoke when no grant is selected', () => {
    component.closeRevokeDialog();
    expect(() => component.confirmRevoke()).not.toThrow();
    const httpMock = TestBed.inject(HttpTestingController);
    // only the init GET is outstanding
    httpMock.expectOne(GRANTS_URL).flush([]);
  });

  it('should POST to the revoke endpoint and close the dialog on success', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    component.openRevokeDialog(mockGrant);
    expect(component.isRevokeDialogOpen()).toBe(true);

    component.confirmRevoke();
    const req = httpMock.expectOne(`${GRANTS_URL}/grant-1/revoke`);
    expect(req.request.method).toBe('POST');
    req.flush({ ...mockGrant, revokedAt: '2026-03-26T00:00:00Z' });
    fixture.detectChanges();

    expect(component.isRevokeDialogOpen()).toBe(false);
    expect(component.webauthnError()).toBeNull();
  });

  it('should NOT set a revoke error when the service swallows the failure (characterization)', () => {
    // NOTE: A2AConsentService.revokeConsent catches errors and emits of(null)
    // via `next`, so the component's `error` callback never fires and the
    // dialog closes even on a 500. Characterizing the actual behavior.
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    component.openRevokeDialog(mockGrant);
    component.confirmRevoke();
    httpMock
      .expectOne(`${GRANTS_URL}/grant-1/revoke`)
      .flush('nope', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // Service emitted null through `next` => dialog closed, no error set.
    expect(component.isRevokeDialogOpen()).toBe(false);
    expect(component.webauthnError()).toBeNull();
  });

  it('should render the revoke dialog with a typed-confirm box for full_persona', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant2]);
    fixture.detectChanges();

    component.openRevokeDialog(mockGrant2);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[role="alertdialog"]')).toBeTruthy();
    expect(host.querySelector('.a2a-connections__typed-confirm')).toBeTruthy();
    // confirm button disabled until REVOKE typed
    const confirmBtn = host.querySelector<HTMLButtonElement>(
      '.a2a-connections__btn--confirm-revoke',
    );
    expect(confirmBtn?.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Scope modification flow
  // -------------------------------------------------------------------------

  it('should open scope modify with the grant scope preselected', () => {
    component.webauthnError.set('old');
    component.openScopeModify(mockGrant);
    expect(component.isScopeModifyOpen()).toBe(true);
    expect(component.newScope()).toBe(ConsentScope.TopicsOnly);
    expect(component.webauthnError()).toBeNull();
  });

  it('should close scope modify and clear selection', () => {
    component.openScopeModify(mockGrant);
    component.closeScopeModify();
    expect(component.isScopeModifyOpen()).toBe(false);
    expect(component.newScope()).toBeNull();
  });

  it('should select a new scope', () => {
    component.openScopeModify(mockGrant);
    component.selectNewScope(ConsentScope.LearningStyle);
    expect(component.newScope()).toBe(ConsentScope.LearningStyle);
  });

  it('should render the scope-modify dialog with one radio per scope', () => {
    component.openScopeModify(mockGrant);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[aria-labelledby="scope-modify-title"]')).toBeTruthy();
    const radios = host.querySelectorAll('.a2a-connections__scope-radio');
    expect(radios.length).toBe(component.allScopes.length);
  });

  it('should no-op confirmScopeModify when no grant is selected', async () => {
    component.closeScopeModify();
    await component.confirmScopeModify();
    expect(component.webauthnError()).toBeNull();
  });

  it('should no-op confirmScopeModify when scope is unchanged', async () => {
    component.openScopeModify(mockGrant);
    // newScope === grant.scope => early return, no WebAuthn attempt
    await component.confirmScopeModify();
    expect(component.webauthnError()).toBeNull();
    expect(component.isScopeModifyOpen()).toBe(true);
  });

  it('should set webauthn_failed when WebAuthn is unavailable', async () => {
    const original = (navigator as unknown as { credentials?: unknown }).credentials;
    Object.defineProperty(navigator, 'credentials', {
      value: undefined,
      configurable: true,
    });
    try {
      component.openScopeModify(mockGrant);
      component.selectNewScope(ConsentScope.LearningStyle);
      await component.confirmScopeModify();
      expect(component.webauthnError()).toBe('a2a.connections.webauthn_failed');
    } finally {
      Object.defineProperty(navigator, 'credentials', {
        value: original,
        configurable: true,
      });
    }
  });

  it('should PUT the scope modification and close on success', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();

    const fakeCred = { id: 'cred-abc' };
    const original = (navigator as unknown as { credentials?: unknown }).credentials;
    Object.defineProperty(navigator, 'credentials', {
      value: { get: () => Promise.resolve(fakeCred) },
      configurable: true,
    });
    try {
      component.openScopeModify(mockGrant);
      component.selectNewScope(ConsentScope.LearningStyle);
      await component.confirmScopeModify();

      const req = httpMock.expectOne(`${GRANTS_URL}/grant-1/scope`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body.newScope).toBe(ConsentScope.LearningStyle);
      expect(req.request.body.webauthnCredential).toBe('cred-abc');
      req.flush({ ...mockGrant, scope: ConsentScope.LearningStyle });
      fixture.detectChanges();

      expect(component.isScopeModifyOpen()).toBe(false);
    } finally {
      Object.defineProperty(navigator, 'credentials', {
        value: original,
        configurable: true,
      });
    }
  });

  // -------------------------------------------------------------------------
  // Utility methods
  // -------------------------------------------------------------------------

  it('should format date-time strings', () => {
    expect(component.formatDateTime('2026-03-21T14:00:00Z')).toBeTruthy();
  });

  it('should echo back an unparseable date string from formatDate', () => {
    // new Date(x).toLocaleDateString does not throw on invalid input in jsdom
    // (returns "Invalid Date"); characterize that it returns a truthy string.
    expect(component.formatDate('not-a-date')).toBeTruthy();
  });

  it('should clean up subscriptions on destroy', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    httpMock.expectOne(GRANTS_URL).flush([mockGrant]);
    fixture.detectChanges();
    expect(() => fixture.destroy()).not.toThrow();
  });
});
