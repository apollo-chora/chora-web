import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import { AtomPlayerComponent } from './atom-player.component';
import { AtomService } from '../../services/atom.service';
import { ContentQualityService } from '../../services/content-quality.service';
import type { ContentQualityState } from '../../services/content-quality.service';
import type {
  LearningAtom, AtomState, ValidationState, ValidationResult,
} from '../../models/atom.models';

function buildAtom(overrides: Partial<LearningAtom> = {}): LearningAtom {
  return {
    id: 'atom-001',
    tenant_id: 'tenant-001',
    atom_type: 'multiple_choice',
    difficulty: 3,
    language_code: 'en',
    tags: ['math'],
    status: 'published',
    created_by: 'gcid-001',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    latest_revision: {
      id: 'rev-001',
      atom_id: 'atom-001',
      revision_number: 1,
      content: {
        stem: 'What is 2+2?',
        options: [{ id: 1, text: '3' }, { id: 2, text: '4' }, { id: 3, text: '5' }],
        hints: ['Think about basic math', 'Count on your fingers'],
      },
      validation_rules: [{ rule_type: 'exact_match', expected: '2', tolerance: null, case_sensitive: false }],
      published_at: '2026-01-01T12:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
    },
    ...overrides,
  };
}

function buildResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    correct: true,
    atom_id: 'atom-001',
    revision_id: 'rev-001',
    explanation: 'Well done!',
    expected_answer: null,
    confidence: null,
    rule_type: 'exact_match',
    ...overrides,
  };
}

describe('AtomPlayerComponent', () => {
  let fixture: ComponentFixture<AtomPlayerComponent>;
  let component: AtomPlayerComponent;
  let element: HTMLElement;

  const mockAtomState = signal<AtomState>({ status: 'idle' });
  const mockValidationState = signal<ValidationState>({ status: 'idle' });

  const mockAtomService = {
    atomState: mockAtomState.asReadonly(),
    validationState: mockValidationState.asReadonly(),
    loadAtom: vi.fn(),
    validateAnswer: vi.fn().mockReturnValue(of(null)),
    resetAtomState: vi.fn(),
    resetValidationState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };

  const mockRoute = {
    snapshot: {
      paramMap: convertToParamMap({ id: 'atom-001' }),
    },
  };

  beforeEach(async () => {
    mockAtomState.set({ status: 'idle' });
    mockValidationState.set({ status: 'idle' });
    vi.clearAllMocks();

    const atom = buildAtom();
    mockAtomService.loadAtom.mockReturnValue(of(atom));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AtomPlayerComponent],
      providers: [
        { provide: AtomService, useValue: mockAtomService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtomPlayerComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
  });

  function initWithAtom(atom: LearningAtom): void {
    mockAtomService.loadAtom.mockReturnValue(of(atom));
    mockAtomState.set({ status: 'success', atom });
    fixture.detectChanges();
  }

  function submitWithResult(result: ValidationResult, atom?: LearningAtom): void {
    initWithAtom(atom ?? buildAtom());
    component.onAnswerChange({ selected_option: 2 });
    mockAtomService.validateAnswer.mockReturnValue(of(result));
    mockValidationState.set({ status: 'success', result });
    component.submitAnswer();
    fixture.detectChanges();
  }

  // -----------------------------------------------------------------------
  // Initialization
  // -----------------------------------------------------------------------

  it('loads atom on init from route param', () => {
    fixture.detectChanges();
    expect(mockAtomService.loadAtom).toHaveBeenCalledWith('atom-001');
  });

  it('shows loading state initially', () => {
    expect(component.phase()).toBe('loading');
  });

  it('transitions to ready phase when atom loads', () => {
    initWithAtom(buildAtom());
    expect(component.phase()).toBe('ready');
  });

  it('transitions to error when atom has no revision', () => {
    const atom = buildAtom({ latest_revision: null });
    mockAtomService.loadAtom.mockReturnValue(of(atom));
    mockAtomState.set({ status: 'success', atom });
    fixture.detectChanges();
    expect(component.phase()).toBe('error');
  });

  // -----------------------------------------------------------------------
  // Ready phase rendering
  // -----------------------------------------------------------------------

  it('renders player header with type badge', () => {
    initWithAtom(buildAtom());
    const badge = element.querySelector('.atom-player__type-badge');
    expect(badge?.textContent?.trim()).toBe('Multiple Choice');
  });

  it('renders close button', () => {
    initWithAtom(buildAtom());
    const btn = element.querySelector('[data-testid="player-close-btn"]');
    expect(btn).toBeTruthy();
  });

  it('renders MCQ renderer for multiple_choice type', () => {
    initWithAtom(buildAtom({ atom_type: 'multiple_choice' }));
    expect(element.querySelector('[data-testid="mcq-renderer"]')).toBeTruthy();
  });

  it('renders true-false renderer for true_false type', () => {
    initWithAtom(buildAtom({ atom_type: 'true_false' }));
    expect(element.querySelector('[data-testid="true-false-renderer"]')).toBeTruthy();
  });

  it('renders fill-blank renderer for fill_blank type', () => {
    initWithAtom(buildAtom({
      atom_type: 'fill_blank',
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { stem: 'Fill in', blanks: ['answer'] },
      },
    }));
    expect(element.querySelector('[data-testid="fill-blank-renderer"]')).toBeTruthy();
  });

  it('renders short-answer renderer for short_answer type', () => {
    initWithAtom(buildAtom({ atom_type: 'short_answer' }));
    expect(element.querySelector('[data-testid="short-answer-renderer"]')).toBeTruthy();
  });

  it('renders code renderer for code type', () => {
    initWithAtom(buildAtom({
      atom_type: 'code',
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { stem: 'Write code', language: 'python' },
      },
    }));
    expect(element.querySelector('[data-testid="code-renderer"]')).toBeTruthy();
  });

  it('renders flashcard renderer as default', () => {
    initWithAtom(buildAtom({
      atom_type: 'matching',
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { front: 'Q', back: 'A' },
      },
    }));
    expect(element.querySelector('[data-testid="flashcard-renderer"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Hints — enhanced (show all revealed hints)
  // -----------------------------------------------------------------------

  it('shows hint button when hints available', () => {
    initWithAtom(buildAtom());
    const btn = element.querySelector('[data-testid="hint-btn"]');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toContain('(2)');
  });

  it('reveals first hint on click', () => {
    initWithAtom(buildAtom());

    const btn = element.querySelector('[data-testid="hint-btn"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();

    const hint0 = element.querySelector('[data-testid="hint-text-0"]');
    expect(hint0?.textContent).toContain('Think about basic math');
  });

  it('shows all previously revealed hints', () => {
    initWithAtom(buildAtom());

    component.requestHint();
    component.requestHint();
    fixture.detectChanges();

    const hint0 = element.querySelector('[data-testid="hint-text-0"]');
    const hint1 = element.querySelector('[data-testid="hint-text-1"]');
    expect(hint0?.textContent).toContain('Think about basic math');
    expect(hint1?.textContent).toContain('Count on your fingers');
  });

  it('shows hint label with number', () => {
    initWithAtom(buildAtom());
    component.requestHint();
    fixture.detectChanges();

    const label = element.querySelector('.atom-player__hint-label');
    expect(label?.textContent).toContain('1');
  });

  it('decrements hint counter', () => {
    initWithAtom(buildAtom());

    component.requestHint();
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="hint-btn"]');
    expect(btn?.textContent).toContain('(1)');
  });

  it('disables hint button when all hints used', () => {
    initWithAtom(buildAtom());

    component.requestHint();
    component.requestHint();
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="hint-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Flashcard submit suppression
  // -----------------------------------------------------------------------

  it('hides submit button for flashcard type', () => {
    initWithAtom(buildAtom({
      atom_type: 'matching', // falls through to flashcard renderer
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { front: 'Q', back: 'A' },
      },
    }));
    expect(element.querySelector('[data-testid="submit-btn"]')).toBeFalsy();
    expect(element.querySelector('[data-testid="player-controls"]')).toBeFalsy();
  });

  it('shows submit button for gradable types', () => {
    initWithAtom(buildAtom({ atom_type: 'multiple_choice' }));
    expect(element.querySelector('[data-testid="submit-btn"]')).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  it('disables submit when no answer selected', () => {
    initWithAtom(buildAtom());

    const btn = element.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('enables submit when answer is set', () => {
    initWithAtom(buildAtom());

    component.onAnswerChange({ selected_option: 2 });
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="submit-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('calls validateAnswer on submit', () => {
    const result = buildResult();
    mockAtomService.validateAnswer.mockReturnValue(of(result));

    initWithAtom(buildAtom());
    component.onAnswerChange({ selected_option: 2 });
    component.submitAnswer();

    expect(mockAtomService.validateAnswer).toHaveBeenCalledWith('atom-001', expect.objectContaining({
      answer: { selected_option: 2 },
      revision_id: 'rev-001',
    }));
  });

  it('transitions to submitted phase after validation', () => {
    submitWithResult(buildResult());
    expect(component.phase()).toBe('submitted');
  });

  it('shows submit spinner while submitting', () => {
    initWithAtom(buildAtom());
    mockValidationState.set({ status: 'submitting' });
    fixture.detectChanges();

    const spinner = element.querySelector('.atom-player__submit-spinner');
    expect(spinner).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Feedback — correct
  // -----------------------------------------------------------------------

  it('shows correct feedback', () => {
    submitWithResult(buildResult({ correct: true, explanation: 'Well done!' }));

    const feedback = element.querySelector('[data-testid="player-feedback"]');
    expect(feedback).toBeTruthy();
    expect(feedback?.classList.contains('atom-player__feedback--correct')).toBe(true);

    const explanation = element.querySelector('[data-testid="feedback-explanation"]');
    expect(explanation?.textContent?.trim()).toBe('Well done!');
  });

  it('shows rule type badge in feedback', () => {
    submitWithResult(buildResult({ rule_type: 'exact_match' }));

    const rule = element.querySelector('[data-testid="feedback-rule-type"]');
    expect(rule?.textContent?.trim()).toBe('Exact Match');
  });

  it('shows AI Graded badge for llm_graded rule', () => {
    submitWithResult(buildResult({ rule_type: 'llm_graded', confidence: 0.85 }));

    const rule = element.querySelector('[data-testid="feedback-rule-type"]');
    expect(rule?.textContent?.trim()).toBe('AI Graded');
  });

  // -----------------------------------------------------------------------
  // Feedback — incorrect + expected answer + try again
  // -----------------------------------------------------------------------

  it('shows incorrect feedback', () => {
    submitWithResult(buildResult({
      correct: false,
      explanation: 'The answer is 4.',
      expected_answer: { selected_option: 2 },
    }));

    const feedback = element.querySelector('[data-testid="player-feedback"]');
    expect(feedback?.classList.contains('atom-player__feedback--incorrect')).toBe(true);
  });

  it('shows expected answer when incorrect', () => {
    submitWithResult(buildResult({
      correct: false,
      expected_answer: { selected_option: 2 },
    }));

    const expected = element.querySelector('[data-testid="feedback-expected"]');
    expect(expected).toBeTruthy();
    const value = element.querySelector('.atom-player__feedback-expected-value');
    expect(value?.textContent).toContain('selected_option');
  });

  it('hides expected answer when correct', () => {
    submitWithResult(buildResult({ correct: true }));

    expect(element.querySelector('[data-testid="feedback-expected"]')).toBeFalsy();
  });

  it('shows Try Again button when incorrect', () => {
    submitWithResult(buildResult({ correct: false }));

    const retryBtn = element.querySelector('[data-testid="feedback-retry-btn"]');
    expect(retryBtn).toBeTruthy();
  });

  it('hides Try Again button when correct', () => {
    submitWithResult(buildResult({ correct: true }));

    expect(element.querySelector('[data-testid="feedback-retry-btn"]')).toBeFalsy();
  });

  it('retryAnswer resets to ready phase and clears answer', () => {
    submitWithResult(buildResult({ correct: false }));

    component.retryAnswer();
    fixture.detectChanges();

    expect(component.phase()).toBe('ready');
    expect(component.currentAnswer()).toBeNull();
    expect(mockAtomService.resetValidationState).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Feedback — AI confidence
  // -----------------------------------------------------------------------

  it('shows AI confidence when present', () => {
    submitWithResult(buildResult({ confidence: 0.72, rule_type: 'llm_graded' }));

    const confidence = element.querySelector('[data-testid="feedback-confidence"]');
    expect(confidence?.textContent).toContain('72%');
  });

  it('hides AI confidence when null', () => {
    submitWithResult(buildResult({ confidence: null }));

    expect(element.querySelector('[data-testid="feedback-confidence"]')).toBeFalsy();
  });

  // -----------------------------------------------------------------------
  // Validation error handling
  // -----------------------------------------------------------------------

  it('shows validation error when submission fails', () => {
    initWithAtom(buildAtom());
    mockValidationState.set({
      status: 'error',
      error: { code: 'VALIDATION_FAILED', message: 'Network error' },
    });
    fixture.detectChanges();

    const errorEl = element.querySelector('[data-testid="validation-error"]');
    expect(errorEl).toBeTruthy();
    expect(errorEl?.textContent).toContain('Network error');
  });

  it('validation error has alert role', () => {
    initWithAtom(buildAtom());
    mockValidationState.set({
      status: 'error',
      error: { code: 'VALIDATION_FAILED', message: 'Timeout' },
    });
    fixture.detectChanges();

    const errorEl = element.querySelector('[data-testid="validation-error"]');
    expect(errorEl?.getAttribute('role')).toBe('alert');
  });

  // -----------------------------------------------------------------------
  // Keyboard shortcuts
  // -----------------------------------------------------------------------

  it('exits player on Escape key', () => {
    initWithAtom(buildAtom());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning']);
  });

  it('requests hint on H key', () => {
    initWithAtom(buildAtom());

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'H' }));
    fixture.detectChanges();

    expect(component.hintsUsed()).toBe(1);
  });

  // -----------------------------------------------------------------------
  // Exit and cleanup
  // -----------------------------------------------------------------------

  it('navigates to /learning on exit', () => {
    initWithAtom(buildAtom());

    component.exitPlayer();

    expect(mockRouter.navigate).toHaveBeenCalledWith(['/learning']);
  });

  it('resets state on destroy', () => {
    initWithAtom(buildAtom());

    component.ngOnDestroy();

    expect(mockAtomService.resetAtomState).toHaveBeenCalled();
    expect(mockAtomService.resetValidationState).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // resetForNext preserves hints reset
  // -----------------------------------------------------------------------

  it('resetForNext clears answer, hints, and timer', () => {
    initWithAtom(buildAtom());
    component.onAnswerChange({ selected_option: 1 });
    component.requestHint();
    component.resetForNext();

    expect(component.phase()).toBe('ready');
    expect(component.currentAnswer()).toBeNull();
    expect(component.hintsUsed()).toBe(0);
    expect(mockAtomService.resetValidationState).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it('has role main with aria-label', () => {
    initWithAtom(buildAtom());
    const player = element.querySelector('[data-testid="atom-player"]');
    expect(player?.getAttribute('role')).toBe('main');
    expect(player?.getAttribute('aria-label')).toBe('Atom Player');
  });

  it('feedback section has role alert and aria-live', () => {
    submitWithResult(buildResult());

    const feedback = element.querySelector('[data-testid="player-feedback"]');
    expect(feedback?.getAttribute('role')).toBe('alert');
    expect(feedback?.getAttribute('aria-live')).toBe('polite');
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — ngOnInit id resolution
  // -----------------------------------------------------------------------

  it('uses atomId input over route param when input is set (|| short-circuit)', () => {
    const atom = buildAtom({ id: 'input-atom' });
    mockAtomService.loadAtom.mockReturnValue(of(atom));
    fixture.componentRef.setInput('atomId', 'input-atom');
    fixture.detectChanges();
    expect(mockAtomService.loadAtom).toHaveBeenCalledWith('input-atom');
  });

  it('sets error phase when no id from input or route (early return)', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [AtomPlayerComponent],
      providers: [
        { provide: AtomService, useValue: mockAtomService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
      ],
    });
    const noIdFixture = TestBed.createComponent(AtomPlayerComponent);
    mockAtomService.loadAtom.mockClear();
    noIdFixture.detectChanges();
    expect(noIdFixture.componentInstance.phase()).toBe('error');
    expect(mockAtomService.loadAtom).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — submitAnswer guards
  // -----------------------------------------------------------------------

  it('submitAnswer is a no-op when no answer set (early return guard)', () => {
    initWithAtom(buildAtom());
    // currentAnswer is null → guard returns
    component.submitAnswer();
    expect(mockAtomService.validateAnswer).not.toHaveBeenCalled();
    expect(component.phase()).toBe('ready');
  });

  it('submitAnswer is a no-op when atom is null (early return guard)', () => {
    // No init: atomState stays idle so atom() is null
    component.onAnswerChange({ selected_option: 2 });
    component.submitAnswer();
    expect(mockAtomService.validateAnswer).not.toHaveBeenCalled();
  });

  it('submitAnswer sends revision_id null when revision has no id (?? null arm)', () => {
    const atom = buildAtom({ latest_revision: null });
    // latest_revision null means phase goes to error; force ready + answer manually
    mockAtomService.loadAtom.mockReturnValue(of(buildAtom()));
    mockAtomState.set({ status: 'success', atom: buildAtom() });
    fixture.detectChanges();
    // Now override atomState to an atom whose revision lacks an id
    const atomNoRevId = buildAtom({
      latest_revision: {
        id: undefined as unknown as string,
        atom_id: 'atom-001',
        revision_number: 1,
        content: { stem: 'x', options: [] },
        validation_rules: [],
        published_at: null,
        created_at: '2026-01-01T00:00:00Z',
      },
    });
    mockAtomState.set({ status: 'success', atom: atomNoRevId });
    component.onAnswerChange({ selected_option: 2 });
    mockAtomService.validateAnswer.mockReturnValue(of(buildResult()));
    component.submitAnswer();
    expect(mockAtomService.validateAnswer).toHaveBeenCalledWith(
      'atom-001',
      expect.objectContaining({ revision_id: null }),
    );
    void atom;
  });

  it('stays in ready phase when validateAnswer returns null (if(result) false arm)', () => {
    initWithAtom(buildAtom());
    component.onAnswerChange({ selected_option: 2 });
    mockAtomService.validateAnswer.mockReturnValue(of(null));
    component.submitAnswer();
    expect(component.phase()).toBe('ready');
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — requestHint guard
  // -----------------------------------------------------------------------

  it('requestHint does nothing when no hints available (canHint false arm)', () => {
    initWithAtom(buildAtom({
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { stem: 'no hints here', options: [] },
      },
    }));
    component.requestHint();
    expect(component.hintsUsed()).toBe(0);
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — keyboard handler arms
  // -----------------------------------------------------------------------

  it('ignores keydown when target is an input element (early return)', () => {
    initWithAtom(buildAtom());
    const inputEl = document.createElement('input');
    const evt = new KeyboardEvent('keydown', { key: 'H' });
    Object.defineProperty(evt, 'target', { value: inputEl });
    component.onKeydown(evt);
    expect(component.hintsUsed()).toBe(0);
  });

  it('ignores keydown when target is a textarea element (early return)', () => {
    initWithAtom(buildAtom());
    const textareaEl = document.createElement('textarea');
    const evt = new KeyboardEvent('keydown', { key: 'h' });
    Object.defineProperty(evt, 'target', { value: textareaEl });
    component.onKeydown(evt);
    expect(component.hintsUsed()).toBe(0);
  });

  it('submits on S key when canSubmit is true', () => {
    initWithAtom(buildAtom());
    component.onAnswerChange({ selected_option: 2 });
    fixture.detectChanges();
    mockAtomService.validateAnswer.mockReturnValue(of(buildResult()));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'S' }));
    expect(mockAtomService.validateAnswer).toHaveBeenCalled();
  });

  it('does not submit on s key when canSubmit is false (no answer set)', () => {
    initWithAtom(buildAtom());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    expect(mockAtomService.validateAnswer).not.toHaveBeenCalled();
  });

  it('ignores unrelated keys (switch default arm)', () => {
    initWithAtom(buildAtom());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    expect(component.hintsUsed()).toBe(0);
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — computed signals fallback arms
  // -----------------------------------------------------------------------

  it('typeLabel is empty string when atom is not loaded (ternary false arm)', () => {
    // No init: atom() is null → atomType() null → typeLabel ''
    expect(component.typeLabel()).toBe('');
  });

  it('hints returns empty array when content has no hints (ternary false arm)', () => {
    initWithAtom(buildAtom({
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: { stem: 'no hints', options: [] },
      },
    }));
    expect(component.hints()).toEqual([]);
    expect(component.maxHints()).toBe(0);
    // Hint section should not render
    expect(element.querySelector('[data-testid="player-hints"]')).toBeFalsy();
  });

  it('isGradable is false when atom type is null', () => {
    expect(component.isGradable()).toBe(false);
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — difficulty stars (template)
  // -----------------------------------------------------------------------

  it('renders difficulty stars with filled/unfilled split', () => {
    initWithAtom(buildAtom({ difficulty: 2 }));
    const filled = element.querySelectorAll('.atom-player__star--filled');
    const allStars = element.querySelectorAll('.atom-player__difficulty span[aria-hidden="true"]');
    expect(filled.length).toBe(2);
    expect(allStars.length).toBe(5);
  });

  it('hides difficulty block when difficulty is falsy (0)', () => {
    initWithAtom(buildAtom({ difficulty: 0 }));
    expect(element.querySelector('.atom-player__difficulty')).toBeFalsy();
  });

  // -----------------------------------------------------------------------
  // BRANCH AUGMENTATION — feedback explanation absent + confidence undefined
  // -----------------------------------------------------------------------

  it('hides explanation when explanation is null (template @if false arm)', () => {
    submitWithResult(buildResult({ explanation: null }));
    expect(element.querySelector('[data-testid="feedback-explanation"]')).toBeFalsy();
  });

  it('hides confidence when confidence is undefined', () => {
    submitWithResult(buildResult({ confidence: undefined as unknown as number }));
    expect(element.querySelector('[data-testid="feedback-confidence"]')).toBeFalsy();
  });

  it('hides answer image when answer_image_url absent (|| null falsy arm)', () => {
    submitWithResult(buildResult());
    expect(component.answerImageUrl()).toBeNull();
    expect(element.querySelector('[data-testid="feedback-answer-image-img"]')).toBeFalsy();
  });

  it('shows answer image when content carries answer_image_url (|| truthy arm)', () => {
    const atomWithImg = buildAtom({
      latest_revision: {
        ...buildAtom().latest_revision!,
        content: {
          stem: 'What is 2+2?',
          options: [{ id: 1, text: '4' }],
          answer_image_url: 'https://cdn.chora.site/model-answer.png',
        },
      },
    });
    submitWithResult(buildResult({ correct: true }), atomWithImg);
    expect(component.answerImageUrl()).toBe('https://cdn.chora.site/model-answer.png');
    const img = element.querySelector('[data-testid="feedback-answer-image-img"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://cdn.chora.site/model-answer.png');
  });
});

// ===========================================================================
// Quality-data success branch — requires a mocked ContentQualityService
// ===========================================================================

describe('AtomPlayerComponent — quality data rendering', () => {
  const mockAtomState = signal<AtomState>({ status: 'idle' });
  const mockValidationState = signal<ValidationState>({ status: 'idle' });
  const mockQualityState = signal<ContentQualityState>({ status: 'idle' });

  const mockAtomService = {
    atomState: mockAtomState.asReadonly(),
    validationState: mockValidationState.asReadonly(),
    loadAtom: vi.fn(),
    validateAnswer: vi.fn().mockReturnValue(of(null)),
    resetAtomState: vi.fn(),
    resetValidationState: vi.fn(),
  };

  const mockQualityService = {
    qualityState: mockQualityState.asReadonly(),
    loadQualityData: vi.fn(),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };
  const mockRoute = { snapshot: { paramMap: convertToParamMap({ id: 'atom-001' }) } };

  let fixture: ComponentFixture<AtomPlayerComponent>;
  let element: HTMLElement;

  beforeEach(async () => {
    mockAtomState.set({ status: 'idle' });
    mockValidationState.set({ status: 'idle' });
    mockQualityState.set({ status: 'idle' });
    vi.clearAllMocks();
    mockAtomService.loadAtom.mockReturnValue(of(buildAtom()));

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AtomPlayerComponent],
      providers: [
        { provide: AtomService, useValue: mockAtomService },
        { provide: ContentQualityService, useValue: mockQualityService },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AtomPlayerComponent);
    element = fixture.nativeElement;
  });

  it('renders quality block when qualityState is success (qualityData truthy arm)', () => {
    const atom = buildAtom();
    mockAtomState.set({ status: 'success', atom });
    mockQualityState.set({
      status: 'success',
      data: {
        difficulty_score: 3,
        difficulty_confidence: 0.8,
        quality_score: 0.9,
        blooms_level: 'apply',
        readability_score: 0.7,
        review_status: 'reviewed',
        review_confidence: 0.9,
      },
    });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="player-quality"]')).toBeTruthy();
    expect(fixture.componentInstance.qualityData()).not.toBeNull();
  });

  it('hides quality block when qualityState is not success (qualityData null arm)', () => {
    const atom = buildAtom();
    mockAtomState.set({ status: 'success', atom });
    mockQualityState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="player-quality"]')).toBeFalsy();
    expect(fixture.componentInstance.qualityData()).toBeNull();
  });
});
