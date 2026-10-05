import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { signal } from '@angular/core';
import axe from 'axe-core';
import { ExamCoachingWidgetComponent } from './exam-coaching-widget.component';
import { ExamCoachingService } from '../../services/exam-coaching.service';
import type {
  CoachingState,
  ChatState,
  WeakTopic,
  StudyPlanItem,
} from '../../services/exam-coaching.service';
import { TranslateService } from '../../../../core/services/translate.service';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function buildWeakTopics(): WeakTopic[] {
  return [
    { topic_name: 'Integration', mastery_pct: 35 },
    { topic_name: 'Probability', mastery_pct: 42 },
  ];
}

function buildStudyPlan(): StudyPlanItem[] {
  return [
    { atom_id: 'atom-300', title: 'Integration Techniques', priority: 1, reason: 'Lowest mastery' },
    { atom_id: 'atom-301', title: 'Bayes Theorem', priority: 2, reason: 'Frequently tested' },
  ];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ExamCoachingWidgetComponent', () => {
  let fixture: ComponentFixture<ExamCoachingWidgetComponent>;
  let component: ExamCoachingWidgetComponent;
  let element: HTMLElement;

  const weakTopics = buildWeakTopics();
  const studyPlan = buildStudyPlan();

  const mockCoachingState = signal<CoachingState>({ status: 'idle' });
  const mockChatState = signal<ChatState>({ status: 'idle' });
  const readinessScoreSignal = signal(68);
  const weakTopicsSignal = signal<WeakTopic[]>([]);
  const studyPlanSignal = signal<StudyPlanItem[]>([]);
  const coachingMessageSignal = signal('');
  const chatTextSignal = signal('');
  const isChatStreamingSignal = signal(false);

  const mockService = {
    coachingState: mockCoachingState.asReadonly(),
    chatState: mockChatState.asReadonly(),
    readinessScore: readinessScoreSignal.asReadonly(),
    weakTopics: weakTopicsSignal.asReadonly(),
    studyPlan: studyPlanSignal.asReadonly(),
    coachingMessage: coachingMessageSignal.asReadonly(),
    chatText: chatTextSignal.asReadonly(),
    isChatStreaming: isChatStreamingSignal.asReadonly(),
    loadCoaching: vi.fn().mockReturnValue(of(null)),
    startChat: vi.fn(),
    stopChat: vi.fn(),
    resetState: vi.fn(),
  };

  const mockRouter = { navigate: vi.fn() };
  const mockTranslate = { instant: (key: string) => key };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockCoachingState.set({ status: 'success', data: {} as never });
    mockChatState.set({ status: 'idle' });
    readinessScoreSignal.set(68);
    weakTopicsSignal.set(weakTopics);
    studyPlanSignal.set(studyPlan);
    coachingMessageSignal.set('Focus on integration first.');
    chatTextSignal.set('');
    isChatStreamingSignal.set(false);

    await TestBed.configureTestingModule({
      imports: [ExamCoachingWidgetComponent],
      providers: [
        { provide: ExamCoachingService, useValue: mockService },
        { provide: Router, useValue: mockRouter },
        { provide: TranslateService, useValue: mockTranslate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExamCoachingWidgetComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges();
  });

  // -------------------------------------------------------------------------
  // Rendering — success state
  // -------------------------------------------------------------------------

  it('renders the exam coaching widget container', () => {
    expect(element.querySelector('[data-testid="exam-coaching-widget"]')).toBeTruthy();
  });

  it('displays readiness score', () => {
    const scoreEl = element.querySelector('[data-testid="coaching-score-value"]');
    expect(scoreEl?.textContent).toContain('68');
  });

  it('renders the readiness progress bar', () => {
    const barFill = element.querySelector('[data-testid="coaching-bar-fill"]');
    expect(barFill).toBeTruthy();
    expect(barFill?.getAttribute('aria-valuenow')).toBe('68');
  });

  it('renders expand/collapse button', () => {
    const btn = element.querySelector('[data-testid="coaching-expand-btn"]');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  // -------------------------------------------------------------------------
  // Expand/Collapse
  // -------------------------------------------------------------------------

  it('toggles expanded state', () => {
    const btn = element.querySelector('[data-testid="coaching-expand-btn"]') as HTMLElement;
    btn.click();
    fixture.detectChanges();

    expect(component.expanded()).toBe(true);
    expect(element.querySelector('[data-testid="coaching-details"]')).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders study plan when expanded', () => {
    component.expanded.set(true);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="coaching-study-plan"]')).toBeTruthy();
    const planItems = element.querySelectorAll('[data-testid^="coaching-plan-"]');
    expect(planItems.length).toBe(2);
  });

  it('renders weak topics when expanded', () => {
    component.expanded.set(true);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="coaching-weak-topics"]')).toBeTruthy();
  });

  it('renders coaching message when expanded', () => {
    component.expanded.set(true);
    fixture.detectChanges();

    const msgEl = element.querySelector('[data-testid="coaching-message"]');
    expect(msgEl?.textContent).toContain('Focus on integration');
  });

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  it('shows loading state', () => {
    mockCoachingState.set({ status: 'loading' });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="coaching-loading"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  it('shows error state', () => {
    mockCoachingState.set({ status: 'error', error: { code: 'ERR', message: 'Failed' } });
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="coaching-error"]')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Computed properties
  // -------------------------------------------------------------------------

  it('computes medium scoreLevel for 68%', () => {
    expect(component.scoreLevel()).toBe('medium');
  });

  it('computes high scoreLevel for >= 75%', () => {
    readinessScoreSignal.set(80);
    expect(component.scoreLevel()).toBe('high');
  });

  it('computes low scoreLevel for < 50%', () => {
    readinessScoreSignal.set(30);
    expect(component.scoreLevel()).toBe('low');
  });

  it('computes correct gaugeWidth', () => {
    expect(component.gaugeWidth()).toBe('68%');
  });

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  it('navigates to atom on study plan item click', () => {
    component.expanded.set(true);
    fixture.detectChanges();

    const btn = element.querySelector('[data-testid="coaching-plan-atom-300"]') as HTMLElement;
    btn.click();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/atoms', 'atom-300']);
  });

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  it('stops chat on destroy', () => {
    component.ngOnDestroy();
    expect(mockService.stopChat).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // ngOnInit — coaching auto-load behaviour
  // -------------------------------------------------------------------------

  it('does NOT auto-load coaching when state is already success on init', () => {
    // beforeEach created the component with status 'success' already set, so
    // ngOnInit must have skipped the idle-branch loadCoaching call.
    expect(mockService.loadCoaching).not.toHaveBeenCalled();
  });

  it('auto-loads coaching for "me" when state is idle on init', () => {
    // Rebuild a fresh component whose state is idle at construction time.
    mockCoachingState.set({ status: 'idle' });
    mockService.loadCoaching.mockClear();

    const freshFixture = TestBed.createComponent(ExamCoachingWidgetComponent);
    freshFixture.detectChanges();

    expect(mockService.loadCoaching).toHaveBeenCalledWith('me');
  });

  // -------------------------------------------------------------------------
  // Chat — open/close + rendering
  // -------------------------------------------------------------------------

  it('toggles chat open via the chat button', () => {
    const btn = element.querySelector('[data-testid="coaching-chat-btn"]') as HTMLElement;
    expect(component.chatOpen()).toBe(false);

    btn.click();
    fixture.detectChanges();

    expect(component.chatOpen()).toBe(true);
    expect(element.querySelector('[data-testid="coaching-chat"]')).toBeTruthy();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('toggleChat flips chatOpen back to false', () => {
    component.toggleChat();
    expect(component.chatOpen()).toBe(true);
    component.toggleChat();
    expect(component.chatOpen()).toBe(false);
  });

  it('renders the streaming chat response bubble with cursor', () => {
    chatTextSignal.set('Here is your coaching advice');
    isChatStreamingSignal.set(true);
    component.chatOpen.set(true);
    fixture.detectChanges();

    const bubble = element.querySelector('[data-testid="coaching-chat-response"]');
    expect(bubble?.textContent).toContain('Here is your coaching advice');
    expect(element.querySelector('.exam-coaching__chat-cursor')).toBeTruthy();
  });

  it('renders chat response without cursor when not streaming', () => {
    chatTextSignal.set('Final answer');
    isChatStreamingSignal.set(false);
    component.chatOpen.set(true);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="coaching-chat-response"]')?.textContent)
      .toContain('Final answer');
    expect(element.querySelector('.exam-coaching__chat-cursor')).toBeNull();
  });

  it('renders chat error when chatState is error', () => {
    mockChatState.set({ status: 'error', error: { code: 'CHAT_STREAM_ERROR', message: 'Lost' } });
    component.chatOpen.set(true);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="coaching-chat-error"]')).toBeTruthy();
  });

  it('does not render chat panel when chat is closed', () => {
    expect(component.chatOpen()).toBe(false);
    expect(element.querySelector('[data-testid="coaching-chat"]')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Chat — input + send
  // -------------------------------------------------------------------------

  it('updateChatInput stores the typed value', () => {
    component.updateChatInput('how do I revise integration?');
    expect(component.chatInput()).toBe('how do I revise integration?');
  });

  it('reflects chatInput value in the input element', () => {
    component.chatOpen.set(true);
    component.chatInput.set('typed text');
    fixture.detectChanges();

    const input = element.querySelector('[data-testid="coaching-chat-input"]') as HTMLInputElement;
    expect(input.value).toBe('typed text');
  });

  it('updates chatInput from input event', () => {
    component.chatOpen.set(true);
    fixture.detectChanges();

    const input = element.querySelector('[data-testid="coaching-chat-input"]') as HTMLInputElement;
    input.value = 'streamed via event';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component.chatInput()).toBe('streamed via event');
  });

  it('sendMessage starts chat and clears the input', () => {
    component.chatInput.set('explain Bayes theorem');
    component.sendMessage();

    expect(mockService.startChat).toHaveBeenCalledWith('me', 'explain Bayes theorem');
    expect(component.chatInput()).toBe('');
  });

  it('sendMessage is a no-op for empty / whitespace input', () => {
    component.chatInput.set('   ');
    component.sendMessage();

    expect(mockService.startChat).not.toHaveBeenCalled();
    // input is left untouched on the early-return path
    expect(component.chatInput()).toBe('   ');
  });

  it('send button click invokes sendMessage', () => {
    component.chatOpen.set(true);
    component.chatInput.set('a question');
    fixture.detectChanges();

    const sendBtn = element.querySelector('[data-testid="coaching-chat-send"]') as HTMLButtonElement;
    sendBtn.click();

    expect(mockService.startChat).toHaveBeenCalledWith('me', 'a question');
  });

  it('disables the send button when input is empty', () => {
    component.chatOpen.set(true);
    component.chatInput.set('');
    fixture.detectChanges();

    const sendBtn = element.querySelector('[data-testid="coaching-chat-send"]') as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('disables the input and send button while streaming', () => {
    isChatStreamingSignal.set(true);
    component.chatOpen.set(true);
    component.chatInput.set('a question');
    fixture.detectChanges();

    const input = element.querySelector('[data-testid="coaching-chat-input"]') as HTMLInputElement;
    const sendBtn = element.querySelector('[data-testid="coaching-chat-send"]') as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(sendBtn.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Chat — keyboard handling
  // -------------------------------------------------------------------------

  it('sends on Enter (no shift) and prevents default', () => {
    component.chatInput.set('via enter key');
    const event = new KeyboardEvent('keydown', { key: 'Enter' });
    const preventSpy = vi.spyOn(event, 'preventDefault');

    component.onChatKeydown(event);

    expect(preventSpy).toHaveBeenCalled();
    expect(mockService.startChat).toHaveBeenCalledWith('me', 'via enter key');
  });

  it('does NOT send on Shift+Enter', () => {
    component.chatInput.set('multi-line');
    const event = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true });
    const preventSpy = vi.spyOn(event, 'preventDefault');

    component.onChatKeydown(event);

    expect(preventSpy).not.toHaveBeenCalled();
    expect(mockService.startChat).not.toHaveBeenCalled();
  });

  it('does NOT send on a non-Enter key', () => {
    component.chatInput.set('still typing');
    const event = new KeyboardEvent('keydown', { key: 'a' });

    component.onChatKeydown(event);

    expect(mockService.startChat).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // trackByAtomId
  // -------------------------------------------------------------------------

  it('trackByAtomId returns the atom_id', () => {
    expect(component.trackByAtomId(0, studyPlan[0])).toBe('atom-300');
    expect(component.trackByAtomId(1, studyPlan[1])).toBe('atom-301');
  });

  // -------------------------------------------------------------------------
  // Accessibility
  // -------------------------------------------------------------------------

  it('has region role with aria-label', () => {
    const container = element.querySelector('[data-testid="exam-coaching-widget"]');
    expect(container?.getAttribute('role')).toBe('region');
    expect(container?.getAttribute('aria-label')).toBe('Exam Coaching');
  });

  it('passes axe-core accessibility checks', async () => {
    const results = await axe.run(fixture.nativeElement);
    expect(
      results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious'),
    ).toHaveLength(0);
  });
});
