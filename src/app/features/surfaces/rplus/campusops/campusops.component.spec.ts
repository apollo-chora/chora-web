import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampusopsComponent } from './campusops.component';
import { TenantContextService } from '../../../../core/auth/tenant-context.service';
import { environment } from '../../../../../environments/environment';

interface BackendCampusStub {
  id: string;
  tenant_id: string;
  name: string;
  address_l1?: string;
  address_l2?: string;
  city?: string;
  country: string;
  created_at: string;
  updated_at: string;
}

const STUB_CAMPUSES: readonly BackendCampusStub[] = [
  {
    id: 'campus-bras-basah',
    tenant_id: 'tenant-001',
    name: 'MTM SG — Bras Basah',
    address_l1: '123 Bras Basah Rd',
    city: 'Singapore',
    country: 'SG',
    created_at: '2026-05-26T01:00:00Z',
    updated_at: '2026-05-26T01:00:00Z',
  },
  {
    id: 'campus-bishan-block',
    tenant_id: 'tenant-001',
    name: 'MTM SG — Bishan',
    address_l1: '456 Bishan Ave',
    city: 'Singapore',
    country: 'SG',
    created_at: '2026-05-26T02:00:00Z',
    updated_at: '2026-05-26T02:00:00Z',
  },
];

function setup(): {
  fixture: ComponentFixture<CampusopsComponent>;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [CampusopsComponent],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
  });
  const tenants = TestBed.inject(TenantContextService);
  tenants.setCurrentTenant({
    id: 'tenant-001',
    name: 'MTM Singapore',
    slug: 'mtm',
    logoUrl: null,
  });
  const fixture = TestBed.createComponent(CampusopsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`).flush({ items: STUB_CAMPUSES });
  fixture.detectChanges();
  return { fixture, httpMock };
}

describe('CampusopsComponent', () => {
  let fixture: ComponentFixture<CampusopsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup();
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('surface root', () => {
    it('renders the surface-rplus accent on the root', () => {
      const root = element.querySelector('[data-testid="rplus-campusops"]');
      expect(root?.className).toContain('surface-rplus');
    });

    it('uses a semantic <section> root', () => {
      const root = element.querySelector('[data-testid="rplus-campusops"]');
      expect(root?.tagName).toBe('SECTION');
    });
  });

  describe('header', () => {
    it('shows the current tenant name from TenantContextService', () => {
      const tenant = element.querySelector('[data-testid="campusops-tenant"]');
      expect(tenant?.textContent).toContain('MTM Singapore');
    });

    it('shows total campus count from the BFF response', () => {
      const count = element.querySelector('[data-testid="campusops-total"]');
      expect(count?.textContent).toContain('2');
    });

    it('renders a Create Campus CTA', () => {
      const cta = element.querySelector('[data-testid="campusops-create-cta"]');
      expect(cta).not.toBeNull();
      expect(cta?.tagName).toBe('BUTTON');
    });
  });

  describe('campus grid', () => {
    it('renders one card per campus (2 total)', () => {
      const cards = element.querySelectorAll('[data-testid^="campusops-card-"]');
      expect(cards.length).toBe(2);
    });

    it('renders Bras Basah card with name + country badge', () => {
      const card = element.querySelector('[data-testid="campusops-card-campus-bras-basah"]');
      expect(card?.textContent).toContain('Bras Basah');
      const flag = card?.querySelector('[data-testid="campusops-country-campus-bras-basah"]');
      expect(flag?.textContent).toContain('SG');
    });

    // CHO-2294: the Rooms CTA used to be a <button> with NO handler, so this
    // test passed while the affordance was inert. It now must actually go
    // somewhere; asserting mere existence would have kept passing forever.
    it('routes the per-card Rooms CTA to the rooms screen', () => {
      const rooms = element.querySelector('[data-testid="campusops-rooms-campus-bras-basah"]');
      expect(rooms).not.toBeNull();
      expect(rooms?.tagName.toLowerCase()).toBe('a');
      expect(rooms?.getAttribute('href')).toBe('/r/campusops/rooms');
    });

    // CHO-2294 follow-up, found by sighting the live UI: the per-card Rooms CTA
    // is the ONLY way into the rooms screen, so a tenant with zero campuses
    // cannot reach it at all. Rooms are TENANT-scoped, so the entry point
    // belongs in the header, not only on a campus card.
    it('exposes a header-level Rooms entry that does not depend on any campus', () => {
      const link = element.querySelector('[data-testid="campusops-rooms-all"]');
      expect(link).not.toBeNull();
      expect(link?.tagName.toLowerCase()).toBe('a');
      expect(link?.getAttribute('href')).toBe('/r/campusops/rooms');
    });

    it('exposes the per-card Incidents CTA', () => {
      const incidents = element.querySelector(
        '[data-testid="campusops-incidents-campus-bras-basah"]',
      );
      expect(incidents).not.toBeNull();
    });
  });

  describe('empty state', () => {
    it('renders the empty-state message when no campuses', () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [CampusopsComponent],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      const tenants = TestBed.inject(TenantContextService);
      tenants.setCurrentTenant({
        id: 'tenant-empty',
        name: 'Empty Tenant',
        slug: 'empty',
        logoUrl: null,
      });
      const emptyFixture = TestBed.createComponent(CampusopsComponent);
      const emptyHttpMock = TestBed.inject(HttpTestingController);
      emptyFixture.detectChanges();
      emptyHttpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`).flush({ items: [] });
      emptyFixture.detectChanges();

      const empty = (emptyFixture.nativeElement as HTMLElement).querySelector(
        '[data-testid="campusops-empty"]',
      );
      expect(empty).not.toBeNull();
      emptyHttpMock.verify();
    });
  });

  describe('a11y', () => {
    it('renders cards with a heading per card', () => {
      const cards = element.querySelectorAll('[data-testid^="campusops-card-"]');
      cards.forEach((card) => {
        const heading = card.querySelector('h2, h3');
        expect(heading).not.toBeNull();
      });
    });

    it('has zero critical/serious WCAG violations', async () => {
      const axe = (await import('axe-core')).default;
      const results = await axe.run(fixture.nativeElement);
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
    });
  });
});

describe('CampusopsComponent — create flow', () => {
  let fixture: ComponentFixture<CampusopsComponent>;
  let httpMock: HttpTestingController;
  let element: HTMLElement;
  let component: CampusopsComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    const built = setup(); // initial GET flushed with STUB_CAMPUSES
    fixture = built.fixture;
    httpMock = built.httpMock;
    element = fixture.nativeElement as HTMLElement;
    component = fixture.componentInstance;
  });

  afterEach(() => httpMock.verify());

  it('opens the create form only after the Add Campus CTA is clicked', () => {
    expect(element.querySelector('[data-testid="campusops-create-form"]')).toBeNull();
    (element.querySelector('[data-testid="campusops-create-cta"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="campusops-create-form"]')).not.toBeNull();
  });

  it('keeps submit disabled until name + a valid 2-letter country are present', () => {
    component.onCreateClicked();
    fixture.detectChanges();
    const submit = element.querySelector(
      '[data-testid="campusops-create-submit"]',
    ) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    component.formName.set('MTM SG — Jurong');
    fixture.detectChanges();
    expect(submit.disabled).toBe(true); // country still missing

    component.formCountry.set('S'); // 1 char — invalid ISO alpha-2
    fixture.detectChanges();
    expect(submit.disabled).toBe(true);

    component.formCountry.set('SG');
    fixture.detectChanges();
    expect(submit.disabled).toBe(false);
  });

  it('POSTs the create request, refetches the list, and closes the form on success', () => {
    component.onCreateClicked();
    component.formName.set('MTM SG — Jurong');
    component.formCountry.set('sg'); // lower-case → uppercased on the wire
    component.formCity.set('Singapore');
    component.formAddressLine1.set('789 Jurong West St');
    fixture.detectChanges();

    component.onCreateSubmit();

    const post = httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      name: 'MTM SG — Jurong',
      address_l1: '789 Jurong West St',
      address_l2: '',
      city: 'Singapore',
      country: 'SG',
    });
    post.flush(
      {
        id: 'campus-jurong-003',
        tenant_id: 'tenant-001',
        name: 'MTM SG — Jurong',
        address_l1: '789 Jurong West St',
        address_l2: '',
        city: 'Singapore',
        country: 'SG',
        created_at: '2026-06-02T00:00:00Z',
        updated_at: '2026-06-02T00:00:00Z',
      },
      { status: 201, statusText: 'Created' },
    );

    // success → reloadKey bump → real refetch. The reloadKey signal feeds a
    // toObservable→switchMap GET, which only fires on the next change-detection
    // cycle, so flush the CD tick before expecting the refetch (matches the
    // initial-load pattern in the setup helper).
    fixture.detectChanges();
    httpMock.expectOne(`${environment.bffBaseUrl}/v1/campus`).flush({ items: STUB_CAMPUSES });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="campusops-create-form"]')).toBeNull();
  });

  it('surfaces a loud error and keeps the form open when the create POST fails', () => {
    component.onCreateClicked();
    component.formName.set('Bad Campus');
    component.formCountry.set('ZZ');
    fixture.detectChanges();

    component.onCreateSubmit();

    httpMock
      .expectOne(`${environment.bffBaseUrl}/v1/campus`)
      .flush(
        { error: 'country must be ISO 3166-1 alpha-2 (e.g., SG)' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    const err = element.querySelector('[data-testid="campusops-create-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('400');
    // No refetch fired (verify() in afterEach asserts no stray GET) and the
    // form stays open so the user can correct + retry.
    expect(element.querySelector('[data-testid="campusops-create-form"]')).not.toBeNull();
  });
});
