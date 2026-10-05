import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';

import { AplusLoginComponent } from './aplus-login.component';
import { AuthService } from '../../../../core/auth/auth.service';
import { WebAuthnService } from '../../../../core/auth/webauthn.service';
import { PasswordAuthService } from '../../../../core/auth/password-auth.service';
import { ReturnUrlService } from '../../../../core/services/return-url.service';
import { TranslateService } from '../../../../core/services/translate.service';
import { AuthTokenResponse } from '../../../../core/auth/auth.models';
import { ApiError } from '../../../../core/interceptors/api-error.model';
import { errorInterceptor } from '../../../../core/interceptors/error.interceptor';
import { LandingService } from '../../../../core/auth/landing.service';
import { environment } from '../../../../../environments/environment';
/**
 * C2 slice 3 (ADR-240): this screen no longer decides where an authenticated
 * session lands. It asks `LandingService`, the ONE landing resolver, and uses
 * whatever comes back. The stub returns a sentinel no hard-coded fallback
 * could ever produce, so this asserts DELEGATION rather than re-testing the
 * resolver's rules (those live in `core/auth/landing.service.spec.ts`).
 */
const RESOLVED_LANDING = '/resolved-landing';
const landingStub = { landingRoute: () => RESOLVED_LANDING };


/**
 * A+ login screen spec — Phyllis demo Step 1.
 *
 * Canonical Vitest+Angular pattern: no `fakeAsync` / `tick` (ProxyZone gap).
 * Microtasks resolve naturally after `.subscribe()` on synchronous `of(...)`
 * observables, which is sufficient here because the login flow does not rely
 * on `setTimeout` / `setInterval`.
 */
describe('AplusLoginComponent', () => {
  let component: AplusLoginComponent;
  let fixture: ComponentFixture<AplusLoginComponent>;
  let authService: AuthService;
  let webAuthnService: WebAuthnService;
  let returnUrlService: ReturnUrlService;
  let router: Router;

  const mockTokenResponse: AuthTokenResponse = {
    access_token: 'jwt-token',
    token_type: 'Bearer',
    expires_in: 3600,
    gcid: 'gcid-1',
  };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AplusLoginComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        WebAuthnService,
        PasswordAuthService,
        ReturnUrlService,
        TranslateService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AplusLoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    webAuthnService = TestBed.inject(WebAuthnService);
    returnUrlService = TestBed.inject(ReturnUrlService);
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should detect WebAuthn support on init', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    fixture.detectChanges();
    expect(component.webAuthnSupported()).toBe(true);
  });

  it('should hide passkey button when WebAuthn not available', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(false);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="aplus-login-passkey-btn"]')).toBeNull();
  });

  it('should show passkey button when WebAuthn available', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="aplus-login-passkey-btn"]')).not.toBeNull();
  });

  it('should toggle password visibility', () => {
    fixture.detectChanges();
    expect(component.passwordVisible()).toBe(false);
    component.togglePasswordVisibility();
    expect(component.passwordVisible()).toBe(true);
    component.togglePasswordVisibility();
    expect(component.passwordVisible()).toBe(false);
  });

  it('should call WebAuthnService.login with the username hint on passkey login', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(of(mockTokenResponse));
    vi.spyOn(authService, 'handleAuthResponse');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();
    component.username.set('admin');
    component.loginWithPasskey();

    expect(webAuthnService.login).toHaveBeenCalledWith('admin');
    expect(authService.handleAuthResponse).toHaveBeenCalledWith(mockTokenResponse);
  });

  it('should call WebAuthnService.login with undefined when username empty', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(of(mockTokenResponse));
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();
    component.loginWithPasskey();

    expect(webAuthnService.login).toHaveBeenCalledWith(undefined);
  });

  it('should navigate to returnUrl after passkey login', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(of(mockTokenResponse));
    vi.spyOn(authService, 'handleAuthResponse');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    returnUrlService.capture('/learning/atoms/42');

    fixture.detectChanges();
    component.loginWithPasskey();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/learning/atoms/42');
  });

  it('asks the landing resolver where to go when no returnUrl after passkey login', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(of(mockTokenResponse));
    vi.spyOn(authService, 'handleAuthResponse');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    fixture.detectChanges();
    component.loginWithPasskey();

    expect(router.navigateByUrl).toHaveBeenCalledWith(RESOLVED_LANDING);
  });

  it('should surface mapped error message on passkey failure', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(
      throwError(
        () =>
          new ApiError(401, {
            code: 'IAM_WEBAUTHN_CREDENTIAL_NOT_FOUND',
            message: 'No credential found',
            correlation_id: 'corr-1',
          }),
      ),
    );

    fixture.detectChanges();
    component.loginWithPasskey();

    expect(component.errorMessage()).toBe('No credential found');
    expect(component.isLoading()).toBe(false);
  });

  it('should surface generic key when passkey fails with non-ApiError', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(throwError(() => new Error('network')));

    fixture.detectChanges();
    component.loginWithPasskey();

    expect(component.errorMessage()).toBe('identity.login.error_passkey');
    expect(component.isLoading()).toBe(false);
  });

  it('should render the glass-panel + surface-aplus shell', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.surface-aplus')).not.toBeNull();
    expect(el.querySelector('.glass-panel.login-card')).not.toBeNull();
  });

  // Set-up-new-tenant CTA was removed: its destination /welcome/no-tenant
  // is JWT-gated (bootstrap requires a session JWT), so the link was
  // unactionable pre-login. Tenant creation reaches /welcome/no-tenant
  // automatically via authGuard when a signed-in user has zero
  // memberships — no parallel CTA needed on the login page.
  it('should NOT render the Set-up-new-tenant CTA (removed: pre-login bootstrap is impossible)', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="aplus-login-setup-tenant"]')).toBeNull();
  });

  it('should have an aria-label on the password visibility toggle', () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector('[data-testid="aplus-login-password-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-label')).toBeTruthy();
  });

  it('should have an aria-live error region when an error is present', () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    vi.spyOn(webAuthnService, 'login').mockReturnValue(throwError(() => new Error('x')));

    fixture.detectChanges();
    component.loginWithPasskey();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const alertNode = el.querySelector('[role="alert"]');
    expect(alertNode).not.toBeNull();
    expect(alertNode?.getAttribute('aria-live')).toBe('polite');
  });

  it('should have 0 axe critical/serious violations', async () => {
    vi.spyOn(webAuthnService, 'isSupported').mockReturnValue(true);
    fixture.detectChanges();

    const axe = (await import('axe-core')).default;
    const results = await axe.run(fixture.nativeElement as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });

    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });
});

/**
 * Username + password sign-in — the frozen gateway contract:
 * `POST /api/v1/auth/session/mint` with `{ username, password }` → the
 * Chora session envelope, fed straight to `AuthService.handleAuthResponse`.
 */
describe('AplusLoginComponent — username/password sign-in', () => {
  let component: AplusLoginComponent;
  let fixture: ComponentFixture<AplusLoginComponent>;
  let authService: AuthService;
  let passwordAuthService: PasswordAuthService;
  let returnUrlService: ReturnUrlService;
  let router: Router;
  let httpMock: HttpTestingController;

  const MINT_URL = `${environment.bffBaseUrl}/api/v1/auth/session/mint`;

  const mockTokenResponse: AuthTokenResponse = {
    access_token: 'jwt-token',
    token_type: 'Bearer',
    expires_in: 3600,
    gcid: 'gcid-1',
  };

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AplusLoginComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        // The error interceptor is registered so a mint rejection arrives as
        // the same ApiError the component sees at runtime (without it the
        // rejection is a raw HttpErrorResponse and isApiError() is false).
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        AuthService,
        WebAuthnService,
        PasswordAuthService,
        ReturnUrlService,
        TranslateService,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AplusLoginComponent);
    component = fixture.componentInstance;
    authService = TestBed.inject(AuthService);
    passwordAuthService = TestBed.inject(PasswordAuthService);
    returnUrlService = TestBed.inject(ReturnUrlService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('requires both username and password before attempting sign-in', async () => {
    fixture.detectChanges();
    const signIn = vi.spyOn(passwordAuthService, 'signInWithPassword');

    component.username.set('');
    component.password.set('');
    await component.loginWithPassword();
    expect(component.errorMessage()).toBe('identity.login.error_fields_required');
    expect(signIn).not.toHaveBeenCalled();

    component.username.set('admin');
    await component.loginWithPassword();
    expect(signIn).not.toHaveBeenCalled();

    component.password.set('admin');
    const pending = component.loginWithPassword();
    const req = httpMock.expectOne(MINT_URL);
    req.flush(mockTokenResponse);
    await pending;
    expect(signIn).toHaveBeenCalledWith('admin', 'admin');
  });

  it('posts username + password to the mint endpoint and enters the app on 200', async () => {
    fixture.detectChanges();
    vi.spyOn(authService, 'handleAuthResponse');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    component.username.set('admin');
    component.password.set('admin');
    const pending = component.loginWithPassword();

    const req = httpMock.expectOne(MINT_URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ username: 'admin', password: 'admin' });
    // The mint is anonymous — no Bearer header on the credentials call.
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(mockTokenResponse);

    await pending;
    expect(authService.handleAuthResponse).toHaveBeenCalledWith(mockTokenResponse);
    expect(router.navigateByUrl).toHaveBeenCalledWith(RESOLVED_LANDING);
    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBeNull();
  });

  it('navigates to the returnUrl after a successful sign-in', async () => {
    fixture.detectChanges();
    vi.spyOn(authService, 'handleAuthResponse');
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    returnUrlService.capture('/learning/atoms/42');

    component.username.set('admin');
    component.password.set('admin');
    const pending = component.loginWithPassword();
    httpMock.expectOne(MINT_URL).flush(mockTokenResponse);
    await pending;

    expect(router.navigateByUrl).toHaveBeenCalledWith('/learning/atoms/42');
  });

  it('surfaces the gateway message on 401 INVALID_CREDENTIALS', async () => {
    fixture.detectChanges();

    component.username.set('admin');
    component.password.set('wrong');
    const pending = component.loginWithPassword();

    const req = httpMock.expectOne(MINT_URL);
    req.flush(
      {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'invalid username or password',
          correlation_id: 'corr-1',
        },
      },
      { status: 401, statusText: 'Unauthorized' },
    );

    await pending;
    expect(component.errorMessage()).toBe('invalid username or password');
    expect(component.isLoading()).toBe(false);
  });

  it('surfaces the generic credentials key when the mint fails with a non-ApiError', async () => {
    fixture.detectChanges();
    vi.spyOn(passwordAuthService, 'signInWithPassword').mockRejectedValue(new Error('network'));

    component.username.set('admin');
    component.password.set('admin');
    await component.loginWithPassword();

    expect(component.errorMessage()).toBe('identity.login.error_credentials');
    expect(component.isLoading()).toBe(false);
  });
});
