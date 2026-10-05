import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { NudgePreviewComponent } from './nudge-preview.component';
import { RetentionService } from '../../services/retention.service';
import type {
  NudgeState,
  StreakNudge,
} from '../../services/retention.service';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildNudge(): StreakNudge {
  return {
    nudge_type: 'streak_at_risk',
    message: 'Your 7-day streak ends tonight! Complete one atom to keep it alive.',
    urgency: 'high',
    suggested_atoms: [
      { atom_id: 'atom-200', title: 'Quick Algebra Review', reason: 'Fastest to complete' },
      { atom_id: 'atom-201', title: 'Physics Refresher', reason: 'Weakest topic' },
    ],
    governance: { model_id: 'model-1', agent_id: 'nudger-v1' },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NudgePreviewComponent', () => {
  let fixture: ComponentFixture<NudgePreviewComponent>;
  let component: NudgePreviewComponent;
  let element: HTMLElement;

  const nudge = buildNudge();

  const mockNudgeState = signal<NudgeState>({ status: 'idle' });
  const nudgeSignal = signal<StreakNudge | null>(null);

  const mockService = {
    nudgeState: mockNudgeState.asReadonly(),
    nudge: nudgeSignal.asReadonly(),
    loadNudge: vi.fn().mockReturnValue(of(null)),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };
  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockNudgeState.set({ status: 'success', data: nudge });
    nudgeSignal.set(nudge);

    await TestBed.configureTestingModule({
      imports: [NudgePreviewComponent],
      providers: [
        { provide: RetentionService, useValue: mockService },
        { provide: Router, useValue: mockRouter },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NudgePreviewComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Rendering — success state
  // -------------------------------------------------------------------------

  it('renders the nudge preview container', () => {
    expect(element.querySelector('[data-testid="nudge-preview"]')).toBeTruthy();
  });

  it('displays the nudge message', () => {
    const msgEl = element.querySelector('[data-testid="nudge-message"]');
    expect(msgEl?.textContent).toContain('7-day streak');
  });

  it('displays the urgency icon', () => {
    const iconEl = element.querySelector('[data-testid="nudge-urgency-icon"]');
    expect(iconEl).toBeTruthy();
    expect(iconEl?.textContent).toContain('notifications_active');
  });

  it('displays nudge type badge', () => {
    const typeEl = element.querySelector('[data-testid="nudge-type"]');
    expect(typeEl?.textContent).toContain('streak_at_risk');
  });

  it('renders suggested atoms', () => {
    const suggestionsSection = element.querySelector('[data-testid="nudge-suggestions"]');
    expect(suggestionsSection).toBeTruthy();

    const atomBtns = element.querySelectorAll('[data-testid^="nudge-atom-"]');
    expect(atomBtns.length).toBe(2);
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading state', () => {
    mockNudgeState.set({ status: 'loading' });
    nudgeSignal.set(null);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="nudge-loading"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error state', () => {
    mockNudgeState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    nudgeSignal.set(null);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="nudge-error"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Computed urgency
  // -------------------------------------------------------------------------

  it('returns notifications_active for high urgency', () => {
    expect(component.urgencyIcon()).toBe('notifications_active');
  });

  it('returns notification_important for critical urgency', () => {
    nudgeSignal.set({ ...nudge, urgency: 'critical' });
    expect(component.urgencyIcon()).toBe('notification_important');
  });

  it('returns notifications_none for low urgency', () => {
    nudgeSignal.set({ ...nudge, urgency: 'low' });
    expect(component.urgencyIcon()).toBe('notifications_none');
  });

  it('returns correct urgency CSS class', () => {
    expect(component.urgencyClass()).toBe('nudge-preview__urgency--high');
  });

  it('returns empty string for urgencyClass when no nudge', () => {
    nudgeSignal.set(null);
    expect(component.urgencyClass()).toBe('');
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('navigates to atom on suggested atom click', () => {
    const btn = element.querySelector('[data-testid="nudge-atom-atom-200"]') as HTMLElement;
    btn.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/atoms', 'atom-200']);
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has region role with aria-label', () => {
    const container = element.querySelector('[data-testid="nudge-preview"]');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('Streak Nudge');
  });

  it('passes axe-core accessibility checks', async () => {
    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});
