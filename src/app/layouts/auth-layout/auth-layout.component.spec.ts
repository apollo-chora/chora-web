import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthLayoutComponent } from './auth-layout.component';

describe('AuthLayoutComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthLayoutComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(AuthLayoutComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Chora logo link', async () => {
    const fixture = TestBed.createComponent(AuthLayoutComponent);
    await fixture.whenStable();
    const logo = (fixture.nativeElement as HTMLElement).querySelector('.auth-layout__logo');
    expect(logo?.textContent?.trim()).toBe('Chora');
  });

  it('should have main content with correct aria role', async () => {
    const fixture = TestBed.createComponent(AuthLayoutComponent);
    await fixture.whenStable();
    const main = (fixture.nativeElement as HTMLElement).querySelector('main');
    expect(main?.getAttribute('role')).toBe('main');
    expect(main?.getAttribute('aria-label')).toBe('Authentication');
  });
});
