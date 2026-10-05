import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, Observable } from 'rxjs';
import { ExamDayConfidenceSummaryComponent } from './exam-day-summary.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('ExamDayConfidenceSummaryComponent', () => {
  let fixture: ComponentFixture<ExamDayConfidenceSummaryComponent>;
  let component: ExamDayConfidenceSummaryComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const summaryData = {
    examName: 'Go Certification Final',
    examDate: '2026-04-01',
    examTime: '09:00 AM',
    venue: 'Room 301',
    atomsCompleted: 120,
    mockExamsTaken: 3,
    hoursStudied: 45,
    readinessPercent: 82,
    familiarName: 'Spark',
    familiarMessage: 'You are well prepared!',
    familiarAvatarUrl: '/assets/familiar.png',
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(summaryData)) };

    await TestBed.configureTestingModule({
      imports: [ExamDayConfidenceSummaryComponent],
      providers: [
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'exam-001' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExamDayConfidenceSummaryComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display exam name and readiness after load', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="exam-title"]')?.textContent?.trim()).toBe('Go Certification Final');
    expect(element.querySelector('[data-testid="readiness-percent"]')?.textContent?.trim()).toContain('82%');
  });

  it('should show error on API failure', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Server error')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="summary-error"]')).toBeTruthy();
  });

  // ---------------------------------------------------------------------------
  // Branch-coverage augmentation. Each block below rebuilds the TestBed so the
  // ActivatedRoute paramMap + BffClient stub can vary per scenario, driving the
  // currently-uncovered conditional arms of the component + template.
  // ---------------------------------------------------------------------------

  type ScenarioOpts = {
    examId: string | null;
    response?: Observable<unknown>;
  };

  async function buildScenario(opts: ScenarioOpts): Promise<{
    fixture: ComponentFixture<ExamDayConfidenceSummaryComponent>;
    component: ExamDayConfidenceSummaryComponent;
    element: HTMLElement;
    getSpy: ReturnType<typeof vi.fn>;
  }> {
    TestBed.resetTestingModule();
    const getSpy = vi
      .fn()
      .mockReturnValue(opts.response ?? of(summaryData));
    await TestBed.configureTestingModule({
      imports: [ExamDayConfidenceSummaryComponent],
      providers: [
        { provide: BffClientService, useValue: { get: getSpy } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => opts.examId } },
          },
        },
      ],
    }).compileComponents();

    const f = TestBed.createComponent(ExamDayConfidenceSummaryComponent);
    return {
      fixture: f,
      component: f.componentInstance,
      element: f.nativeElement as HTMLElement,
      getSpy,
    };
  }

  describe('missing exam id (early-return guard)', () => {
    it('should set the error, skip the HTTP call and render the error block when examId resolves to empty', async () => {
      // paramMap.get -> null => `?? ''` fallback => `if (!examId)` true arm.
      const { fixture, component, element, getSpy } = await buildScenario({
        examId: null,
      });
      fixture.detectChanges();

      expect(component.error()).toBe('No exam ID provided');
      expect(component.loading()).toBe(false);
      expect(component.summary()).toBeNull();
      expect(getSpy).not.toHaveBeenCalled();

      // @else if (error()) renders; loading + card arms do not.
      expect(element.querySelector('[data-testid="summary-error"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="summary-loading"]')).toBeNull();
      expect(element.querySelector('[data-testid="summary-card"]')).toBeNull();
    });

    it('should return the fixed gauge fallback while summary() is null (gaugeDash !s arm)', async () => {
      const { fixture, component } = await buildScenario({ examId: null });
      fixture.detectChanges();

      expect(component.gaugeDash()).toBe('0 326.73');
    });
  });

  describe('loading state', () => {
    it('should render the loading block while the request has not yet emitted (loading() true arm)', async () => {
      // A never-emitting observable keeps loading() true.
      const { fixture, component, element } = await buildScenario({
        examId: 'exam-1',
        response: new Observable<never>(() => {}),
      });
      fixture.detectChanges();

      expect(component.loading()).toBe(true);
      expect(element.querySelector('[data-testid="summary-loading"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="summary-error"]')).toBeNull();
      expect(element.querySelector('[data-testid="summary-card"]')).toBeNull();
    });
  });

  describe('gauge computation with data (gaugeDash s arm)', () => {
    it('should compute the filled dash from readinessPercent', async () => {
      const { fixture, component } = await buildScenario({
        examId: 'exam-1',
        response: of({ ...summaryData, readinessPercent: 50 }),
      });
      fixture.detectChanges();

      const circumference = 2 * Math.PI * 52;
      const filled = (50 / 100) * circumference;
      expect(component.gaugeDash()).toBe(`${filled} ${circumference}`);
    });
  });

  describe('logistics + avatar rendering (template conditional arms)', () => {
    it('should hide logistics and avatar when venue/date/time/avatar are all empty (false arms)', async () => {
      const { fixture, element } = await buildScenario({
        examId: 'exam-1',
        response: of({
          ...summaryData,
          venue: '',
          examDate: '',
          examTime: '',
          familiarAvatarUrl: '',
        }),
      });
      fixture.detectChanges();

      // venue('') || examDate('') => both falsy => logistics block absent.
      expect(element.querySelector('[data-testid="exam-logistics"]')).toBeNull();
      // familiarAvatarUrl('') falsy => avatar absent; message block still renders.
      expect(element.querySelector('[data-testid="familiar-avatar"]')).toBeNull();
      expect(element.querySelector('[data-testid="familiar-message"]')).toBeTruthy();
    });

    it('should render only the date when venue/time are empty but date is set (|| right operand)', async () => {
      const { fixture, element } = await buildScenario({
        examId: 'exam-1',
        response: of({
          ...summaryData,
          venue: '',
          examTime: '',
          examDate: '2026-08-02',
        }),
      });
      fixture.detectChanges();

      const logistics = element.querySelector('[data-testid="exam-logistics"]');
      expect(logistics).toBeTruthy();
      expect(logistics?.textContent).toContain('2026-08-02');
      // examTime('') + venue('') sub-@if false arms: labels absent.
      expect(logistics?.textContent).not.toContain('Time:');
      expect(logistics?.textContent).not.toContain('Venue:');
    });

    it('should render only the venue when date/time are empty (|| left operand)', async () => {
      const { fixture, element } = await buildScenario({
        examId: 'exam-1',
        response: of({
          ...summaryData,
          examDate: '',
          examTime: '',
          venue: 'Room 9',
        }),
      });
      fixture.detectChanges();

      const logistics = element.querySelector('[data-testid="exam-logistics"]');
      expect(logistics).toBeTruthy();
      expect(logistics?.textContent).toContain('Room 9');
      expect(logistics?.textContent).not.toContain('Date:');
      expect(logistics?.textContent).not.toContain('Time:');
    });
  });

  describe('error path nullish-coalescing fallback', () => {
    it('should use the literal default when the thrown error has no message (?? fallback arm)', async () => {
      // Throw a message-less object so `err?.message` is undefined and the
      // `?? 'Failed to load exam summary'` fallback fires.
      const { fixture, component, element } = await buildScenario({
        examId: 'exam-1',
        response: throwError(() => ({}) as { message?: string }),
      });
      fixture.detectChanges();

      expect(component.loading()).toBe(false);
      expect(component.error()).toBe('Failed to load exam summary');
      const errorEl = element.querySelector('[data-testid="summary-error"]');
      expect(errorEl?.textContent?.trim()).toBe('Failed to load exam summary');
    });

    it('should surface a present error message (err?.message ?? ... through arm)', async () => {
      const { fixture, component } = await buildScenario({
        examId: 'exam-1',
        response: throwError(() => new Error('Network down')),
      });
      fixture.detectChanges();

      expect(component.error()).toBe('Network down');
      expect(component.summary()).toBeNull();
    });
  });
});
