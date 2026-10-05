import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { GoalGraduatedCelebrationComponent } from './goal-graduated-celebration.component';
import { TranslateService } from '../../../core/services/translate.service';

// The body interpolates {goalLabel} into the i18n template (like the
// goal-progress-ring aria), so the stub returns the REAL body template for that
// key and echoes every other key back (so other assertions read the i18n key).
const BODY_KEY = 'aplus.dashboard.goal.graduated_celebration_body';
const BODY_TEMPLATE = 'You’ve mastered every concept in “{goalLabel}”.';

const mockTranslate = {
  instant: (key: string) => (key === BODY_KEY ? BODY_TEMPLATE : key),
};

function configure(): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [GoalGraduatedCelebrationComponent],
    providers: [{ provide: TranslateService, useValue: mockTranslate }],
  }).compileComponents();
}

describe('GoalGraduatedCelebrationComponent', () => {
  let fixture: ComponentFixture<GoalGraduatedCelebrationComponent>;
  let component: GoalGraduatedCelebrationComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await configure();
    fixture = TestBed.createComponent(GoalGraduatedCelebrationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('goalLabel', 'CSM certification');
    fixture.detectChanges();
  });

  afterEach(() => {
    // Guard against any test that switched to fake timers leaking into the next.
    vi.useRealTimers();
  });

  it('renders the goal label inside the celebration body with the title', () => {
    const root = element.querySelector('[data-testid="goal-graduated-celebration"]');
    expect(root).toBeTruthy();
    expect(root?.textContent).toContain('aplus.dashboard.goal.graduated_celebration_title');
    const message = element.querySelector('[data-testid="goal-graduated-celebration-message"]');
    expect(message?.textContent).toContain('CSM certification');
    expect(message?.textContent).toContain('mastered every concept');
  });

  it('emits dismissed exactly once when the dismiss button is clicked', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    const btn = element.querySelector(
      '[data-testid="goal-graduated-celebration-dismiss"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);

    // A second click must not re-emit.
    btn.click();
    expect(count).toBe(1);
  });

  it('exposes role="status" and aria-live="polite" on the root for screen readers', () => {
    const root = element.querySelector('[data-testid="goal-graduated-celebration"]');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('exposes a translated aria-label on the dismiss button', () => {
    const btn = element.querySelector('[data-testid="goal-graduated-celebration-dismiss"]');
    expect(btn?.getAttribute('aria-label')).toBe(
      'aplus.dashboard.goal.graduated_celebration_dismiss_aria',
    );
  });

  it('has no critical or serious accessibility violations', async () => {
    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});

describe('GoalGraduatedCelebrationComponent — auto-dismiss', () => {
  let fixture: ComponentFixture<GoalGraduatedCelebrationComponent>;
  let component: GoalGraduatedCelebrationComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    // Compile with real timers, then switch to fake timers BEFORE the component
    // is constructed so the constructor's setTimeout is captured.
    await configure();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(GoalGraduatedCelebrationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('goalLabel', 'CSM certification');
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-emits dismissed after 6000ms', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    vi.advanceTimersByTime(5999);
    expect(count).toBe(0);

    vi.advanceTimersByTime(1);
    expect(count).toBe(1);
  });

  it('does not double-emit when the button is clicked after auto-dismiss', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    vi.advanceTimersByTime(6000);
    expect(count).toBe(1);

    const btn = element.querySelector(
      '[data-testid="goal-graduated-celebration-dismiss"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);
  });

  it('does not auto-emit after a manual dismiss', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    const btn = element.querySelector(
      '[data-testid="goal-graduated-celebration-dismiss"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);

    vi.advanceTimersByTime(6000);
    expect(count).toBe(1);
  });

  it('clears the auto-dismiss timer on destroy without emitting', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    fixture.destroy();
    vi.advanceTimersByTime(6000);
    expect(count).toBe(0);
  });
});
