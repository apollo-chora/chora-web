import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { A2AActivationComponent } from './a2a-activation.component';
import { A2AService } from '../../services/a2a.service';
import { A2APartner, PartnerStatus, A2ASkill } from '../../models/a2a.model';

describe('A2AActivationComponent', () => {
  let component: A2AActivationComponent;
  let fixture: ComponentFixture<A2AActivationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [A2AActivationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(A2AActivationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="a2a-activation"]');
    expect(el).toBeTruthy();
  });

  it('should default to disabled state', () => {
    expect(component.isEnabled()).toBe(false);
  });

  it('should default to all_verified allow-list mode', () => {
    expect(component.allowListMode()).toBe('all_verified');
  });

  it('should toggle add-on state', () => {
    component.toggleAddOn();
    expect(component.isEnabled()).toBe(true);
  });

  it('should toggle partner selection', () => {
    component.togglePartnerSelection('test-id');
    expect(component.isPartnerSelected('test-id')).toBe(true);
    component.togglePartnerSelection('test-id');
    expect(component.isPartnerSelected('test-id')).toBe(false);
  });

  it('should return correct status badge class', () => {
    expect(component.statusBadgeClass('verified' as never)).toBe('a2a-activation__badge--verified');
  });

  it('should have no critical accessibility violations', async () => {
    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement);
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Branch-coverage augmentation — drives the currently-uncovered conditional
// arms with a dedicated HttpTestingController so every BFF request is asserted
// and verified. BffClientService prepends environment.bffBaseUrl
// (https://api.chora.site), so URLs below are absolute.
// ---------------------------------------------------------------------------

const BASE = 'https://api.chora.site';

function makePartner(overrides: Partial<A2APartner> = {}): A2APartner {
  return {
    id: 'p-1',
    orgName: 'Acme Org',
    orgDomain: 'acme.example',
    contactEmail: 'admin@acme.example',
    status: PartnerStatus.Verified,
    allowedSkills: [A2ASkill.StudyConversation],
    maxAgents: 5,
    rateLimitPerHour: 100,
    dnsChallenge: null,
    verifiedAt: '2026-01-01T00:00:00Z',
    suspendedAt: null,
    suspensionReason: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('A2AActivationComponent (branch coverage)', () => {
  let fixture: ComponentFixture<A2AActivationComponent>;
  let component: A2AActivationComponent;
  let httpMock: HttpTestingController;
  let service: A2AService;

  /**
   * ngOnInit fires two GETs: the partner list (via A2AService) and the add-on
   * config (via BffClientService). This helper flushes both so verify() stays
   * clean. `configBody = null` exercises the implicit-empty-else of
   * `if (cfg)` in ngOnInit.
   */
  function flushInit(configBody: Record<string, unknown> | null = null): void {
    const partnersReq = httpMock.expectOne(`${BASE}/api/v1/a2a/partners`);
    expect(partnersReq.request.method).toBe('GET');
    partnersReq.flush([]);

    const configReq = httpMock.expectOne(`${BASE}/api/v1/a2a/config`);
    expect(configReq.request.method).toBe('GET');
    configReq.flush(configBody);
  }

  /** Captures the most recent PUT /api/v1/a2a/config (saveConfig). */
  function expectSavePut(): TestRequest {
    return httpMock.expectOne((r) => r.method === 'PUT' && r.url === `${BASE}/api/v1/a2a/config`);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [A2AActivationComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(A2AService);
    fixture = TestBed.createComponent(A2AActivationComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpMock.verify();
  });

  // ngOnInit — `if (cfg)` true / false (implicit empty else)
  describe('ngOnInit config load', () => {
    it('sets config when the GET returns a non-null body (truthy arm)', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['p-1'],
      });

      expect(component.isEnabled()).toBe(true);
      expect(component.allowListMode()).toBe('select_specific');
      expect(component.selectedPartnerIds()).toEqual(['p-1']);
    });

    it('keeps default config when the GET returns null (falsy arm — empty else)', () => {
      fixture.detectChanges();
      flushInit(null);

      expect(component.isEnabled()).toBe(false);
      expect(component.allowListMode()).toBe('all_verified');
      expect(component.selectedPartnerIds()).toEqual([]);
    });
  });

  // verifiedPartners computed — filter predicate truthy + falsy, empty + non-empty
  describe('verifiedPartners computed', () => {
    it('is empty when the service has no partners (empty array case)', () => {
      fixture.detectChanges();
      flushInit();
      expect(component.verifiedPartners()).toEqual([]);
    });

    it('keeps only Verified partners and drops non-Verified ones', () => {
      fixture.detectChanges();
      flushInit();

      service.partnersState.set({
        status: 'success',
        data: [
          makePartner({ id: 'v-1', status: PartnerStatus.Verified }),
          makePartner({ id: 'p-2', status: PartnerStatus.Pending }),
          makePartner({ id: 's-3', status: PartnerStatus.Suspended }),
        ],
      });

      expect(component.verifiedPartners().map((p) => p.id)).toEqual(['v-1']);
    });
  });

  // toggleAddOn — both toggle arms + saveConfig next/error arms
  describe('toggleAddOn save paths', () => {
    it('enables when disabled and clears isSaving on PUT success (next arm)', () => {
      fixture.detectChanges();
      flushInit();

      component.toggleAddOn();
      expect(component.isEnabled()).toBe(true);
      expect(component.isSaving()).toBe(true);

      const put = expectSavePut();
      expect(put.request.body.enabled).toBe(true);
      put.flush({ enabled: true, allowListMode: 'all_verified', selectedPartnerIds: [] });

      expect(component.isSaving()).toBe(false);
    });

    it('disables when enabled (the other toggle arm)', () => {
      fixture.detectChanges();
      flushInit({ enabled: true, allowListMode: 'all_verified', selectedPartnerIds: [] });

      component.toggleAddOn();
      expect(component.isEnabled()).toBe(false);

      const put = expectSavePut();
      expect(put.request.body.enabled).toBe(false);
      put.flush({});
      expect(component.isSaving()).toBe(false);
    });

    it('clears isSaving when the PUT errors (saveConfig error arm)', () => {
      fixture.detectChanges();
      flushInit();

      component.toggleAddOn();
      expect(component.isSaving()).toBe(true);

      expectSavePut().flush('boom', { status: 500, statusText: 'Server Error' });

      expect(component.isSaving()).toBe(false);
    });
  });

  // setAllowListMode — ternary both arms
  describe('setAllowListMode', () => {
    it('clears selectedPartnerIds when switching to all_verified (ternary truthy arm)', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['x', 'y'],
      });
      expect(component.selectedPartnerIds()).toEqual(['x', 'y']);

      component.setAllowListMode('all_verified');
      expect(component.allowListMode()).toBe('all_verified');
      expect(component.selectedPartnerIds()).toEqual([]);

      expectSavePut().flush({});
      expect(component.isSaving()).toBe(false);
    });

    it('keeps selectedPartnerIds when switching to select_specific (ternary falsy arm)', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'all_verified',
        selectedPartnerIds: ['keep-me'],
      });

      component.setAllowListMode('select_specific');
      expect(component.allowListMode()).toBe('select_specific');
      expect(component.selectedPartnerIds()).toEqual(['keep-me']);

      expectSavePut().flush({});
      expect(component.isSaving()).toBe(false);
    });
  });

  // togglePartnerSelection — includes() ternary both arms (does NOT save)
  describe('togglePartnerSelection', () => {
    it('adds a partner id when not already selected (spread arm)', () => {
      fixture.detectChanges();
      flushInit();

      component.togglePartnerSelection('p-1');
      expect(component.selectedPartnerIds()).toEqual(['p-1']);
      expect(component.isPartnerSelected('p-1')).toBe(true);
    });

    it('removes a partner id when already selected (filter arm)', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['p-1', 'p-2'],
      });

      component.togglePartnerSelection('p-1');
      expect(component.selectedPartnerIds()).toEqual(['p-2']);
      expect(component.isPartnerSelected('p-1')).toBe(false);
    });
  });

  // isPartnerSelected — both boolean outcomes
  describe('isPartnerSelected', () => {
    it('returns true for a selected id and false otherwise', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['sel-1'],
      });

      expect(component.isPartnerSelected('sel-1')).toBe(true);
      expect(component.isPartnerSelected('missing')).toBe(false);
    });
  });

  // savePartnerSelection — success + error
  describe('savePartnerSelection', () => {
    it('persists the current config via PUT', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['p-1'],
      });

      component.savePartnerSelection();
      expect(component.isSaving()).toBe(true);

      const put = expectSavePut();
      expect(put.request.body.selectedPartnerIds).toEqual(['p-1']);
      put.flush({});
      expect(component.isSaving()).toBe(false);
    });

    it('clears isSaving on PUT transport error (error arm)', () => {
      fixture.detectChanges();
      flushInit();

      component.savePartnerSelection();
      expectSavePut().error(new ProgressEvent('error'), {
        status: 503,
        statusText: 'Unavailable',
      });

      expect(component.isSaving()).toBe(false);
    });
  });

  // statusBadgeClass — interpolation per status
  describe('statusBadgeClass', () => {
    it('builds the BEM modifier from the partner status', () => {
      fixture.detectChanges();
      flushInit();

      expect(component.statusBadgeClass(PartnerStatus.Suspended)).toBe(
        'a2a-activation__badge--suspended',
      );
      expect(component.statusBadgeClass(PartnerStatus.Expired)).toBe(
        'a2a-activation__badge--expired',
      );
    });
  });

  // ngOnDestroy — unsubscribe path
  describe('ngOnDestroy', () => {
    it('tears down subscriptions without throwing', () => {
      fixture.detectChanges();
      flushInit();
      expect(() => fixture.destroy()).not.toThrow();
    });
  });

  // Template rendering — @if / @for arms in the partner picker
  describe('template rendering', () => {
    it('renders the no-verified-partners notice when select_specific with empty list', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: [],
      });
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.a2a-activation__no-partners')).toBeTruthy();
      expect(el.querySelector('.a2a-activation__partner-list')).toBeNull();
    });

    it('renders the partner list + save button when verified partners exist', () => {
      fixture.detectChanges();
      flushInit({
        enabled: true,
        allowListMode: 'select_specific',
        selectedPartnerIds: ['v-1'],
      });
      service.partnersState.set({
        status: 'success',
        data: [makePartner({ id: 'v-1', status: PartnerStatus.Verified })],
      });
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.a2a-activation__partner-list')).toBeTruthy();
      expect(el.querySelector('.a2a-activation__save-btn')).toBeTruthy();
      expect(el.querySelector('.a2a-activation__no-partners')).toBeNull();
    });

    it('hides the allow-list region entirely when the add-on is disabled', () => {
      fixture.detectChanges();
      flushInit(null);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.a2a-activation__allow-list')).toBeNull();
    });
  });
});
