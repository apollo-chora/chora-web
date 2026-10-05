import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, NEVER } from 'rxjs';
import { ExamFinalPrepComponent } from './exam-final-prep.component';
import { BffClientService } from '../../../../core/services/bff-client.service';
import { ActivatedRoute } from '@angular/router';

describe('ExamFinalPrepComponent', () => {
  let fixture: ComponentFixture<ExamFinalPrepComponent>;
  let component: ExamFinalPrepComponent;
  let element: HTMLElement;
  let bffMock: { get: ReturnType<typeof vi.fn> };

  const prepData = {
    examName: 'Algebra Final',
    examDate: '2026-04-15',
    atoms: [
      { id: 'a1', title: 'Quadratics', topic: 'Algebra', confidence: 'low' as const, reviewed: false },
      { id: 'a2', title: 'Linear Equations', topic: 'Algebra', confidence: 'high' as const, reviewed: true },
    ],
    familiarMessage: 'Great job reviewing!',
  };

  beforeEach(async () => {
    bffMock = { get: vi.fn().mockReturnValue(of(prepData)) };

    await TestBed.configureTestingModule({
      imports: [ExamFinalPrepComponent],
      providers: [
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => 'exam-002' } } },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExamFinalPrepComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should display exam name and review progress', () => {
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="exam-name"]')?.textContent?.trim()).toBe('Algebra Final');
    expect(element.querySelector('[data-testid="review-progress"]')?.textContent?.trim()).toContain('1 of 2');
  });

  it('should mark atom as reviewed', () => {
    fixture.detectChanges();
    component.markReviewed('a1');
    fixture.detectChanges();

    expect(component.reviewedCount()).toBe(2);
    expect(component.allReviewed()).toBe(true);
  });

  it('should show error on API failure', () => {
    bffMock.get.mockReturnValue(throwError(() => new Error('Failed')));
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="prep-error"]')).toBeTruthy();
  });

  it('should fall back to default error message when error has no message', () => {
    // error handler: err?.message ?? 'Failed to load preparation data'
    // `??` fallback arm — err present but without a `message` property
    bffMock.get.mockReturnValue(throwError(() => ({})));
    fixture.detectChanges();

    expect(component.error()).toBe('Failed to load preparation data');
    expect(element.querySelector('[data-testid="prep-error"]')?.textContent?.trim())
      .toContain('Failed to load preparation data');
  });

  it('should error when no exam ID is provided (falsy examId guard)', async () => {
    // loadPrepData: examId ?? '' then `if (!examId)` TRUE arm — empty id
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ExamFinalPrepComponent],
      providers: [
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '' } } },
        },
      ],
    }).compileComponents();

    const localFixture = TestBed.createComponent(ExamFinalPrepComponent);
    const localComponent = localFixture.componentInstance;
    localFixture.detectChanges();

    expect(localComponent.error()).toBe('No exam ID provided');
    expect(localComponent.loading()).toBe(false);
    // bff.get must NOT be called when examId is empty
    expect(bffMock.get).not.toHaveBeenCalled();
  });

  it('should error when paramMap returns null examId (?? fallback arm)', async () => {
    // examId = this.route.snapshot.paramMap.get(...) ?? '' — get returns null
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ExamFinalPrepComponent],
      providers: [
        { provide: BffClientService, useValue: bffMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => null } } },
        },
      ],
    }).compileComponents();

    const localFixture = TestBed.createComponent(ExamFinalPrepComponent);
    const localComponent = localFixture.componentInstance;
    localFixture.detectChanges();

    expect(localComponent.error()).toBe('No exam ID provided');
    expect(bffMock.get).not.toHaveBeenCalled();
  });

  it('markReviewed returns early when prepData is null (!data guard)', () => {
    // markReviewed: `if (!data) return` TRUE arm — never loaded successfully
    bffMock.get.mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();

    expect(component.prepData()).toBeNull();
    // should be a no-op and not throw
    component.markReviewed('a1');
    expect(component.prepData()).toBeNull();
  });

  it('computed counts return 0 when prepData is null', () => {
    // reviewedCount / totalCount `data ? ... : 0` FALSE arm
    // allReviewed `data !== null` short-circuit FALSE arm
    bffMock.get.mockReturnValue(throwError(() => new Error('boom')));
    fixture.detectChanges();

    expect(component.prepData()).toBeNull();
    expect(component.reviewedCount()).toBe(0);
    expect(component.totalCount()).toBe(0);
    expect(component.allReviewed()).toBe(false);
  });

  it('allReviewed is false when atoms array is empty (length > 0 arm)', () => {
    // allReviewed: data.atoms.length > 0 FALSE arm — non-null data, no atoms
    bffMock.get.mockReturnValue(of({
      examName: 'Empty Exam',
      examDate: '2026-05-01',
      atoms: [],
      familiarMessage: 'Nothing to review',
    }));
    fixture.detectChanges();

    expect(component.totalCount()).toBe(0);
    expect(component.allReviewed()).toBe(false);
    // @for loop EMPTY case — no atom cards rendered; complete banner hidden
    expect(element.querySelector('[data-testid="atom-list"]')?.children.length).toBe(0);
    expect(element.querySelector('[data-testid="prep-complete"]')).toBeFalsy();
  });

  it('shows completion banner when every atom is reviewed (allReviewed TRUE arm)', () => {
    // @if (allReviewed()) TRUE branch — prep-complete renders familiarMessage
    bffMock.get.mockReturnValue(of({
      examName: 'Done Exam',
      examDate: '2026-06-01',
      atoms: [
        { id: 'd1', title: 'A', topic: 'T', confidence: 'high' as const, reviewed: true },
        { id: 'd2', title: 'B', topic: 'T', confidence: 'medium' as const, reviewed: true },
      ],
      familiarMessage: 'All set!',
    }));
    fixture.detectChanges();

    expect(component.allReviewed()).toBe(true);
    const complete = element.querySelector('[data-testid="prep-complete"]');
    expect(complete).toBeTruthy();
    expect(complete?.textContent).toContain('All set!');
  });

  it('renders the loading state while the request is pending', () => {
    // loading() TRUE branch of template — Observable that never emits
    bffMock.get.mockReturnValue(NEVER);
    fixture.detectChanges();

    expect(component.loading()).toBe(true);
    expect(element.querySelector('[data-testid="prep-loading"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="prep-header"]')).toBeFalsy();
  });

  it('clears stale error and reloads on retry (loadPrepData re-entry)', () => {
    // first load fails -> error set; retry succeeds -> error cleared, data shown
    bffMock.get.mockReturnValueOnce(throwError(() => new Error('first fail')));
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="prep-error"]')).toBeTruthy();

    bffMock.get.mockReturnValue(of(prepData));
    component.loadPrepData();
    fixture.detectChanges();

    expect(component.error()).toBe('');
    expect(element.querySelector('[data-testid="prep-header"]')).toBeTruthy();
  });
});
