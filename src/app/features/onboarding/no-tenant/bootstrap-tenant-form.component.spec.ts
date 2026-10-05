/**
 * BootstrapTenantFormComponent spec — RED-phase tests for CHO-1642.
 *
 * Drives the form via a fake BootstrapTenantService + spies on
 * AuthService.silentRefresh and Router.navigate. Per chora-web/CLAUDE.md
 * §6: standalone in TestBed.imports, signal inputs via setInput,
 * httpMock.verify() in afterEach (not needed here — fake service).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Observable, of } from 'rxjs';

import { BootstrapTenantFormComponent } from './bootstrap-tenant-form.component';
import { BootstrapTenantService } from './bootstrap-tenant.service';
import { AuthService } from '../../../core/auth/auth.service';
import { BootstrapTenantResult } from './bootstrap-tenant.model';

class FakeBootstrapTenantService {
  result: BootstrapTenantResult = {
    kind: 'success',
    response: {
      tenant_id: '01935f12-0000-7000-8000-000000000001',
      owner_member_id: '01935f12-0000-7000-8000-000000000002',
      entitlement_id: '01935f12-0000-7000-8000-000000000003',
      created_at: '2026-06-02T01:00:00Z',
    },
  };
  calls = 0;
  lastName = '';
  bootstrap(name: string): Observable<BootstrapTenantResult> {
    this.calls++;
    this.lastName = name;
    return of(this.result);
  }
}

async function setup(): Promise<{
  fixture: ComponentFixture<BootstrapTenantFormComponent>;
  component: BootstrapTenantFormComponent;
  service: FakeBootstrapTenantService;
  router: Router;
  silentRefreshSpy: ReturnType<typeof vi.fn>;
}> {
  const service = new FakeBootstrapTenantService();
  const silentRefreshSpy = vi.fn(() => of(true));

  await TestBed.configureTestingModule({
    imports: [BootstrapTenantFormComponent],
    providers: [
      provideRouter([]),
      { provide: BootstrapTenantService, useValue: service },
      {
        provide: AuthService,
        useValue: {
          silentRefresh: silentRefreshSpy,
        },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(BootstrapTenantFormComponent);
  const router = TestBed.inject(Router);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    service,
    router,
    silentRefreshSpy,
  };
}

function setName(fixture: ComponentFixture<BootstrapTenantFormComponent>, value: string): void {
  const input = fixture.nativeElement.querySelector(
    '[data-testid="bootstrap-tenant-form-name"]',
  ) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function clickSubmit(fixture: ComponentFixture<BootstrapTenantFormComponent>): void {
  // CHO-1651 — dispatch a real SubmitEvent on the <form> element so the
  // Angular FormGroupDirective `(ngSubmit)` binding is exercised end-to-
  // end. Previously this helper called `componentInstance.submit()`
  // directly, which masked a production bug where the form had no
  // `[formGroup]` and the binding was a no-op — clicks just did a
  // native page reload. Dispatching the event is what catches that.
  const form = fixture.nativeElement.querySelector(
    '[data-testid="bootstrap-tenant-form"]',
  ) as HTMLFormElement;
  form.dispatchEvent(new SubmitEvent('submit', { cancelable: true, bubbles: true }));
  fixture.detectChanges();
}

describe('BootstrapTenantFormComponent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the form with a name input and submit button', async () => {
    const { fixture } = await setup();
    const form = fixture.nativeElement.querySelector('[data-testid="bootstrap-tenant-form"]');
    const input = fixture.nativeElement.querySelector('[data-testid="bootstrap-tenant-form-name"]');
    const button = fixture.nativeElement.querySelector('[data-testid="bootstrap-tenant-form-submit"]');
    expect(form).toBeTruthy();
    expect(input).toBeTruthy();
    expect(button).toBeTruthy();
  });

  it('disables submit when the name is empty', async () => {
    const { fixture } = await setup();
    const button = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('disables submit when the name is shorter than 3 characters', async () => {
    const { fixture } = await setup();
    setName(fixture, 'ab');
    const button = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables submit when the name is 3-256 chars', async () => {
    const { fixture } = await setup();
    setName(fixture, 'Htet Aung Dev Tenant');
    const button = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('calls service.bootstrap with the trimmed name on submit', async () => {
    const { fixture, service } = await setup();
    setName(fixture, '   Trimmed Tenant   ');
    clickSubmit(fixture);
    expect(service.calls).toBe(1);
    expect(service.lastName).toBe('   Trimmed Tenant   ');
  });

  it('on 201 success, refreshes session and navigates to the Setup Wizard', async () => {
    const { fixture, router, silentRefreshSpy } = await setup();
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    setName(fixture, 'Happy Path');
    clickSubmit(fixture);
    // Drain microtasks for the silentRefresh subscribe chain.
    await Promise.resolve();
    await Promise.resolve();
    expect(silentRefreshSpy).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith(['/admin/tenant/settings/wizard']);
  });

  it('on 409, renders the already-member state with a link to /h/tenant', async () => {
    const { fixture, service } = await setup();
    service.result = { kind: 'already-member' };
    setName(fixture, 'Dup Tenant');
    clickSubmit(fixture);
    await Promise.resolve();
    fixture.detectChanges();

    const conflict = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-already-member"]',
    );
    expect(conflict).toBeTruthy();
    const link = conflict.querySelector('a[routerLink], a[href]');
    expect(link).toBeTruthy();
  });

  it('on 400, shows the inline name error using the upstream message', async () => {
    // Use a client-side-valid name (3+ chars) so submit() reaches the
    // service; then the fake service returns the server's 400 verdict.
    const { fixture, service } = await setup();
    service.result = { kind: 'invalid-name', message: 'name must be at least 3 characters server-side' };
    setName(fixture, 'Server Rejects This');
    clickSubmit(fixture);
    await Promise.resolve();
    fixture.detectChanges();

    const inlineErr = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-error-name"]',
    );
    expect(inlineErr).toBeTruthy();
    expect(inlineErr.textContent).toContain('server-side');
  });

  it('on 5xx, shows the server-error banner and re-enables submit', async () => {
    const { fixture, service } = await setup();
    service.result = { kind: 'server-error' };
    setName(fixture, 'Boom Tenant');
    clickSubmit(fixture);
    await Promise.resolve();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-error-server"]',
    );
    expect(banner).toBeTruthy();
    const button = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-submit"]',
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  it('on network-error, shows the network-error banner', async () => {
    const { fixture, service } = await setup();
    service.result = { kind: 'network-error' };
    setName(fixture, 'Offline');
    clickSubmit(fixture);
    await Promise.resolve();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-error-network"]',
    );
    expect(banner).toBeTruthy();
  });

  it('on 401, shows the unauthenticated banner', async () => {
    const { fixture, service } = await setup();
    service.result = { kind: 'unauthenticated' };
    setName(fixture, 'No Auth');
    clickSubmit(fixture);
    await Promise.resolve();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector(
      '[data-testid="bootstrap-tenant-form-error-unauth"]',
    );
    expect(banner).toBeTruthy();
  });
});
