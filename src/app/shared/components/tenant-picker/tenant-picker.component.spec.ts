import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TenantPickerComponent } from './tenant-picker.component';
import { TranslateService } from '../../../core/services/translate.service';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { buildTenantContext } from '../../../testing/builders/buildTenantContext';

describe('TenantPickerComponent', () => {
  let fixture: ComponentFixture<TenantPickerComponent>;
  let component: TenantPickerComponent;

  const memberships = [
    buildTenantContext({
      id: 't1',
      slug: 'alpha-school',
      name: 'Alpha School',
      roles: ['learner', 'author'],
      isDefault: true,
    }),
    buildTenantContext({
      id: 't2',
      slug: 'beta-university',
      name: 'Beta University',
      roles: ['instructor'],
      isDefault: false,
    }),
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TenantPickerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), TranslateService],
    }).compileComponents();

    fixture = TestBed.createComponent(TenantPickerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('memberships', memberships);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders one row per membership', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid^="tenant-picker-row-"]',
    );
    expect(rows.length).toBe(2);
  });

  it('exposes a radiogroup container', () => {
    const group = (fixture.nativeElement as HTMLElement).querySelector('[role="radiogroup"]');
    expect(group).toBeTruthy();
  });

  it('marks each row as role=radio with aria-checked', () => {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('[role="radio"]');
    expect(rows.length).toBe(2);
    rows.forEach((r) => expect(r.getAttribute('aria-checked')).toBe('false'));
  });

  it('shows the tenant slug as the primary label', () => {
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t1"]',
    );
    expect(row?.textContent).toContain('alpha-school');
  });

  it('falls back to tenant name when slug is empty', () => {
    fixture.componentRef.setInput('memberships', [
      buildTenantContext({ id: 't3', slug: '', name: 'Gamma College' }),
    ]);
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t3"]',
    );
    expect(row?.textContent).toContain('Gamma College');
  });

  it('renders role pills for each role', () => {
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t1"]',
    );
    const pills = row?.querySelectorAll('.tenant-picker__role-pill');
    expect(pills?.length).toBe(2);
  });

  it('renders a default tag only for the default membership', () => {
    const defaultTags = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '.tenant-picker__default-tag',
    );
    expect(defaultTags.length).toBe(1);
  });

  it('emits select with the tenant id on click', () => {
    let emitted: string | undefined;
    component.tenantSelected.subscribe((id) => (emitted = id));
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t2"]',
    ) as HTMLElement;
    row.click();
    expect(emitted).toBe('t2');
  });

  it('emits select on Enter keydown', () => {
    let emitted: string | undefined;
    component.tenantSelected.subscribe((id) => (emitted = id));
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t1"]',
    ) as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(emitted).toBe('t1');
  });

  it('emits select on Space keydown', () => {
    let emitted: string | undefined;
    component.tenantSelected.subscribe((id) => (emitted = id));
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t2"]',
    ) as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    expect(emitted).toBe('t2');
  });

  it('does not emit on unrelated keydown', () => {
    let emitted: string | undefined;
    component.tenantSelected.subscribe((id) => (emitted = id));
    const row = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="tenant-picker-row-t1"]',
    ) as HTMLElement;
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(emitted).toBeUndefined();
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
