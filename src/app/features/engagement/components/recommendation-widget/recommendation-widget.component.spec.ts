import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { RecommendationWidgetComponent } from './recommendation-widget.component';
import { RecommendationService } from '../../services/recommendation.service';
import type {
  RecommendationState,
  RecommendedAtom,
} from '../../services/recommendation.service';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildRecommendations(): RecommendedAtom[] {
  return [
    {
      atom_id: 'atom-001',
      score: 95,
      reason: 'High relevance to recent activity',
      topic_name: 'Algebra',
      difficulty: 'intermediate',
    },
    {
      atom_id: 'atom-002',
      score: 82,
      reason: 'Prerequisite for your goal',
      topic_name: 'Calculus',
      difficulty: 'advanced',
    },
    {
      atom_id: 'atom-003',
      score: 70,
      reason: 'Curiosity-driven suggestion',
      topic_name: 'Geometry',
      difficulty: 'beginner',
    },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RecommendationWidgetComponent', () => {
  let fixture: ComponentFixture<RecommendationWidgetComponent>;
  let component: RecommendationWidgetComponent;
  let element: HTMLElement;

  const recommendations = buildRecommendations();

  const mockRecommendationState = signal<RecommendationState>({ status: 'idle' });
  const recommendationsSignal = signal<RecommendedAtom[]>([]);

  const mockService = {
    recommendationState: mockRecommendationState.asReadonly(),
    recommendations: recommendationsSignal.asReadonly(),
    loadRecommendations: vi.fn().mockReturnValue(of(null)),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };
  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRecommendationState.set({ status: 'success', data: { recommendations, governance: {} } });
    recommendationsSignal.set(recommendations);

    await TestBed.configureTestingModule({
      imports: [RecommendationWidgetComponent],
      providers: [
        { provide: RecommendationService, useValue: mockService },
        { provide: Router, useValue: mockRouter },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecommendationWidgetComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Rendering — success state
  // -------------------------------------------------------------------------

  it('renders the recommendation widget container', () => {
    expect(element.querySelector('[data-testid="recommendation-widget"]')).toBeTruthy();
  });

  it('renders recommendation cards', () => {
    const cards = element.querySelectorAll('[data-testid^="recommendation-card-"]');
    expect(cards.length).toBe(3);
  });

  it('displays topic name and score', () => {
    const topic = element.querySelector('[data-testid="recommendation-topic"]');
    expect(topic?.textContent).toContain('Algebra');

    const score = element.querySelector('[data-testid="recommendation-score"]');
    expect(score?.textContent).toContain('95');
  });

  it('displays difficulty badges', () => {
    const badges = element.querySelectorAll('[data-testid="recommendation-difficulty"]');
    expect(badges.length).toBe(3);
    expect(badges[0].textContent).toContain('intermediate');
    expect(badges[1].textContent).toContain('advanced');
    expect(badges[2].textContent).toContain('beginner');
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading state', () => {
    mockRecommendationState.set({ status: 'loading' });
    recommendationsSignal.set([]);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="recommendation-loading"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  it('shows empty state when no recommendations', () => {
    mockRecommendationState.set({ status: 'success', data: { recommendations: [], governance: {} } });
    recommendationsSignal.set([]);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="recommendation-empty"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error state', () => {
    mockRecommendationState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    recommendationsSignal.set([]);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="recommendation-error"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('navigates to atom on card click', () => {
    const card = element.querySelector('[data-testid="recommendation-card-atom-001"]') as HTMLElement;
    card.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/atoms', 'atom-001']);
  });

  // -------------------------------------------------------------------------
  // Component logic
  // -------------------------------------------------------------------------

  it('returns correct difficulty class', () => {
    expect(component.difficultyClass('beginner')).toBe('recommendation-widget__badge--beginner');
    expect(component.difficultyClass('expert')).toBe('recommendation-widget__badge--expert');
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has region role with aria-label', () => {
    const container = element.querySelector('[data-testid="recommendation-widget"]');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('Personalized Recommendations');
  });

  it('passes axe-core accessibility checks', async () => {
    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});
