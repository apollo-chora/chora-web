import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TrendExplanationComponent } from './trend-explanation.component';
import type { Insight } from '../../services/analytics-insight.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    title: 'Engagement Drop',
    narrative: 'Daily active users dropped 15% this month.',
    metric_references: ['dau', 'session_duration'],
    trend_direction: 'down',
    confidence: 0.87,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrendExplanationComponent', () => {
  let fixture: ComponentFixture<TrendExplanationComponent>;
  let component: TrendExplanationComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TrendExplanationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TrendExplanationComponent);
    component = fixture.componentInstance;
  });

  function setInsight(overrides: Partial<Insight> = {}): void {
    fixture.componentRef.setInput('insight', buildInsight(overrides));
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Rendering
  // -----------------------------------------------------------------------

  it('renders insight title', () => {
    setInsight();
    expect(fixture.nativeElement.textContent).toContain('Engagement Drop');
  });

  it('renders narrative', () => {
    setInsight();
    expect(fixture.nativeElement.textContent).toContain('Daily active users dropped 15%');
  });

  // -----------------------------------------------------------------------
  // Trend icon
  // -----------------------------------------------------------------------

  it('returns up arrow for up trend', () => {
    setInsight({ trend_direction: 'up' });
    expect(component.trendIcon()).toBe('\u2191');
  });

  it('returns down arrow for down trend', () => {
    setInsight({ trend_direction: 'down' });
    expect(component.trendIcon()).toBe('\u2193');
  });

  it('returns right arrow for flat trend', () => {
    setInsight({ trend_direction: 'flat' });
    expect(component.trendIcon()).toBe('\u2192');
  });

  // -----------------------------------------------------------------------
  // Trend class
  // -----------------------------------------------------------------------

  it('returns correct trend class for up', () => {
    setInsight({ trend_direction: 'up' });
    expect(component.trendClass()).toBe('trend-explanation__trend-icon--up');
  });

  it('returns correct trend class for down', () => {
    setInsight({ trend_direction: 'down' });
    expect(component.trendClass()).toBe('trend-explanation__trend-icon--down');
  });

  // -----------------------------------------------------------------------
  // Confidence
  // -----------------------------------------------------------------------

  it('returns high confidence class for > 0.8', () => {
    setInsight({ confidence: 0.85 });
    expect(component.confidenceClass()).toBe('trend-explanation__confidence-bar--high');
  });

  it('returns medium confidence class for >= 0.5', () => {
    setInsight({ confidence: 0.65 });
    expect(component.confidenceClass()).toBe('trend-explanation__confidence-bar--medium');
  });

  it('returns low confidence class for < 0.5', () => {
    setInsight({ confidence: 0.3 });
    expect(component.confidenceClass()).toBe('trend-explanation__confidence-bar--low');
  });

  it('calculates confidence percent', () => {
    setInsight({ confidence: 0.87 });
    expect(component.confidencePercent()).toBe(87);
  });

  it('rounds confidence percent', () => {
    setInsight({ confidence: 0.876 });
    expect(component.confidencePercent()).toBe(88);
  });

  // -----------------------------------------------------------------------
  // Close output
  // -----------------------------------------------------------------------

  it('emits close event', () => {
    setInsight();
    const spy = vi.fn();
    component.closed.subscribe(spy);
    component.onClose();
    expect(spy).toHaveBeenCalled();
  });

  it('emits close event when close button clicked in DOM', () => {
    setInsight();
    const spy = vi.fn();
    component.closed.subscribe(spy);
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="btn-close-detail"]',
    );
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // -----------------------------------------------------------------------
  // Trend class — additional branch (flat)
  // -----------------------------------------------------------------------

  it('returns correct trend class for flat', () => {
    setInsight({ trend_direction: 'flat' });
    expect(component.trendClass()).toBe('trend-explanation__trend-icon--flat');
  });

  // -----------------------------------------------------------------------
  // Confidence — boundary values
  // -----------------------------------------------------------------------

  it('returns high confidence class at exactly 0.8 boundary', () => {
    setInsight({ confidence: 0.8 });
    expect(component.confidenceClass()).toBe(
      'trend-explanation__confidence-bar--high',
    );
  });

  it('returns medium confidence class at exactly 0.5 boundary', () => {
    setInsight({ confidence: 0.5 });
    expect(component.confidenceClass()).toBe(
      'trend-explanation__confidence-bar--medium',
    );
  });

  it('returns low confidence class just below 0.5 boundary', () => {
    setInsight({ confidence: 0.49 });
    expect(component.confidenceClass()).toBe(
      'trend-explanation__confidence-bar--low',
    );
  });

  it('returns 0 percent for zero confidence', () => {
    setInsight({ confidence: 0 });
    expect(component.confidencePercent()).toBe(0);
  });

  it('returns 100 percent for full confidence', () => {
    setInsight({ confidence: 1 });
    expect(component.confidencePercent()).toBe(100);
  });

  // -----------------------------------------------------------------------
  // DOM rendering — shell + testids
  // -----------------------------------------------------------------------

  it('renders the trend-explanation shell container', () => {
    setInsight();
    expect(
      fixture.nativeElement.querySelector('[data-testid="trend-explanation"]'),
    ).toBeTruthy();
  });

  it('exposes insight title as the container aria-label', () => {
    setInsight({ title: 'Retention Spike' });
    const root: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="trend-explanation"]',
    );
    expect(root.getAttribute('aria-label')).toBe('Retention Spike');
  });

  it('renders the down trend arrow glyph in the DOM', () => {
    setInsight({ trend_direction: 'down' });
    const icon: HTMLElement = fixture.nativeElement.querySelector(
      '.trend-explanation__trend-icon',
    );
    expect(icon.textContent).toContain('↓');
    expect(icon.className).toContain('trend-explanation__trend-icon--down');
    expect(icon.getAttribute('aria-label')).toBe('down');
  });

  it('renders the up trend arrow glyph in the DOM', () => {
    setInsight({ trend_direction: 'up' });
    const icon: HTMLElement = fixture.nativeElement.querySelector(
      '.trend-explanation__trend-icon',
    );
    expect(icon.textContent).toContain('↑');
    expect(icon.className).toContain('trend-explanation__trend-icon--up');
  });

  it('renders the narrative text in the narrative testid block', () => {
    setInsight({ narrative: 'Sessions rose sharply over the period.' });
    const block: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="insight-narrative-text"]',
    );
    expect(block.textContent).toContain('Sessions rose sharply over the period.');
  });

  // -----------------------------------------------------------------------
  // DOM rendering — confidence bar
  // -----------------------------------------------------------------------

  it('renders confidence percent value and progressbar aria-valuenow', () => {
    setInsight({ confidence: 0.87 });
    const bar: HTMLElement = fixture.nativeElement.querySelector(
      '[data-testid="confidence-bar"]',
    );
    expect(bar.getAttribute('aria-valuenow')).toBe('87');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(fixture.nativeElement.textContent).toContain('87%');
  });

  it('applies the confidence class and width style to the inner bar', () => {
    setInsight({ confidence: 0.3 });
    const inner: HTMLElement = fixture.nativeElement.querySelector(
      '.trend-explanation__confidence-bar',
    );
    expect(inner.className).toContain('trend-explanation__confidence-bar--low');
    expect(inner.style.width).toBe('30%');
  });

  it('renders the translated confidence label key', () => {
    setInsight();
    expect(fixture.nativeElement.textContent).toContain(
      'admin.insights.confidence',
    );
  });

  it('renders the translated close-button aria-label key', () => {
    setInsight();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[data-testid="btn-close-detail"]',
    );
    expect(btn.getAttribute('aria-label')).toBe('admin.insights.close_detail');
  });

  // -----------------------------------------------------------------------
  // DOM rendering — metric references @if / @for branches
  // -----------------------------------------------------------------------

  it('renders each metric reference tag when references exist', () => {
    setInsight({ metric_references: ['dau', 'session_duration'] });
    const tags: HTMLElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.trend-explanation__metric-tag'),
    );
    expect(tags.length).toBe(2);
    expect(tags.map((t) => t.textContent?.trim())).toEqual([
      'dau',
      'session_duration',
    ]);
    expect(fixture.nativeElement.textContent).toContain(
      'admin.insights.metric_references',
    );
  });

  it('omits the metrics section when there are no references', () => {
    setInsight({ metric_references: [] });
    expect(
      fixture.nativeElement.querySelector('.trend-explanation__metrics'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      'admin.insights.metric_references',
    );
  });
});
