import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReasoningTraceComponent } from './reasoning-trace.component';
import type { ReasoningStep } from '../../services/explainability.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildSteps(): ReasoningStep[] {
  return [
    {
      step_number: 1,
      description: 'Checked learner history',
      evidence: 'Learner completed 12 algebra atoms with 85% accuracy',
      confidence: 0.92,
    },
    {
      step_number: 2,
      description: 'Evaluated content relevance',
      evidence: 'Target atom aligns with prerequisite graph',
      confidence: 0.65,
    },
    {
      step_number: 3,
      description: 'Checked safety constraints',
      evidence: 'Content passed safety filter',
      confidence: 0.4,
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReasoningTraceComponent', () => {
  let fixture: ComponentFixture<ReasoningTraceComponent>;
  let component: ReasoningTraceComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReasoningTraceComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ReasoningTraceComponent);
    component = fixture.componentInstance;
  });

  function setSteps(steps: ReasoningStep[] = buildSteps(), summary = ''): void {
    fixture.componentRef.setInput('steps', steps);
    fixture.componentRef.setInput('summary', summary);
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders step descriptions', () => {
    setSteps();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Checked learner history');
    expect(text).toContain('Evaluated content relevance');
    expect(text).toContain('Checked safety constraints');
  });

  it('renders summary when provided', () => {
    setSteps(buildSteps(), 'Recommendation approved based on all checks passing.');
    expect(fixture.nativeElement.textContent).toContain('Recommendation approved');
  });

  // -----------------------------------------------------------------------
  // Confidence classes
  // -----------------------------------------------------------------------

  it('returns high confidence class for > 0.8', () => {
    setSteps();
    expect(component.confidenceClass(0.92)).toBe('reasoning-trace__confidence-fill--high');
  });

  it('returns medium confidence class for >= 0.5', () => {
    setSteps();
    expect(component.confidenceClass(0.65)).toBe('reasoning-trace__confidence-fill--medium');
  });

  it('returns low confidence class for < 0.5', () => {
    setSteps();
    expect(component.confidenceClass(0.4)).toBe('reasoning-trace__confidence-fill--low');
  });

  it('returns high for exactly 0.81', () => {
    setSteps();
    expect(component.confidenceClass(0.81)).toBe('reasoning-trace__confidence-fill--high');
  });

  it('returns medium for exactly 0.5', () => {
    setSteps();
    expect(component.confidenceClass(0.5)).toBe('reasoning-trace__confidence-fill--medium');
  });

  // -----------------------------------------------------------------------
  // Confidence percent
  // -----------------------------------------------------------------------

  it('calculates confidence percent', () => {
    setSteps();
    expect(component.confidencePercent(0.92)).toBe(92);
    expect(component.confidencePercent(0.65)).toBe(65);
    expect(component.confidencePercent(0.4)).toBe(40);
  });

  it('rounds confidence percent', () => {
    setSteps();
    expect(component.confidencePercent(0.876)).toBe(88);
    expect(component.confidencePercent(0.123)).toBe(12);
  });
});
