import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PublicLayoutComponent } from './public-layout.component';
import { AuthService } from '../../core/auth/auth.service';
import { LandingService } from '../../core/auth/landing.service';

/**
 * C2 slice 3 (ADR-240): the header's authenticated link is the landing
 * resolver's answer, not a hard-coded `/dashboard`, and it is labelled for
 * where it actually goes.
 */
const RESOLVED_LANDING = '/resolved-landing';
const landingStub = { landingRoute: () => RESOLVED_LANDING };

describe('PublicLayoutComponent', () => {
  let fixture: ComponentFixture<PublicLayoutComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PublicLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: LandingService, useValue: landingStub },
      ],
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(PublicLayoutComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Chora logo', () => {
    const logo = fixture.nativeElement.querySelector('.public-layout__logo');
    expect(logo.textContent.trim()).toBe('Chora');
  });

  it('should show Login and Sign Up for guests', () => {
    const links = fixture.nativeElement.querySelectorAll('.public-layout__link');
    const texts = Array.from(links).map((l: unknown) => (l as HTMLElement).textContent?.trim());
    expect(texts).toContain('Log In');
    expect(texts).toContain('Sign Up');
  });

  it('should show the Home link for authenticated users', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'User', email: 'user@example.com' },
      'token',
    );
    fixture.detectChanges();

    const links = fixture.nativeElement.querySelectorAll('.public-layout__link');
    const texts = Array.from(links).map((l: unknown) => (l as HTMLElement).textContent?.trim());
    expect(texts).toContain('Home');
    expect(texts).not.toContain('Log In');
  });

  it('points that link at the landing resolver, not at a hard-coded route', () => {
    authService.setUser(
      { gcid: 'g1', tenantId: 't1', roles: [], capabilities: [], displayName: 'User', email: 'user@example.com' },
      'token',
    );
    fixture.detectChanges();

    const link = Array.from(
      fixture.nativeElement.querySelectorAll('.public-layout__link'),
    ).find((l: unknown) => (l as HTMLElement).textContent?.trim() === 'Home');
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe(RESOLVED_LANDING);
  });

  it('should have correct ARIA roles', () => {
    expect(fixture.nativeElement.querySelector('[role="banner"]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[role="main"]')).toBeTruthy();
  });
});
