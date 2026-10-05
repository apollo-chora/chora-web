import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { RetentionAlertComponent } from './retention-alert.component';
import { RetentionService } from '../../services/retention.service';
import type {
  RetentionState,
  AtRiskAtom,
  ForgettingCurvePoint,
} from '../../services/retention.service';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildAtRiskAtoms(): AtRiskAtom[] {
  return [
    {
      atom_id: 'atom-100',
      last_reviewed: '2026-03-10T10:00:00Z',
      predicted_retention: 35,
      topic_name: 'Organic Chemistry',
    },
    {
      atom_id: 'atom-101',
      last_reviewed: '2026-03-08T14:00:00Z',
      predicted_retention: 22,
      topic_name: 'Thermodynamics',
    },
  ];
}

function buildForgettingCurve(): ForgettingCurvePoint[] {
  return [
    { days_since_review: 1, predicted_retention: 90 },
    { days_since_review: 3, predicted_retention: 72 },
    { days_since_review: 7, predicted_retention: 50 },
    { days_since_review: 14, predicted_retention: 30 },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RetentionAlertComponent', () => {
  let fixture: ComponentFixture<RetentionAlertComponent>;
  let component: RetentionAlertComponent;
  let element: HTMLElement;

  const atRiskAtoms = buildAtRiskAtoms();
  const forgettingCurve = buildForgettingCurve();

  const mockRetentionState = signal<RetentionState>({ status: 'idle' });
  const retentionScoreSignal = signal(62);
  const atRiskAtomsSignal = signal<AtRiskAtom[]>([]);
  const forgettingCurveSignal = signal<ForgettingCurvePoint[]>([]);

  const mockService = {
    retentionState: mockRetentionState.asReadonly(),
    retentionScore: retentionScoreSignal.asReadonly(),
    atRiskAtoms: atRiskAtomsSignal.asReadonly(),
    forgettingCurve: forgettingCurveSignal.asReadonly(),
    loadRetention: vi.fn().mockReturnValue(of(null)),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };
  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRetentionState.set({ status: 'success', data: {} as never });
    retentionScoreSignal.set(62);
    atRiskAtomsSignal.set(atRiskAtoms);
    forgettingCurveSignal.set(forgettingCurve);

    await TestBed.configureTestingModule({
      imports: [RetentionAlertComponent],
      providers: [
        { provide: RetentionService, useValue: mockService },
        { provide: Router, useValue: mockRouter },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RetentionAlertComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Rendering — success state
  // -------------------------------------------------------------------------

  it('renders the retention alert container', () => {
    expect(element.querySelector('[data-testid="retention-alert"]')).toBeTruthy();
  });

  it('renders the retention gauge', () => {
    expect(element.querySelector('[data-testid="retention-gauge"]')).toBeTruthy();
  });

  it('displays the retention score percentage', () => {
    const scoreEl = element.querySelector('[data-testid="retention-score"]');
    expect(scoreEl?.textContent).toContain('62');
  });

  it('renders at-risk atoms list', () => {
    const atRiskSection = element.querySelector('[data-testid="retention-at-risk"]');
    expect(atRiskSection).toBeTruthy();

    const atomBtns = element.querySelectorAll('[data-testid^="retention-atom-"]');
    expect(atomBtns.length).toBe(2);
  });

  it('renders forgetting curve bars', () => {
    const curveSection = element.querySelector('[data-testid="retention-curve"]');
    expect(curveSection).toBeTruthy();

    const bars = element.querySelectorAll('[data-testid^="curve-bar-"]');
    expect(bars.length).toBe(4);
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading state', () => {
    mockRetentionState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="retention-loading"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error state', () => {
    mockRetentionState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="retention-error"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Computed properties
  // -------------------------------------------------------------------------

  it('computes medium scoreLevel for 62%', () => {
    expect(component.scoreLevel()).toBe('medium');
  });

  it('computes high scoreLevel for >= 70%', () => {
    retentionScoreSignal.set(85);
    expect(component.scoreLevel()).toBe('high');
  });

  it('computes low scoreLevel for < 40%', () => {
    retentionScoreSignal.set(25);
    expect(component.scoreLevel()).toBe('low');
  });

  it('computes correct gauge rotation', () => {
    // 62/100 * 180 = 111.6deg
    expect(component.gaugeRotation()).toBe('rotate(111.6deg)');
  });

  it('computes maxCurveRetention from curve data', () => {
    expect(component.maxCurveRetention()).toBe(90);
  });

  // -------------------------------------------------------------------------
  // Helper methods
  // -------------------------------------------------------------------------

  it('barWidth returns minimum 2% for very low retention', () => {
    expect(component.barWidth(0)).toBe('2%');
    expect(component.barWidth(50)).toBe('50%');
  });

  it('barColor returns success color for high retention', () => {
    expect(component.barColor(80)).toContain('success');
  });

  it('barColor returns warning color for medium retention', () => {
    expect(component.barColor(50)).toContain('warning');
  });

  it('barColor returns error color for low retention', () => {
    expect(component.barColor(20)).toContain('error');
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('navigates to atom on at-risk atom click', () => {
    const btn = element.querySelector('[data-testid="retention-atom-atom-100"]') as HTMLElement;
    btn.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/atoms', 'atom-100']);
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has region role with aria-label', () => {
    const container = element.querySelector('[data-testid="retention-alert"]');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('Retention Alert');
  });

  it('passes axe-core accessibility checks', async () => {
    const results = await axe.run(fixture.nativeElement, {
      rules: {
        list: { enabled: false }, // Angular @for generates comment nodes that trigger false positives in jsdom
        listitem: { enabled: false }, // Same root cause as list rule
        'color-contrast': { enabled: false }, // jsdom does not compute styles
        'aria-prohibited-attr': { enabled: false }, // Angular adds aria attributes that jsdom evaluates differently
      },
    });
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});
