import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComboMeterComponent } from './combo-meter.component';

describe('ComboMeterComponent', () => {
  let fixture: ComponentFixture<ComboMeterComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComboMeterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ComboMeterComponent);
    element = fixture.nativeElement;
  });

  it('renders combo multiplier text', () => {
    fixture.componentRef.setInput('combo', 1);
    fixture.detectChanges();

    const multiplier = element.querySelector('[data-testid="combo-multiplier"]');
    expect(multiplier?.textContent?.trim()).toBe('1x');
  });

  it('shows 2x multiplier', () => {
    fixture.componentRef.setInput('combo', 2);
    fixture.detectChanges();

    const multiplier = element.querySelector('[data-testid="combo-multiplier"]');
    expect(multiplier?.textContent?.trim()).toBe('2x');
  });

  it('shows 4x multiplier', () => {
    fixture.componentRef.setInput('combo', 4);
    fixture.detectChanges();

    const multiplier = element.querySelector('[data-testid="combo-multiplier"]');
    expect(multiplier?.textContent?.trim()).toBe('4x');
  });

  it('adds active class when combo > 1', () => {
    fixture.componentRef.setInput('combo', 2);
    fixture.detectChanges();

    const meter = element.querySelector('[data-testid="combo-meter"]');
    expect(meter?.classList.contains('combo-meter--active')).toBe(true);
  });

  it('does not add active class at 1x', () => {
    fixture.componentRef.setInput('combo', 1);
    fixture.detectChanges();

    const meter = element.querySelector('[data-testid="combo-meter"]');
    expect(meter?.classList.contains('combo-meter--active')).toBe(false);
  });

  it('adds tier-specific class', () => {
    fixture.componentRef.setInput('combo', 3);
    fixture.detectChanges();

    const meter = element.querySelector('[data-testid="combo-meter"]');
    expect(meter?.classList.contains('combo-meter--tier3')).toBe(true);
  });

  it('has aria-label with combo value', () => {
    fixture.componentRef.setInput('combo', 2);
    fixture.detectChanges();

    const meter = element.querySelector('[data-testid="combo-meter"]');
    expect(meter?.getAttribute('aria-label')).toBe('Combo multiplier: 2x');
  });

  it('has status role and aria-live', () => {
    fixture.componentRef.setInput('combo', 1);
    fixture.detectChanges();

    const meter = element.querySelector('[data-testid="combo-meter"]');
    expect(meter?.getAttribute('role')).toBe('status');
    expect(meter?.getAttribute('aria-live')).toBe('polite');
  });
});
