import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { ReviewStatusComponent } from './review-status.component';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ReviewStatusComponent', () => {
  let fixture: ComponentFixture<ReviewStatusComponent>;
  let component: ReviewStatusComponent;
  let element: HTMLElement;

  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReviewStatusComponent],
      providers: [
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReviewStatusComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  // -------------------------------------------------------------------------
  // Reviewed state
  // -------------------------------------------------------------------------

  it('renders reviewed status with check_circle icon', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="review-status"]')).toBeTruthy();
    expect(element.querySelector('.review-status--reviewed')).toBeTruthy();
    expect(component.statusIcon()).toBe('check_circle');
    expect(component.statusLabel()).toBe('atomic.review.reviewed');
  });

  it('displays label text for reviewed', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.detectChanges();

    const label = element.querySelector('[data-testid="review-status-label"]');
    expect(label?.textContent).toContain('atomic.review.reviewed');
  });

  // -------------------------------------------------------------------------
  // Pending review state
  // -------------------------------------------------------------------------

  it('renders pending_review status with schedule icon', () => {
    fixture.componentRef.setInput('status', 'pending_review');
    fixture.detectChanges();

    expect(element.querySelector('.review-status--pending')).toBeTruthy();
    expect(component.statusIcon()).toBe('schedule');
    expect(component.statusLabel()).toBe('atomic.review.pending');
  });

  // -------------------------------------------------------------------------
  // Needs revision state
  // -------------------------------------------------------------------------

  it('renders needs_revision status with warning icon', () => {
    fixture.componentRef.setInput('status', 'needs_revision');
    fixture.detectChanges();

    expect(element.querySelector('.review-status--revision')).toBeTruthy();
    expect(component.statusIcon()).toBe('warning');
    expect(component.statusLabel()).toBe('atomic.review.needs-revision');
  });

  // -------------------------------------------------------------------------
  // Confidence display
  // -------------------------------------------------------------------------

  it('displays confidence percentage when provided', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.componentRef.setInput('confidence', 0.87);
    fixture.detectChanges();

    const confEl = element.querySelector('[data-testid="review-status-confidence"]');
    expect(confEl).toBeTruthy();
    expect(confEl?.textContent).toContain('87');
  });

  it('hides confidence when null', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="review-status-confidence"]')).toBeNull();
  });

  it('rounds confidence to nearest integer', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.componentRef.setInput('confidence', 0.756);
    fixture.detectChanges();

    expect(component.confidencePercent()).toBe(76);
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has aria-label combining status and confidence', () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.componentRef.setInput('confidence', 0.9);
    fixture.detectChanges();

    const container = element.querySelector('[data-testid="review-status"]');
    const ariaLabel = container?.getAttribute('aria-label');
    expect(ariaLabel).toContain('atomic.review.reviewed');
    expect(ariaLabel).toContain('confidence');
    expect(ariaLabel).toContain('90');
  });

  it('has aria-label without confidence when null', () => {
    fixture.componentRef.setInput('status', 'pending_review');
    fixture.detectChanges();

    const container = element.querySelector('[data-testid="review-status"]');
    const ariaLabel = container?.getAttribute('aria-label');
    expect(ariaLabel).toContain('atomic.review.pending');
    expect(ariaLabel).not.toContain('confidence');
  });

  it('passes axe-core accessibility checks for reviewed state', async () => {
    fixture.componentRef.setInput('status', 'reviewed');
    fixture.componentRef.setInput('confidence', 0.85);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });

  it('passes axe-core accessibility checks for needs_revision state', async () => {
    fixture.componentRef.setInput('status', 'needs_revision');
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});
