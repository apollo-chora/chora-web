import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { McqRendererComponent } from './mcq-renderer.component';
import { FillBlankRendererComponent } from './fill-blank-renderer.component';
import { TrueFalseRendererComponent } from './true-false-renderer.component';
import { FlashcardRendererComponent } from './flashcard-renderer.component';
import { ShortAnswerRendererComponent } from './short-answer-renderer.component';
import { CodeRendererComponent } from './code-renderer.component';

// ==========================================================================
// MCQ Renderer
// ==========================================================================

describe('McqRendererComponent', () => {
  let fixture: ComponentFixture<McqRendererComponent>;
  let component: McqRendererComponent;
  let element: HTMLElement;

  const mcqContent = {
    stem: 'What is the capital of France?',
    options: [
      { id: 1, text: 'London' },
      { id: 2, text: 'Paris' },
      { id: 3, text: 'Berlin' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [McqRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(McqRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', mcqContent);
    fixture.detectChanges();
  });

  it('renders stem text', () => {
    expect(element.querySelector('[data-testid="mcq-stem"]')?.textContent?.trim())
      .toBe('What is the capital of France?');
  });

  it('renders all options', () => {
    const options = element.querySelectorAll('[data-testid^="mcq-option-"]');
    expect(options).toHaveLength(3);
  });

  it('uses radiogroup role', () => {
    expect(element.querySelector('[role="radiogroup"]')).toBeTruthy();
  });

  it('options have radio role', () => {
    const options = element.querySelectorAll('[role="radio"]');
    expect(options).toHaveLength(3);
  });

  it('selects option on click', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    // data-testid uses $index (0-based), option at index 1 is Paris (id: 2)
    const option1 = element.querySelector('[data-testid="mcq-option-1"]') as HTMLElement;
    option1.click();
    fixture.detectChanges();

    expect(emitted).toEqual({ selected_option: 2 });
    expect(option1.getAttribute('aria-checked')).toBe('true');
  });

  it('applies selected class on selection', () => {
    const option1 = element.querySelector('[data-testid="mcq-option-1"]') as HTMLElement;
    option1.click();
    fixture.detectChanges();

    expect(option1.classList.contains('mcq-renderer__option--selected')).toBe(true);
  });

  it('deselects previous when new option selected', () => {
    const option1 = element.querySelector('[data-testid="mcq-option-1"]') as HTMLElement;
    const option2 = element.querySelector('[data-testid="mcq-option-2"]') as HTMLElement;

    option1.click();
    fixture.detectChanges();
    expect(option1.classList.contains('mcq-renderer__option--selected')).toBe(true);

    option2.click();
    fixture.detectChanges();
    expect(option1.classList.contains('mcq-renderer__option--selected')).toBe(false);
    expect(option2.classList.contains('mcq-renderer__option--selected')).toBe(true);
  });
});

// ==========================================================================
// Fill-Blank Renderer
// ==========================================================================

describe('FillBlankRendererComponent', () => {
  let fixture: ComponentFixture<FillBlankRendererComponent>;
  let component: FillBlankRendererComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FillBlankRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(FillBlankRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', {
      stem: 'The ___ is blue.',
      blanks: ['sky'],
    });
    fixture.detectChanges();
  });

  it('renders stem', () => {
    expect(element.querySelector('[data-testid="fill-blank-stem"]')?.textContent?.trim())
      .toBe('The ___ is blue.');
  });

  it('renders input for each blank', () => {
    const inputs = element.querySelectorAll('[data-testid^="fill-blank-input-"]');
    expect(inputs).toHaveLength(1);
  });

  it('emits answer on input', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    const input = element.querySelector('[data-testid="fill-blank-input-0"]') as HTMLInputElement;
    input.value = 'sky';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(emitted).toEqual({ answers: ['sky'] });
  });

  it('has accessible label on inputs', () => {
    const input = element.querySelector('[data-testid="fill-blank-input-0"]');
    expect(input?.getAttribute('aria-label')).toContain('blank 1');
  });
});

// ==========================================================================
// True-False Renderer
// ==========================================================================

describe('TrueFalseRendererComponent', () => {
  let fixture: ComponentFixture<TrueFalseRendererComponent>;
  let component: TrueFalseRendererComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TrueFalseRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(TrueFalseRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', { stem: 'The Earth is flat.' });
    fixture.detectChanges();
  });

  it('renders stem', () => {
    expect(element.querySelector('[data-testid="tf-stem"]')?.textContent?.trim())
      .toBe('The Earth is flat.');
  });

  it('renders True and False buttons', () => {
    expect(element.querySelector('[data-testid="tf-true-btn"]')).toBeTruthy();
    expect(element.querySelector('[data-testid="tf-false-btn"]')).toBeTruthy();
  });

  it('uses radiogroup role', () => {
    expect(element.querySelector('[role="radiogroup"]')).toBeTruthy();
  });

  it('selects True on click', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    (element.querySelector('[data-testid="tf-true-btn"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual({ value: true });
    expect(element.querySelector('[data-testid="tf-true-btn"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('selects False on click', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    (element.querySelector('[data-testid="tf-false-btn"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(emitted).toEqual({ value: false });
  });

  it('applies selected class', () => {
    (element.querySelector('[data-testid="tf-false-btn"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="tf-false-btn"]')?.classList.contains('tf-renderer__card--selected')).toBe(true);
    expect(element.querySelector('[data-testid="tf-true-btn"]')?.classList.contains('tf-renderer__card--selected')).toBe(false);
  });
});

// ==========================================================================
// Flashcard Renderer
// ==========================================================================

describe('FlashcardRendererComponent', () => {
  let fixture: ComponentFixture<FlashcardRendererComponent>;
  let component: FlashcardRendererComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [FlashcardRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(FlashcardRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', { front: 'Capital of Japan?', back: 'Tokyo' });
    fixture.detectChanges();
  });

  it('shows front face initially', () => {
    expect(element.textContent).toContain('Capital of Japan?');
    expect(element.textContent).toContain('Tap to reveal');
  });

  it('flips on click', () => {
    (element.querySelector('[data-testid="flashcard-card"]') as HTMLElement).click();
    fixture.detectChanges();

    expect(component.flipped()).toBe(true);
    expect(element.textContent).toContain('Tokyo');
    expect(element.textContent).toContain('Showing answer');
  });

  it('flips back on second click', () => {
    const card = element.querySelector('[data-testid="flashcard-card"]') as HTMLElement;
    card.click();
    fixture.detectChanges();
    card.click();
    fixture.detectChanges();

    expect(component.flipped()).toBe(false);
  });

  it('has accessible aria-label', () => {
    const card = element.querySelector('[data-testid="flashcard-card"]');
    expect(card?.getAttribute('aria-label')).toContain('Flashcard');
  });
});

// ==========================================================================
// Short Answer Renderer
// ==========================================================================

describe('ShortAnswerRendererComponent', () => {
  let fixture: ComponentFixture<ShortAnswerRendererComponent>;
  let component: ShortAnswerRendererComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ShortAnswerRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(ShortAnswerRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', { stem: 'Name a prime number.', max_length: 50 });
    fixture.detectChanges();
  });

  it('renders stem', () => {
    expect(element.querySelector('[data-testid="short-answer-stem"]')?.textContent?.trim())
      .toBe('Name a prime number.');
  });

  it('renders textarea', () => {
    const textarea = element.querySelector('[data-testid="short-answer-input"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute('maxlength')).toBe('50');
  });

  it('emits answer on input', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    const textarea = element.querySelector('[data-testid="short-answer-input"]') as HTMLTextAreaElement;
    textarea.value = '7';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));

    expect(emitted).toEqual({ text: '7' });
  });

  it('shows character counter', () => {
    const textarea = element.querySelector('[data-testid="short-answer-input"]') as HTMLTextAreaElement;
    textarea.value = 'hello';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(element.textContent).toContain('5 / 50');
  });
});

// ==========================================================================
// Code Renderer
// ==========================================================================

describe('CodeRendererComponent', () => {
  let fixture: ComponentFixture<CodeRendererComponent>;
  let component: CodeRendererComponent;
  let element: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [CodeRendererComponent] }).compileComponents();
    fixture = TestBed.createComponent(CodeRendererComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.componentRef.setInput('content', {
      stem: 'Write a function that returns 42.',
      language: 'python',
      starter_code: 'def answer():\n    pass',
    });
    fixture.detectChanges();
  });

  it('renders stem', () => {
    expect(element.querySelector('[data-testid="code-stem"]')?.textContent?.trim())
      .toBe('Write a function that returns 42.');
  });

  it('shows language badge', () => {
    expect(element.querySelector('[data-testid="code-language"]')?.textContent?.trim())
      .toBe('python');
  });

  it('renders code editor with starter code', () => {
    const editor = element.querySelector('[data-testid="code-editor"]') as HTMLTextAreaElement;
    expect(editor).toBeTruthy();
    expect(editor.value).toBe('def answer():\n    pass');
  });

  it('has monospace font', () => {
    const editor = element.querySelector('[data-testid="code-editor"]') as HTMLTextAreaElement;
    expect(editor.getAttribute('spellcheck')).toBe('false');
  });

  it('emits answer on input', () => {
    let emitted: Record<string, unknown> | null = null;
    component.answerChange.subscribe((a) => (emitted = a));

    const editor = element.querySelector('[data-testid="code-editor"]') as HTMLTextAreaElement;
    editor.value = 'def answer():\n    return 42';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    expect(emitted).toEqual({ code: 'def answer():\n    return 42', language: 'python' });
  });
});
