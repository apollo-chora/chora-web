import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { ContributorProfileComponent } from './contributor-profile.component';
import { CommunityService } from '../../services/community.service';
import { environment } from '../../../../../environments/environment';
import type { ContributorProfile } from '../../models/community.model';

const CONTRIBUTORS_URL = `${environment.bffBaseUrl}/api/v1/community/contributors`;

function makeProfile(overrides: Partial<ContributorProfile> = {}): ContributorProfile {
  return {
    id: 'profile-1',
    tenant_id: 'tenant-001',
    gcid: 'gcid-abc',
    display_name: 'Ada Lovelace',
    reputation_score: 1280,
    atoms_submitted: 20,
    atoms_approved: 15,
    reviews_completed: 8,
    level: 'curator',
    created_at: '2026-03-15T10:00:00Z',
    updated_at: '2026-03-15T10:00:00Z',
    ...overrides,
  };
}

describe('ContributorProfileComponent', () => {
  let component: ContributorProfileComponent;
  let fixture: ComponentFixture<ContributorProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContributorProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ContributorProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="contributor-profile"]');
    expect(el).toBeTruthy();
  });

  it('should compute approvalRate as 0 when no profile', () => {
    expect(component.approvalRate()).toBe(0);
  });

  it('should compute levelClass as empty string when no profile', () => {
    expect(component.levelClass()).toBe('');
  });

  it('should format date correctly', () => {
    const result = component.formatDate('2026-03-15T10:00:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('');
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
// Augmented coverage — uncovered conditional arms
//   * approvalRate(): profile present + atoms_submitted === 0 arm, and the
//     full-calculation arm (both guards false).
//   * levelClass(): profile present arm (returns the level CSS class).
//   * ngOnInit(): gcid present arm (?? '' through, if(gcid) true → HTTP load).
//   * formatDate(): characterizes the try-success path for a malformed string
//     (the catch is a dead defensive guard — see prodBugFlag note).
// ---------------------------------------------------------------------------

describe('ContributorProfileComponent — success state (HTTP-driven)', () => {
  let fixture: ComponentFixture<ContributorProfileComponent>;
  let component: ContributorProfileComponent;
  let service: CommunityService;
  let httpMock: HttpTestingController;
  let element: HTMLElement;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContributorProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(ContributorProfileComponent);
    component = fixture.componentInstance;
    service = TestBed.inject(CommunityService);
    httpMock = TestBed.inject(HttpTestingController);
    element = fixture.nativeElement as HTMLElement;
    // ngOnInit with default router has no :gcid param → no HTTP issued.
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  function loadProfile(profile: ContributorProfile): void {
    service.loadContributorProfile(profile.gcid).subscribe();
    const req = httpMock.expectOne(`${CONTRIBUTORS_URL}/${profile.gcid}`);
    req.flush(profile);
    fixture.detectChanges();
  }

  it('computes approvalRate via the full calculation when a profile is present', () => {
    // both guards false: profile present AND atoms_submitted > 0.
    loadProfile(makeProfile({ atoms_submitted: 20, atoms_approved: 15 }));
    // round(15 / 20 * 100) = 75
    expect(component.approvalRate()).toBe(75);
  });

  it('rounds the approvalRate to the nearest integer', () => {
    loadProfile(makeProfile({ atoms_submitted: 3, atoms_approved: 1 }));
    // round(1 / 3 * 100) = round(33.33...) = 33
    expect(component.approvalRate()).toBe(33);
  });

  it('computes approvalRate as 0 when a profile is present but no atoms submitted', () => {
    // guard `p.atoms_submitted === 0` true arm (profile present, !p false).
    loadProfile(makeProfile({ atoms_submitted: 0, atoms_approved: 0 }));
    expect(component.approvalRate()).toBe(0);
  });

  it('computes levelClass from the profile level when a profile is present', () => {
    // `!p` false arm → returns the level-specific class.
    loadProfile(makeProfile({ level: 'curator' }));
    expect(component.levelClass()).toBe('contributor-profile__level--curator');
  });

  it('reflects a different level in levelClass', () => {
    loadProfile(makeProfile({ level: 'expert' }));
    expect(component.levelClass()).toBe('contributor-profile__level--expert');
  });

  it('renders the profile content block when the load succeeds', () => {
    loadProfile(makeProfile({ display_name: 'Ada Lovelace' }));
    const header = element.querySelector('[data-testid="profile-header"]');
    const name = element.querySelector('[data-testid="profile-name"]');
    expect(header).not.toBeNull();
    expect(name?.textContent?.trim()).toBe('Ada Lovelace');
  });

  it('renders the computed approval rate in the stats grid', () => {
    loadProfile(makeProfile({ atoms_submitted: 20, atoms_approved: 15 }));
    const card = element.querySelector('[data-testid="stat-approval-rate"]');
    expect(card?.textContent).toContain('75');
  });

  it('renders the error block when the load fails', () => {
    service.loadContributorProfile('gcid-err').subscribe();
    const req = httpMock.expectOne(`${CONTRIBUTORS_URL}/gcid-err`);
    req.flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="profile-error"]')).not.toBeNull();
    // success/profile() arm is false → no profile content rendered.
    expect(element.querySelector('[data-testid="profile-header"]')).toBeNull();
  });
});

describe('ContributorProfileComponent — ngOnInit route param arms', () => {
  function configure(gcidParam: string | null): {
    fixture: ComponentFixture<ContributorProfileComponent>;
    httpMock: HttpTestingController;
  } {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContributorProfileComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'gcid' ? gcidParam : null),
              },
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ContributorProfileComponent);
    const httpMock = TestBed.inject(HttpTestingController);
    return { fixture, httpMock };
  }

  it('issues the profile GET when a :gcid route param is present', () => {
    const { fixture, httpMock } = configure('gcid-route-123');
    fixture.detectChanges(); // triggers ngOnInit → if (gcid) true arm

    const req = httpMock.expectOne(`${CONTRIBUTORS_URL}/gcid-route-123`);
    expect(req.request.method).toBe('GET');
    req.flush(makeProfile({ gcid: 'gcid-route-123' }));

    fixture.componentInstance.ngOnDestroy();
    httpMock.verify();
  });

  it("issues no request when the :gcid param resolves to null (?? '' false arm)", () => {
    const { fixture, httpMock } = configure(null);
    fixture.detectChanges(); // gcid '' → if (gcid) false arm

    httpMock.expectNone(() => true);
    fixture.componentInstance.ngOnDestroy();
    httpMock.verify();
  });
});

describe('ContributorProfileComponent — formatDate try-success characterization', () => {
  let fixture: ComponentFixture<ContributorProfileComponent>;
  let component: ContributorProfileComponent;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContributorProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(ContributorProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('returns "Invalid Date" for a malformed string (try succeeds; catch is dead)', () => {
    // new Date('not-a-date').toLocaleDateString() returns 'Invalid Date'
    // WITHOUT throwing, so the catch arm is unreachable via the typed string API.
    // We characterize the actual try-path output rather than the dead catch.
    expect(component.formatDate('not-a-date')).toBe('Invalid Date');
  });
});
