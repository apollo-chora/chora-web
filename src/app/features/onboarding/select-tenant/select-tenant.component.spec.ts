import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { SelectTenantComponent } from './select-tenant.component';
import { LandingService } from '../../../core/auth/landing.service';

/**
 * C2 slice 3 (ADR-240): this screen asks the ONE landing resolver instead of
 * exporting its own `AUTHED_HOME_ROUTE` constant. The sentinel proves
 * delegation; the resolver's own rules are tested in landing.service.spec.ts.
 */
const RESOLVED_LANDING = '/resolved-landing';
const landingStub = { landingRoute: () => RESOLVED_LANDING };
import { TenantContextService } from '../../../core/auth/tenant-context.service';
import { TranslateService } from '../../../core/services/translate.service';
import { buildTenantContext } from '../../../testing/builders/buildTenantContext';

describe('SelectTenantComponent', () => {
  let fixture: ComponentFixture<SelectTenantComponent>;
  let component: SelectTenantComponent;
  let switchTenantSpy: ReturnType<typeof vi.fn>;
  let navigateSpy: ReturnType<typeof vi.fn>;

  const memberships = [
    buildTenantContext({ id: 't1', slug: 'alpha-school' }),
    buildTenantContext({ id: 't2', slug: 'beta-university' }),
  ];

  beforeEach(async () => {
    switchTenantSpy = vi.fn().mockReturnValue(of(void 0));
    navigateSpy = vi.fn();

    const tenantContextStub = {
      availableTenants: signal(memberships),
      currentTenant: signal(null),
      switchTenant: switchTenantSpy,
    };

    await TestBed.configureTestingModule({
      imports: [SelectTenantComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: TenantContextService, useValue: tenantContextStub },
        { provide: Router, useValue: { navigate: navigateSpy } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SelectTenantComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('passes available memberships to the tenant picker', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="tenant-picker-row-"]',
    );
    expect(rows.length).toBe(2);
  });

  it('renders a title and intro copy', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-title"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="select-tenant-intro"]')).toBeTruthy();
  });

  it('calls switchTenant and navigates home on successful select', () => {
    component.onSelect('t2');
    expect(switchTenantSpy).toHaveBeenCalledWith('t2');
    expect(navigateSpy).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  it('shows an inline error and clears switching on failure', () => {
    switchTenantSpy.mockReturnValue(throwError(() => new Error('mint failed')));
    component.onSelect('t1');
    fixture.detectChanges();
    expect(component.switching()).toBe(false);
    expect(component.errored()).toBe(true);
    const err = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="select-tenant-error"]',
    );
    expect(err).toBeTruthy();
  });

  it('sets switching true while the mint is in flight', () => {
    // A never-completing subject keeps the round-trip "in flight" so we
    // can observe the mid-flight signal state.
    const pending = new Subject<void>();
    switchTenantSpy.mockReturnValue(pending.asObservable());
    component.onSelect('t1');
    expect(component.switching()).toBe(true);
    pending.next();
    pending.complete();
    expect(component.switching()).toBe(false);
  });

  it('clears any prior error when a new select starts', () => {
    switchTenantSpy.mockReturnValue(throwError(() => new Error('fail')));
    component.onSelect('t1');
    expect(component.errored()).toBe(true);

    switchTenantSpy.mockReturnValue(of(void 0));
    component.onSelect('t2');
    expect(component.errored()).toBe(false);
  });

  it('exports the authed home route matching app root redirect', () => {
    expect(TestBed.inject(LandingService).landingRoute()).toBe(RESOLVED_LANDING);
  });

  it('renders the real membership labels in the picker rows', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('alpha-school');
    expect(el.textContent).toContain('beta-university');
  });

  it('does not render the loading indicator before any select', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-loading"]')).toBeNull();
  });

  it('does not render the error banner before any failure', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-error"]')).toBeNull();
  });

  it('renders the loading indicator while a mint is in flight', () => {
    const pending = new Subject<void>();
    switchTenantSpy.mockReturnValue(pending.asObservable());
    component.onSelect('t1');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-loading"]')).toBeTruthy();
    // Resolve the in-flight mint and confirm the loading line clears.
    pending.next();
    pending.complete();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="select-tenant-loading"]')).toBeNull();
  });

  it('drives onSelect via a picker row click (DOM interaction)', () => {
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="tenant-picker-row-t2"]',
    );
    expect(row).toBeTruthy();
    row!.click();
    expect(switchTenantSpy).toHaveBeenCalledWith('t2');
    expect(navigateSpy).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  it('drives onSelect via a picker row Enter keydown (DOM interaction)', () => {
    const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '[data-testid="tenant-picker-row-t1"]',
    );
    row!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(switchTenantSpy).toHaveBeenCalledWith('t1');
    expect(navigateSpy).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  it('clears the error banner from the DOM when a new select succeeds', () => {
    // First attempt fails — banner appears.
    switchTenantSpy.mockReturnValue(throwError(() => new Error('fail')));
    component.onSelect('t1');
    fixture.detectChanges();
    let el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-error"]')).toBeTruthy();

    // Second attempt succeeds — banner disappears.
    switchTenantSpy.mockReturnValue(of(void 0));
    component.onSelect('t2');
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="select-tenant-error"]')).toBeNull();
  });

  it('does not navigate when the mint fails', () => {
    switchTenantSpy.mockReturnValue(throwError(() => new Error('boom')));
    component.onSelect('t1');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('renders the empty placeholder when no memberships are available', async () => {
    // Re-configure with an empty membership signal.
    TestBed.resetTestingModule();
    const emptyStub = {
      availableTenants: signal([]),
      currentTenant: signal(null),
      switchTenant: switchTenantSpy,
    };
    await TestBed.configureTestingModule({
      imports: [SelectTenantComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        provideHttpClient(),
        provideHttpClientTesting(),
        TranslateService,
        { provide: TenantContextService, useValue: emptyStub },
        { provide: Router, useValue: { navigate: navigateSpy } },
      ],
    }).compileComponents();
    const emptyFixture = TestBed.createComponent(SelectTenantComponent);
    emptyFixture.detectChanges();
    const el = emptyFixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('[data-testid^="tenant-picker-row-"]').length).toBe(0);
    expect(el.querySelector('.tenant-picker__empty')).toBeTruthy();
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
