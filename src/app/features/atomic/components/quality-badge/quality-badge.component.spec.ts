import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { QualityBadgeComponent } from './quality-badge.component';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityBadgeComponent', () => {
  let fixture: ComponentFixture<QualityBadgeComponent>;
  let component: QualityBadgeComponent;
  let element: HTMLElement;

  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QualityBadgeComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QualityBadgeComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  // -------------------------------------------------------------------------
  // No data — hidden
  // -------------------------------------------------------------------------

  it('does not render when no data is provided', () => {
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="quality-badge"]')).toBeNull();
    expect(component.hasAnyData()).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Difficulty dots
  // -------------------------------------------------------------------------

  it('renders difficulty dots when difficultyScore is set', () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="quality-difficulty"]')).toBeTruthy();

    const dots = element.querySelectorAll('.quality-badge__dot');
    expect(dots.length).toBe(5);

    // 3 filled, 2 unfilled
    const filled = element.querySelectorAll('.quality-badge__dot--filled');
    expect(filled.length).toBe(3);
  });

  it('clamps difficulty to 1-5 range', () => {
    fixture.componentRef.setInput('difficultyScore', 7);
    fixture.detectChanges();

    const filled = element.querySelectorAll('.quality-badge__dot--filled');
    expect(filled.length).toBe(5);
  });

  it('returns correct difficulty color classification', () => {
    fixture.componentRef.setInput('difficultyScore', 1);
    fixture.detectChanges();
    expect(component.difficultyColor()).toBe('easy');

    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.detectChanges();
    expect(component.difficultyColor()).toBe('medium');

    fixture.componentRef.setInput('difficultyScore', 4);
    fixture.detectChanges();
    expect(component.difficultyColor()).toBe('hard');
  });

  // -------------------------------------------------------------------------
  // Quality percentage
  // -------------------------------------------------------------------------

  it('renders quality percentage when qualityScore is set', () => {
    fixture.componentRef.setInput('qualityScore', 0.85);
    fixture.detectChanges();

    const qualityEl = element.querySelector('[data-testid="quality-score"]');
    expect(qualityEl).toBeTruthy();
    expect(qualityEl?.textContent).toContain('85');
  });

  it('rounds quality percentage to nearest integer', () => {
    fixture.componentRef.setInput('qualityScore', 0.777);
    fixture.detectChanges();

    expect(component.qualityPercent()).toBe(78);
  });

  it('returns correct quality level classification', () => {
    fixture.componentRef.setInput('qualityScore', 0.85);
    expect(component.qualityLevel()).toBe('high');

    fixture.componentRef.setInput('qualityScore', 0.55);
    expect(component.qualityLevel()).toBe('medium');

    fixture.componentRef.setInput('qualityScore', 0.2);
    expect(component.qualityLevel()).toBe('low');
  });

  // -------------------------------------------------------------------------
  // Bloom's taxonomy tag
  // -------------------------------------------------------------------------

  it('renders Bloom\'s level tag when bloomsLevel is set', () => {
    fixture.componentRef.setInput('bloomsLevel', 'apply');
    fixture.detectChanges();

    const bloomsEl = element.querySelector('[data-testid="quality-blooms"]');
    expect(bloomsEl).toBeTruthy();
    expect(bloomsEl?.textContent).toContain('Apply');
  });

  it('capitalizes first letter of bloom\'s label', () => {
    fixture.componentRef.setInput('bloomsLevel', 'evaluate');
    fixture.detectChanges();

    expect(component.bloomsLabel()).toBe('Evaluate');
  });

  // -------------------------------------------------------------------------
  // Compact mode
  // -------------------------------------------------------------------------

  it('applies compact class when compact is true', () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const badge = element.querySelector('[data-testid="quality-badge"]');
    expect(badge?.classList.contains('quality-badge--compact')).toBe(true);
  });

  it('hides labels in compact mode', () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const labels = element.querySelectorAll('.quality-badge__label');
    expect(labels.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Combined data
  // -------------------------------------------------------------------------

  it('renders all sections when all data is provided', () => {
    fixture.componentRef.setInput('difficultyScore', 4);
    fixture.componentRef.setInput('qualityScore', 0.92);
    fixture.componentRef.setInput('bloomsLevel', 'analyze');
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="quality-difficulty"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="quality-score"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="quality-blooms"]')).toBeTruthy();
    expect(component.hasAnyData()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('difficulty section has img role with aria-label', () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.detectChanges();

    const diffEl = element.querySelector('[data-testid="quality-difficulty"]');
    expect(diffEl?.getAttribute('role')).toBe('img');
    expect(diffEl?.getAttribute('aria-label')).toContain('difficulty');
  });

  it('passes axe-core accessibility checks', async () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.componentRef.setInput('qualityScore', 0.8);
    fixture.componentRef.setInput('bloomsLevel', 'apply');
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Branch coverage augmentation — null-guard TRUE arms + clamp lower bound
  // -------------------------------------------------------------------------

  // difficultyDots(): `if (score === null) return []` — TRUE arm
  it('difficultyDots() returns an empty array when difficultyScore is null', () => {
    // default input value is null; no input set
    fixture.detectChanges();
    expect(component.difficultyDots()).toEqual([]);
  });

  // difficultyDots(): Math.max(1, ...) lower-bound clamp for a sub-1 score
  it('clamps a sub-1 difficulty score up to a single filled dot', () => {
    fixture.componentRef.setInput('difficultyScore', 0);
    fixture.detectChanges();
    expect(component.difficultyDots()).toEqual([true, false, false, false, false]);
  });

  // difficultyColor(): `if (score === null) return ''` — TRUE arm
  it('difficultyColor() returns an empty string when difficultyScore is null', () => {
    fixture.detectChanges();
    expect(component.difficultyColor()).toBe('');
  });

  // difficultyColor(): boundary score == 2 falls in the easy arm (score <= 2)
  it('classifies a difficulty score of exactly 2 as easy', () => {
    fixture.componentRef.setInput('difficultyScore', 2);
    fixture.detectChanges();
    expect(component.difficultyColor()).toBe('easy');
  });

  // qualityPercent(): `if (score === null) return null` — TRUE arm
  it('qualityPercent() returns null when qualityScore is null', () => {
    fixture.detectChanges();
    expect(component.qualityPercent()).toBeNull();
  });

  // qualityLevel(): `if (score === null) return ''` — TRUE arm
  it('qualityLevel() returns an empty string when qualityScore is null', () => {
    fixture.detectChanges();
    expect(component.qualityLevel()).toBe('');
  });

  // qualityLevel(): boundary scores at the arm edges
  it('classifies a quality score of exactly 0.7 as high and 0.4 as medium', () => {
    fixture.componentRef.setInput('qualityScore', 0.7);
    fixture.detectChanges();
    expect(component.qualityLevel()).toBe('high');

    fixture.componentRef.setInput('qualityScore', 0.4);
    fixture.detectChanges();
    expect(component.qualityLevel()).toBe('medium');
  });

  // bloomsLabel(): `if (!level) return null` — TRUE arm (falsy/null level)
  it('bloomsLabel() returns null when bloomsLevel is null', () => {
    fixture.detectChanges();
    expect(component.bloomsLabel()).toBeNull();
  });

  // hasAnyData() OR short-circuit — true via the second operand only (quality only)
  it('hasAnyData() is true when only qualityScore is set (second OR arm)', () => {
    fixture.componentRef.setInput('qualityScore', 0.5);
    fixture.detectChanges();
    expect(component.hasDifficulty()).toBe(false);
    expect(component.hasQuality()).toBe(true);
    expect(component.hasBlooms()).toBe(false);
    expect(component.hasAnyData()).toBe(true);
  });

  // hasAnyData() OR short-circuit — true via the third operand only (blooms only)
  it('hasAnyData() is true when only bloomsLevel is set (third OR arm)', () => {
    fixture.componentRef.setInput('bloomsLevel', 'remember');
    fixture.detectChanges();
    expect(component.hasDifficulty()).toBe(false);
    expect(component.hasQuality()).toBe(false);
    expect(component.hasBlooms()).toBe(true);
    expect(component.hasAnyData()).toBe(true);
  });

  // compact() ternary FALSE arm — labels shown when compact is false (default)
  it('shows the labels when compact is false (default)', () => {
    fixture.componentRef.setInput('difficultyScore', 3);
    fixture.componentRef.setInput('qualityScore', 0.8);
    fixture.detectChanges();

    const badge = element.querySelector('[data-testid="quality-badge"]');
    expect(badge?.classList.contains('quality-badge--compact')).toBe(false);
    const labels = element.querySelectorAll('.quality-badge__label');
    expect(labels.length).toBe(2);
  });
});
