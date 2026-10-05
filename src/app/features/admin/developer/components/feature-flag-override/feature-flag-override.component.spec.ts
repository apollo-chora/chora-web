import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { FeatureFlagOverrideComponent } from './feature-flag-override.component';
import type { FeatureFlagOverride } from '../../models/developer.model';

describe('FeatureFlagOverrideComponent', () => {
  let component: FeatureFlagOverrideComponent;
  let fixture: ComponentFixture<FeatureFlagOverrideComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FeatureFlagOverrideComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(FeatureFlagOverrideComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have data-testid attribute', () => {
    const el = fixture.nativeElement.querySelector('[data-testid="feature-flag-override"]');
    expect(el).toBeTruthy();
  });

  it('should load flags on init', () => {
    // Component calls loadFlags() in ngOnInit, which uses mock data
    expect(component.flags().length).toBeGreaterThan(0);
    expect(component.loading()).toBe(false);
  });

  it('should display flags title', () => {
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('[data-testid="flags-title"]');
    expect(title).toBeTruthy();
  });

  it('should display summary section', () => {
    fixture.detectChanges();
    const summary = fixture.nativeElement.querySelector('[data-testid="flags-summary"]');
    expect(summary).toBeTruthy();
  });

  it('should compute totalFlags', () => {
    expect(component.totalFlags()).toBeGreaterThan(0);
  });

  it('should compute enabledCount', () => {
    // Mock data has flags with enabled=true and one with override active
    expect(component.enabledCount()).toBeGreaterThan(0);
  });

  it('should compute overrideCount', () => {
    // Mock data has 'byoa' flag with overrideActive=true
    expect(component.overrideCount()).toBeGreaterThanOrEqual(1);
  });

  it('should display total flags in template', () => {
    fixture.detectChanges();
    const totalEl = fixture.nativeElement.querySelector('[data-testid="total-flags"]');
    expect(totalEl).toBeTruthy();
    expect(totalEl.textContent.trim()).toBe(String(component.totalFlags()));
  });

  it('should display flag list', () => {
    fixture.detectChanges();
    const list = fixture.nativeElement.querySelector('[data-testid="flag-list"]');
    expect(list).toBeTruthy();
  });

  it('should toggle override for a flag', () => {
    const flag = component.flags().find((f) => !f.overrideActive);
    if (!flag) {
      // pending('Need a flag with overrideActive=false');
      return;
    }

    component.toggleOverride(flag);

    const updatedFlag = component.flags().find((f) => f.addOnCode === flag.addOnCode);
    expect(updatedFlag).toBeTruthy();
    expect(updatedFlag!.overrideActive).toBe(true);
  });

  it('should toggle override value for an active override', () => {
    // Find or create an active override
    const activeFlag = component.flags().find((f) => f.overrideActive);
    if (!activeFlag) {
      // pending('Need a flag with overrideActive=true');
      return;
    }

    const originalValue = activeFlag.overrideValue;
    component.toggleOverrideValue(activeFlag);

    const updatedFlag = component.flags().find((f) => f.addOnCode === activeFlag.addOnCode);
    expect(updatedFlag!.overrideValue).toBe(!originalValue);
  });

  it('should not toggle override value when override is not active', () => {
    const inactiveFlag = component.flags().find((f) => !f.overrideActive);
    if (!inactiveFlag) {
      // pending('Need a flag with overrideActive=false');
      return;
    }

    const originalValue = inactiveFlag.overrideValue;
    component.toggleOverrideValue(inactiveFlag);

    // Value should remain unchanged because overrideActive is false
    const updatedFlag = component.flags().find((f) => f.addOnCode === inactiveFlag.addOnCode);
    expect(updatedFlag!.overrideValue).toBe(originalValue);
  });

  it('should clear all overrides', () => {
    component.clearAllOverrides();

    const flags = component.flags();
    const activeOverrides = flags.filter((f) => f.overrideActive);
    expect(activeOverrides.length).toBe(0);
  });

  it('should compute effectiveState correctly for non-overridden flag', () => {
    const flag: FeatureFlagOverride = {
      addOnCode: 'test',
      displayName: 'Test',
      enabled: true,
      overrideActive: false,
      overrideValue: false,
    };
    expect(component.effectiveState(flag)).toBe(true);
  });

  it('should compute effectiveState correctly for overridden flag', () => {
    const flag: FeatureFlagOverride = {
      addOnCode: 'test',
      displayName: 'Test',
      enabled: true,
      overrideActive: true,
      overrideValue: false,
    };
    expect(component.effectiveState(flag)).toBe(false);
  });

  it('should return correct effectiveStateLabel for enabled', () => {
    const flag: FeatureFlagOverride = {
      addOnCode: 'test',
      displayName: 'Test',
      enabled: true,
      overrideActive: false,
      overrideValue: false,
    };
    expect(component.effectiveStateLabel(flag)).toBe('admin.developer.flag_enabled');
  });

  it('should return correct effectiveStateLabel for disabled', () => {
    const flag: FeatureFlagOverride = {
      addOnCode: 'test',
      displayName: 'Test',
      enabled: false,
      overrideActive: false,
      overrideValue: false,
    };
    expect(component.effectiveStateLabel(flag)).toBe('admin.developer.flag_disabled');
  });

  it('should show clear all button when overrides are active', () => {
    fixture.detectChanges();
    if (component.overrideCount() > 0) {
      const clearBtn = fixture.nativeElement.querySelector('[data-testid="btn-clear-all"]');
      expect(clearBtn).toBeTruthy();
    }
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
