import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import axe from 'axe-core';
import { GrewEdgeCelebrationComponent } from './grew-edge-celebration.component';
import { TranslateService } from '../../../core/services/translate.service';

// The custom TranslatePipe is KEY-ONLY: the stub echoes the key back so tests
// assert on the i18n key rather than resolved copy.
const mockTranslate = { instant: (key: string) => key };

function configure(): Promise<void> {
  return TestBed.configureTestingModule({
    imports: [GrewEdgeCelebrationComponent],
    providers: [{ provide: TranslateService, useValue: mockTranslate }],
  }).compileComponents();
}

describe('GrewEdgeCelebrationComponent', () => {
  let fixture: ComponentFixture<GrewEdgeCelebrationComponent>;
  let component: GrewEdgeCelebrationComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await configure();
    fixture = TestBed.createComponent(GrewEdgeCelebrationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('conceptLabel', 'Photosynthesis');
    fixture.detectChanges();
  });

  afterEach(() => {
    // Guard against any test that switched to fake timers leaking into the next.
    vi.useRealTimers();
  });

  it('renders the concept label inside the celebration container with the title', () => {
    const root = element.querySelector('[data-testid="grew-celebration"]');
    expect(root).toBeTruthy();
    expect(root?.textContent).toContain('Photosynthesis');
    expect(root?.textContent).toContain('aplus.growth_edges.grew_title');
  });

  it('renders the "+N more" line only when extraCount > 0', () => {
    // Default extraCount is 0 → line hidden.
    expect(element.querySelector('[data-testid="grew-celebration-more"]')).toBeNull();

    fixture.componentRef.setInput('extraCount', 3);
    fixture.detectChanges();

    const more = element.querySelector('[data-testid="grew-celebration-more"]');
    expect(more).toBeTruthy();
    expect(more?.textContent).toContain('+3');
    expect(more?.textContent).toContain('aplus.growth_edges.grew_more');
  });

  it('emits dismissed exactly once when the dismiss button is clicked', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    const btn = element.querySelector(
      '[data-testid="grew-celebration-dismiss"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);

    // A second click must not re-emit.
    btn.click();
    expect(count).toBe(1);
  });

  it('exposes role="status" and aria-live="polite" on the root for screen readers', () => {
    const root = element.querySelector('[data-testid="grew-celebration"]');
    expect(root?.getAttribute('role')).toBe('status');
    expect(root?.getAttribute('aria-live')).toBe('polite');
  });

  it('has no critical or serious accessibility violations', async () => {
    fixture.componentRef.setInput('extraCount', 2);
    fixture.detectChanges();
    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});

describe('GrewEdgeCelebrationComponent — auto-dismiss', () => {
  let fixture: ComponentFixture<GrewEdgeCelebrationComponent>;
  let component: GrewEdgeCelebrationComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    // Compile with real timers, then switch to fake timers BEFORE the component
    // is constructed so the constructor's setTimeout is captured.
    await configure();
    vi.useFakeTimers();
    fixture = TestBed.createComponent(GrewEdgeCelebrationComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    fixture.componentRef.setInput('conceptLabel', 'Photosynthesis');
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
      '[data-testid="grew-celebration-dismiss"]',
    ) as HTMLButtonElement;
    btn.click();
    expect(count).toBe(1);
  });

  it('does not auto-emit after a manual dismiss', () => {
    let count = 0;
    component.dismissed.subscribe(() => (count += 1));

    const btn = element.querySelector(
      '[data-testid="grew-celebration-dismiss"]',
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
