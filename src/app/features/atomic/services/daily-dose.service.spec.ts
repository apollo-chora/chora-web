import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { DailyDoseService, MAX_COMBO_TIER } from './daily-dose.service';
import { environment } from '../../../../environments/environment';

function buildDoseResponse() {
  return {
    cards: [
      {
        atom: {
          id: 'atom-001', tenant_id: 't1', atom_type: 'multiple_choice', difficulty: 2,
          language_code: 'en', tags: ['math'], status: 'published', created_by: 'g1',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          latest_revision: {
            id: 'rev-001', atom_id: 'atom-001', revision_number: 1,
            content: { stem: 'What is 2+2?', options: [{ id: 1, text: '4' }] },
            validation_rules: [], published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
          },
        },
        topic_label: 'Arithmetic',
        estimated_seconds: 60,
        is_goal_aligned: true,
        source: 'ebbinghaus' as const,
      },
      {
        atom: {
          id: 'atom-002', tenant_id: 't1', atom_type: 'true_false', difficulty: 1,
          language_code: 'en', tags: ['science'], status: 'published', created_by: 'g1',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          latest_revision: {
            id: 'rev-002', atom_id: 'atom-002', revision_number: 1,
            content: { stem: 'The sun is a star.' },
            validation_rules: [], published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
          },
        },
        topic_label: 'Astronomy',
        estimated_seconds: 30,
        is_goal_aligned: false,
        source: 'curiosity' as const,
      },
      {
        atom: {
          id: 'atom-003', tenant_id: 't1', atom_type: 'fill_blank', difficulty: 3,
          language_code: 'en', tags: ['english'], status: 'published', created_by: 'g1',
          created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
          latest_revision: {
            id: 'rev-003', atom_id: 'atom-003', revision_number: 1,
            content: { stem: 'Fill: ___', blanks: ['answer'] },
            validation_rules: [], published_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z',
          },
        },
        topic_label: 'Grammar',
        estimated_seconds: 90,
        is_goal_aligned: true,
        source: 'weakness' as const,
      },
    ],
  };
}

describe('DailyDoseService', () => {
  let service: DailyDoseService;
  let httpMock: HttpTestingController;
  // M14.iter5.B — BFF path is /api/familiar/daily-dose (registered by
  // chora-gateway phyllis_handler.go and fanned out to chora-consumption).
  // The legacy /api/v1/engagement/daily-dose was a wave-2 placeholder that
  // never landed.
  const doseUrl = `${environment.bffBaseUrl}/api/familiar/daily-dose`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        DailyDoseService,
      ],
    });
    service = TestBed.inject(DailyDoseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // -----------------------------------------------------------------------
  // Initial state
  // -----------------------------------------------------------------------

  it('starts with idle state', () => {
    expect(service.doseState().status).toBe('idle');
    expect(service.cards()).toEqual([]);
    expect(service.currentIndex()).toBe(0);
    expect(service.combo()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // loadDailyDose
  // -----------------------------------------------------------------------

  it('sets loading state when loading', () => {
    service.loadDailyDose().subscribe();
    expect(service.doseState().status).toBe('loading');
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());
  });

  it('sets success state with cards on load', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    expect(service.doseState().status).toBe('success');
    expect(service.cards().length).toBe(3);
    expect(service.totalCards()).toBe(3);
  });

  it('sets error state on load failure', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).error(new ProgressEvent('error'));

    expect(service.doseState().status).toBe('error');
  });

  it('maps card fields correctly', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    const card = service.cards()[0];
    expect(card.topic_label).toBe('Arithmetic');
    expect(card.estimated_seconds).toBe(60);
    expect(card.is_goal_aligned).toBe(true);
    expect(card.source).toBe('ebbinghaus');
  });

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------

  it('starts at index 0', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    expect(service.currentIndex()).toBe(0);
    expect(service.currentCard()?.topic_label).toBe('Arithmetic');
  });

  it('navigates to next card', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.nextCard();
    expect(service.currentIndex()).toBe(1);
    expect(service.currentCard()?.topic_label).toBe('Astronomy');
  });

  it('navigates to previous card', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.nextCard();
    service.previousCard();
    expect(service.currentIndex()).toBe(0);
  });

  it('does not go below 0', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.previousCard();
    expect(service.currentIndex()).toBe(0);
  });

  it('does not go past last card', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.nextCard();
    service.nextCard();
    service.nextCard(); // should not go to 3
    expect(service.currentIndex()).toBe(2);
  });

  it('goToCard navigates directly', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.goToCard(2);
    expect(service.currentIndex()).toBe(2);
    expect(service.currentCard()?.topic_label).toBe('Grammar');
  });

  it('hasNext/hasPrevious reflect position', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    expect(service.hasPrevious()).toBe(false);
    expect(service.hasNext()).toBe(true);

    service.goToCard(2);
    expect(service.hasPrevious()).toBe(true);
    expect(service.hasNext()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Combo + XP
  // -----------------------------------------------------------------------

  it('increments combo on correct answer', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10);
    expect(service.combo()).toBe(2);
  });

  it('caps combo at MAX_COMBO_TIER', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10); // 2x
    service.recordCorrect(10); // 3x
    service.recordCorrect(10); // 4x (max)
    service.recordCorrect(10); // still 4x
    expect(service.combo()).toBe(MAX_COMBO_TIER);
  });

  it('accumulates XP with combo multiplier', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10); // combo becomes 2, xp = 10 * 2 = 20
    service.recordCorrect(10); // combo becomes 3, xp = 20 + 10 * 3 = 50
    expect(service.xpEarned()).toBe(50);
  });

  it('resets combo on incorrect answer', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10); // 2x
    service.recordIncorrect();
    expect(service.combo()).toBe(1);
  });

  it('tracks completed count', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10);
    service.recordIncorrect();
    expect(service.completedCount()).toBe(2);
  });

  it('isComplete when all cards done', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    expect(service.isComplete()).toBe(false);
    service.recordCorrect(10);
    service.recordCorrect(10);
    service.recordCorrect(10);
    expect(service.isComplete()).toBe(true);
  });

  it('progress reflects completed ratio', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    expect(service.progress()).toBe(0);
    service.recordCorrect(10);
    expect(service.progress()).toBeCloseTo(1 / 3);
  });

  // -----------------------------------------------------------------------
  // State reset
  // -----------------------------------------------------------------------

  it('resetState returns to idle', () => {
    service.loadDailyDose().subscribe();
    httpMock.expectOne(doseUrl).flush(buildDoseResponse());

    service.recordCorrect(10);
    service.nextCard();

    service.resetState();

    expect(service.doseState().status).toBe('idle');
    expect(service.currentIndex()).toBe(0);
    expect(service.combo()).toBe(1);
    expect(service.xpEarned()).toBe(0);
    expect(service.completedCount()).toBe(0);
  });
});
