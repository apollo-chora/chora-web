import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { DailyDoseComponent } from './daily-dose.component';
import { DailyDoseService } from '../../services/daily-dose.service';
import type {
  DailyDoseState, DailyDoseCard, ComboTier, LearningAtom,
} from '../../models/atom.models';
import { LandingService } from '../../../../core/auth/landing.service';
/**
 * C2 slice 3 (ADR-240): this screen no longer decides where an authenticated
 * session lands. It asks `LandingService`, the ONE landing resolver, and uses
 * whatever comes back. The stub returns a sentinel no hard-coded fallback
 * could ever produce, so this asserts DELEGATION rather than re-testing the
 * resolver's rules (those live in `core/auth/landing.service.spec.ts`).
 */
const RESOLVED_LANDING = '/resolved-landing';
const landingStub = { landingRoute: () => RESOLVED_LANDING };


function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    id: 'atom-001', tenant_id: 't1', atom_type: 'multiple_choice', difficulty: 2,
    language_code: 'en', tags: ['math'], status: 'published', created_by: 'g1',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    latest_revision: {
      id: 'rev-001', atom_id: 'atom-001', revision_number: 1,
      content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4' }] },
      validation_rules: [], published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function buildCard(index: number): DailyDoseCard {
  return {
    atom: buildAtom({ id: `atom-${index}` }),
    topic_label: `Topic ${index}`,
    estimated_seconds: 60 * (index + 1),
    is_goal_aligned: index % 2 === 0,
    source: (['ebbinghaus', 'curiosity', 'weakness'] as const)[index % 3],
  };
}

describe('DailyDoseComponent', () => {
  let fixture: ComponentFixture<DailyDoseComponent>;
  let component: DailyDoseComponent;
  let element: HTMLElement;

  const cards = [buildCard(0), buildCard(1), buildCard(2)];

  const mockDoseState = signal<DailyDoseState>({ status: 'idle' });
  const mockCurrentIndex = signal(0);
  const mockCombo = signal<ComboTier>(1);
  const mockXpEarned = signal(0);
  const mockCompletedCount = signal(0);

  const mockHasNext = signal(true);
  const mockHasPrevious = signal(false);
  const mockIsComplete = signal(false);

  const mockDoseService = {
    doseState: mockDoseState.asReadonly(),
    cards: signal(cards).asReadonly(),
    currentIndex: mockCurrentIndex.asReadonly(),
    currentCard: signal(cards[0]).asReadonly(),
    totalCards: signal(3).asReadonly(),
    hasNext: mockHasNext.asReadonly(),
    hasPrevious: mockHasPrevious.asReadonly(),
    combo: mockCombo.asReadonly(),
    xpEarned: mockXpEarned.asReadonly(),
    completedCount: mockCompletedCount.asReadonly(),
    isComplete: mockIsComplete.asReadonly(),
    progress: signal(0).asReadonly(),
    loadDailyDose: vi.fn().mockReturnValue(of(null)),
    nextCard: vi.fn(),
    previousCard: vi.fn(),
    goToCard: vi.fn(),
    recordCorrect: vi.fn(),
    recordIncorrect: vi.fn(),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockDoseState.set({ status: 'success', session: { cards, combo: 1, xp_earned: 0, completed_count: 0 } });
    mockCurrentIndex.set(0);
    mockCombo.set(1);
    mockHasNext.set(true);
    mockHasPrevious.set(false);
    mockIsComplete.set(false);

    await TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        { provide: DailyDoseService, useValue: mockDoseService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DailyDoseComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  it('loads daily dose on init', () => {
    expect(mockDoseService.loadDailyDose).toHaveBeenCalled();
  });

  it('renders daily-dose container', () => {
    expect(element.querySelector('[data-testid="daily-dose"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it('shows loading state', () => {
    mockDoseState.set({ status: 'loading' });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="dose-loading"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it('shows error state', () => {
    mockDoseState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="dose-error"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Success state — card display
  // -----------------------------------------------------------------------

  it('renders current card', () => {
    expect(element.querySelector('[data-testid="dose-current-card"]')).toBeTruthy();
  });

  it('shows card topic label', () => {
    const topic = element.querySelector('[data-testid="card-topic"]');
    expect(topic?.textContent?.trim()).toBe('Topic 0');
  });

  it('shows card title from stem', () => {
    const title = element.querySelector('[data-testid="card-title"]');
    expect(title?.textContent?.trim()).toContain('What is 2+2?');
  });

  it('shows estimated time', () => {
    const time = element.querySelector('[data-testid="card-time"]');
    expect(time?.textContent?.trim()).toBe('~1 min');
  });

  it('shows goal indicator when goal-aligned', () => {
    expect(element.querySelector('[data-testid="card-goal-indicator"]')).toBeTruthy();
  });

  it('shows source indicator', () => {
    const source = element.querySelector('[data-testid="card-source"]');
    expect(source).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  it('shows card counter', () => {
    const counter = element.querySelector('[data-testid="dose-counter"]');
    expect(counter?.textContent?.trim()).toBe('1 / 3');
  });

  it('calls nextCard on next button click', () => {
    const btn = element.querySelector('[data-testid="dose-next-btn"]') as HTMLElement;
    btn.click();
    expect(mockDoseService.nextCard).toHaveBeenCalled();
  });

  it('calls previousCard on prev button click', () => {
    mockHasPrevious.set(true);
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="dose-prev-btn"]') as HTMLElement;
    btn.click();
    expect(mockDoseService.previousCard).toHaveBeenCalled();
  });

  it('navigates to player on start button', () => {
    const btn = element.querySelector('[data-testid="dose-start-btn"]') as HTMLElement;
    btn.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-0']);
  });

  it('navigates to player on card body click', () => {
    const body = element.querySelector('[data-testid="card-body"]') as HTMLElement;
    body.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-0']);
  });

  // -----------------------------------------------------------------------
  // Keyboard navigation
  // -----------------------------------------------------------------------

  it('calls nextCard on ArrowRight key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(mockDoseService.nextCard).toHaveBeenCalled();
  });

  it('calls previousCard on ArrowLeft key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(mockDoseService.previousCard).toHaveBeenCalled();
  });

  it('opens atom on Enter key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-0']);
  });

  it('exits dose on Escape key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(mockRouter.navigate).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  // -----------------------------------------------------------------------
  // Combo meter
  // -----------------------------------------------------------------------

  it('renders combo meter', () => {
    expect(element.querySelector('[data-testid="combo-meter"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Progress
  // -----------------------------------------------------------------------

  it('renders progress bar', () => {
    expect(element.querySelector('[data-testid="dose-progress"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Exit
  // -----------------------------------------------------------------------

  it('exits to the landing on close button', () => {
    const btn = element.querySelector('[data-testid="dose-close-btn"]') as HTMLElement;
    btn.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  it('resets state on destroy', () => {
    component.ngOnDestroy();
    expect(mockDoseService.resetState).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it('has region role with aria-label', () => {
    const container = element.querySelector('[data-testid="daily-dose"]');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('DailyDose');
  });

  it('card body is keyboard accessible', () => {
    const body = element.querySelector('[data-testid="card-body"]');
    expect(body?.getAttribute('tabindex')).toBe('0');
    expect(body?.getAttribute('role')).toBe('button');
  });

  it('nav has aria-label', () => {
    const nav = element.querySelector('[data-testid="dose-nav"]');
    expect(nav?.getAttribute('aria-label')).toBe('Card navigation');
  });
});

// ===========================================================================
// Additional coverage — flexible mock with writable signals so per-test
// state (currentCard, source, atom_type, isComplete, progress, nav-flags)
// can be flipped to exercise computeds + uncovered template branches +
// keyboard/touch handlers. Uses global Vitest API per repo house style.
// ===========================================================================

function buildAtomFor(
  atomType: LearningAtom['atom_type'],
  content: Record<string, unknown>,
): LearningAtom {
  return {
    id: 'atom-x', tenant_id: 't1', atom_type: atomType, difficulty: 2,
    language_code: 'en', tags: [], status: 'published', created_by: 'g1',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    latest_revision: {
      id: 'rev-x', atom_id: 'atom-x', revision_number: 1,
      content: content as never,
      validation_rules: [], published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
    },
  } as LearningAtom;
}

function cardWith(overrides: Partial<DailyDoseCard> = {}): DailyDoseCard {
  return {
    atom: buildAtomFor('multiple_choice', { stem: 'Stem text' }),
    topic_label: 'Flexible Topic',
    estimated_seconds: 60,
    is_goal_aligned: false,
    source: 'ebbinghaus',
    ...overrides,
  };
}

describe('DailyDoseComponent — additional coverage', () => {
  let fixture: ComponentFixture<DailyDoseComponent>;
  let component: DailyDoseComponent;
  let element: HTMLElement;

  // Writable signals controlling the flexible mock.
  const doseStateW = signal<DailyDoseState>({ status: 'success', session: { cards: [], combo: 1, xp_earned: 0, completed_count: 0 } });
  const cardsW = signal<DailyDoseCard[]>([]);
  const currentIndexW = signal(0);
  const currentCardW = signal<DailyDoseCard | null>(null);
  const totalCardsW = signal(0);
  const hasNextW = signal(false);
  const hasPreviousW = signal(false);
  const comboW = signal<ComboTier>(1);
  const xpEarnedW = signal(0);
  const completedCountW = signal(0);
  const isCompleteW = signal(false);
  const progressW = signal(0);

  const flexService = {
    doseState: doseStateW.asReadonly(),
    cards: cardsW.asReadonly(),
    currentIndex: currentIndexW.asReadonly(),
    currentCard: currentCardW.asReadonly(),
    totalCards: totalCardsW.asReadonly(),
    hasNext: hasNextW.asReadonly(),
    hasPrevious: hasPreviousW.asReadonly(),
    combo: comboW.asReadonly(),
    xpEarned: xpEarnedW.asReadonly(),
    completedCount: completedCountW.asReadonly(),
    isComplete: isCompleteW.asReadonly(),
    progress: progressW.asReadonly(),
    loadDailyDose: vi.fn().mockReturnValue(of(null)),
    nextCard: vi.fn(),
    previousCard: vi.fn(),
    goToCard: vi.fn(),
    recordCorrect: vi.fn(),
    recordIncorrect: vi.fn(),
    resetState: vi.fn(),
  };

  const flexRouter = { navigate: vi.fn() };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: a single ebbinghaus MCQ card in success state, mid-progress.
    const card = cardWith();
    doseStateW.set({ status: 'success', session: { cards: [card], combo: 2, xp_earned: 40, completed_count: 1 } });
    cardsW.set([card]);
    currentIndexW.set(0);
    currentCardW.set(card);
    totalCardsW.set(3);
    hasNextW.set(true);
    hasPreviousW.set(true);
    comboW.set(2);
    xpEarnedW.set(40);
    completedCountW.set(1);
    isCompleteW.set(false);
    progressW.set(0.5);

    await TestBed.configureTestingModule({
      imports: [DailyDoseComponent],
      providers: [
        { provide: LandingService, useValue: landingStub },
        { provide: DailyDoseService, useValue: flexService },
        { provide: Router, useValue: flexRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DailyDoseComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // computed: progressPercent
  // -------------------------------------------------------------------------

  it('progressPercent rounds progress * 100', () => {
    progressW.set(0.5);
    expect(component.progressPercent()).toBe(50);
    progressW.set(0.333);
    expect(component.progressPercent()).toBe(33);
  });

  it('progress bar reflects progressPercent value', () => {
    progressW.set(0.75);
    fixture.detectChanges();
    const bar = element.querySelector('[data-testid="dose-progress"]') as HTMLProgressElement;
    expect(bar.getAttribute('aria-valuenow')).toBe('75');
    expect(bar.getAttribute('aria-valuetext')).toBe('75% complete');
  });

  // -------------------------------------------------------------------------
  // computed: currentCardIcon
  // -------------------------------------------------------------------------

  it('currentCardIcon maps atom_type to icon', () => {
    currentCardW.set(cardWith({ atom: buildAtomFor('code', { stem: 'x' }) }));
    expect(component.currentCardIcon()).toBe('code');
    currentCardW.set(cardWith({ atom: buildAtomFor('essay', { stem: 'x' }) }));
    expect(component.currentCardIcon()).toBe('article');
  });

  it('currentCardIcon is empty string when no current card', () => {
    currentCardW.set(null);
    expect(component.currentCardIcon()).toBe('');
  });

  // -------------------------------------------------------------------------
  // computed: estimatedTime
  // -------------------------------------------------------------------------

  it('estimatedTime returns ~1 min for <= 60s', () => {
    currentCardW.set(cardWith({ estimated_seconds: 45 }));
    expect(component.estimatedTime()).toBe('~1 min');
  });

  it('estimatedTime ceilings minutes for > 60s', () => {
    currentCardW.set(cardWith({ estimated_seconds: 150 }));
    expect(component.estimatedTime()).toBe('~3 min');
  });

  it('estimatedTime is empty string when no current card', () => {
    currentCardW.set(null);
    expect(component.estimatedTime()).toBe('');
  });

  // -------------------------------------------------------------------------
  // getSourceIcon — all three branches
  // -------------------------------------------------------------------------

  it('getSourceIcon maps ebbinghaus to history', () => {
    expect(component.getSourceIcon(cardWith({ source: 'ebbinghaus' }))).toBe('history');
  });

  it('getSourceIcon maps curiosity to explore', () => {
    expect(component.getSourceIcon(cardWith({ source: 'curiosity' }))).toBe('explore');
  });

  it('getSourceIcon maps weakness to fitness_center', () => {
    expect(component.getSourceIcon(cardWith({ source: 'weakness' }))).toBe('fitness_center');
  });

  // -------------------------------------------------------------------------
  // Card title fallbacks (stem / front / 'Atom')
  // -------------------------------------------------------------------------

  it('card title falls back to front when stem absent', () => {
    currentCardW.set(cardWith({ atom: buildAtomFor('fill_blank', { front: 'Front side' }) }));
    fixture.detectChanges();
    const title = element.querySelector('[data-testid="card-title"]');
    expect(title?.textContent?.trim()).toContain('Front side');
  });

  it("card title falls back to 'Atom' when neither stem nor front present", () => {
    currentCardW.set(cardWith({ atom: buildAtomFor('matching', { pairs: [] }) }));
    fixture.detectChanges();
    const title = element.querySelector('[data-testid="card-title"]');
    expect(title?.textContent?.trim()).toContain('Atom');
  });

  // -------------------------------------------------------------------------
  // Goal indicator absent when not goal-aligned
  // -------------------------------------------------------------------------

  it('hides goal indicator when card is not goal-aligned', () => {
    currentCardW.set(cardWith({ is_goal_aligned: false }));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="card-goal-indicator"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Completion screen (isComplete)
  // -------------------------------------------------------------------------

  it('renders completion screen when isComplete', () => {
    isCompleteW.set(true);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="dose-complete"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="dose-current-card"]')).toBeNull();
  });

  it('shows xp earned and completed count on completion', () => {
    isCompleteW.set(true);
    xpEarnedW.set(120);
    completedCountW.set(3);
    totalCardsW.set(3);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="stat-xp"]')?.textContent?.trim()).toBe('120');
    expect(element.querySelector('[data-testid="stat-completed"]')?.textContent?.trim()).toBe('3/3');
  });

  it('done button on completion exits to the landing', () => {
    isCompleteW.set(true);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="dose-done-btn"]') as HTMLElement;
    btn.click();
    expect(flexRouter.navigate).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  // -------------------------------------------------------------------------
  // Error-state exit button
  // -------------------------------------------------------------------------

  it('error-state exit button navigates to the landing', () => {
    doseStateW.set({ status: 'error', error: { code: 'E', message: 'boom' } });
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="dose-exit-btn"]') as HTMLElement;
    btn.click();
    expect(flexRouter.navigate).toHaveBeenCalledWith([RESOLVED_LANDING]);
  });

  // -------------------------------------------------------------------------
  // Nav button disabled states
  // -------------------------------------------------------------------------

  it('disables prev button when hasPrevious is false', () => {
    hasPreviousW.set(false);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="dose-prev-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables next button when hasNext is false', () => {
    hasNextW.set(false);
    fixture.detectChanges();
    const btn = element.querySelector('[data-testid="dose-next-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Keyboard — extra keys + guards + default branch
  // -------------------------------------------------------------------------

  it("calls nextCard on 'n' and 'N' keys", () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'N' }));
    expect(flexService.nextCard).toHaveBeenCalledTimes(2);
  });

  it("calls previousCard on 'p' and 'P' keys", () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'P' }));
    expect(flexService.previousCard).toHaveBeenCalledTimes(2);
  });

  it('ignores keydown when target is an input element', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const evt = new KeyboardEvent('keydown', { key: 'ArrowRight' });
    Object.defineProperty(evt, 'target', { value: input });
    component.onKeydown(evt);
    expect(flexService.nextCard).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('ignores keydown when target is a textarea element', () => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const evt = new KeyboardEvent('keydown', { key: 'ArrowLeft' });
    Object.defineProperty(evt, 'target', { value: ta });
    component.onKeydown(evt);
    expect(flexService.previousCard).not.toHaveBeenCalled();
    document.body.removeChild(ta);
  });

  it('does nothing for unhandled keys', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(flexService.nextCard).not.toHaveBeenCalled();
    expect(flexService.previousCard).not.toHaveBeenCalled();
    expect(flexRouter.navigate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Touch / swipe gestures
  // -------------------------------------------------------------------------

  it('swipe left (negative delta beyond threshold) advances to next card', () => {
    component.onTouchStart({ touches: [{ clientX: 300 }] } as unknown as TouchEvent);
    component.onTouchEnd({ changedTouches: [{ clientX: 200 }] } as unknown as TouchEvent);
    expect(flexService.nextCard).toHaveBeenCalled();
    expect(flexService.previousCard).not.toHaveBeenCalled();
  });

  it('swipe right (positive delta beyond threshold) goes to previous card', () => {
    component.onTouchStart({ touches: [{ clientX: 100 }] } as unknown as TouchEvent);
    component.onTouchEnd({ changedTouches: [{ clientX: 220 }] } as unknown as TouchEvent);
    expect(flexService.previousCard).toHaveBeenCalled();
    expect(flexService.nextCard).not.toHaveBeenCalled();
  });

  it('small swipe within threshold does nothing', () => {
    component.onTouchStart({ touches: [{ clientX: 200 }] } as unknown as TouchEvent);
    component.onTouchEnd({ changedTouches: [{ clientX: 210 }] } as unknown as TouchEvent);
    expect(flexService.nextCard).not.toHaveBeenCalled();
    expect(flexService.previousCard).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // openCurrentAtom guard + openAtom passthrough
  // -------------------------------------------------------------------------

  it('openCurrentAtom does nothing when there is no current card', () => {
    currentCardW.set(null);
    component.openCurrentAtom();
    expect(flexRouter.navigate).not.toHaveBeenCalled();
  });

  it('openAtom navigates to the player for the given atom', () => {
    const atom = buildAtomFor('true_false', { stem: 'tf' });
    atom.id = 'atom-tf';
    component.openAtom(atom);
    expect(flexRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-tf']);
  });

  // -------------------------------------------------------------------------
  // trackByCardIndex
  // -------------------------------------------------------------------------

  it('trackByCardIndex returns the index', () => {
    expect(component.trackByCardIndex(0)).toBe(0);
    expect(component.trackByCardIndex(7)).toBe(7);
  });

  // -------------------------------------------------------------------------
  // Card body keyboard activation (Enter / Space)
  // -------------------------------------------------------------------------

  it('opens atom on card body Enter keydown', () => {
    const body = element.querySelector('[data-testid="card-body"]') as HTMLElement;
    body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(flexRouter.navigate).toHaveBeenCalledWith(['/learning', 'player', 'atom-x']);
  });
});
