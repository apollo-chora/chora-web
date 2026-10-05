import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AiAssistPanelComponent } from './ai-assist-panel.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import type {
  GenerationJobState,
  QuestionGenerationJob,
} from '../atom-authoring.model';

class StubTranslateService {
  instant(key: string): string {
    return key;
  }
}

function buildJob(
  status: QuestionGenerationJob['status'],
  partial: Partial<QuestionGenerationJob> = {},
): QuestionGenerationJob {
  return {
    job_id: 'job_a',
    atom_id: 'atom_a',
    job_type: 'ai_draft',
    status,
    created_at: '2026-05-15T13:00:00Z',
    updated_at: '2026-05-15T13:00:01Z',
    ...partial,
  };
}

function setupHarness(
  jobState: GenerationJobState,
  manaBalance: number | null = 100,
  questionType: 'mcq' | 'oe' = 'mcq',
): {
  fixture: ComponentFixture<AiAssistPanelComponent>;
  element: HTMLElement;
} {
  const fixture = TestBed.createComponent(AiAssistPanelComponent);
  fixture.componentRef.setInput('questionType', questionType);
  fixture.componentRef.setInput('jobState', jobState);
  fixture.componentRef.setInput('manaBalance', manaBalance);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('AiAssistPanelComponent (Phase I.1 — in-editor AI assist)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiAssistPanelComponent],
      providers: [
        provideHttpClient(),
        { provide: TranslateService, useClass: StubTranslateService },
      ],
    }).compileComponents();
  });

  describe('structure + a11y', () => {
    it('renders the disclosure toggle with sparkle label', () => {
      const { element } = setupHarness({ status: 'idle' });
      const toggle = element.querySelector('[data-testid="ai-assist-toggle"]');
      expect(toggle).toBeTruthy();
      expect(toggle?.getAttribute('aria-expanded')).toBe('false');
      expect(toggle?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.toggle',
      );
    });

    it('panel body is hidden when collapsed', () => {
      const { element } = setupHarness({ status: 'idle' });
      const body = element.querySelector('[data-testid="ai-assist-body"]');
      expect(body).toBeFalsy();
    });

    it('clicking the toggle expands the panel + sets aria-expanded=true', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      const toggle = element.querySelector(
        '[data-testid="ai-assist-toggle"]',
      ) as HTMLElement;
      toggle.click();
      fixture.detectChanges();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(element.querySelector('[data-testid="ai-assist-body"]')).toBeTruthy();
    });
  });

  describe('prompt + difficulty controls (expanded)', () => {
    it('renders a prompt textarea + difficulty selector + Generate CTA', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-assist-prompt"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="ai-assist-difficulty"]')).toBeTruthy();
      expect(element.querySelector('[data-testid="ai-assist-generate"]')).toBeTruthy();
    });

    it('Generate is disabled when prompt is empty', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('Generate is disabled when prompt is whitespace-only', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = '   ';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('Generate enables once prompt has non-whitespace content', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Photosynthesis basics';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(false);
    });

    it('difficulty selector defaults to 3 and exposes 1..5', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const sel = element.querySelector(
        '[data-testid="ai-assist-difficulty"]',
      ) as HTMLSelectElement;
      expect(sel.value).toBe('3');
      const opts = Array.from(sel.options).map((o) => o.value);
      expect(opts).toEqual(['1', '2', '3', '4', '5']);
    });
  });

  describe('generate emits', () => {
    it('clicking Generate emits generateRequested with prompt + difficulty', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      const spy = vi.fn();
      fixture.componentInstance.generateRequested.subscribe(spy);
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Mitosis vs Meiosis';
      prompt.dispatchEvent(new Event('input'));
      const diff = element.querySelector(
        '[data-testid="ai-assist-difficulty"]',
      ) as HTMLSelectElement;
      diff.value = '4';
      diff.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith({ prompt: 'Mitosis vs Meiosis', difficulty: 4 });
    });

    it('Generate trims the prompt before emitting', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      const spy = vi.fn();
      fixture.componentInstance.generateRequested.subscribe(spy);
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = '   Krebs cycle   ';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      (element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith({ prompt: 'Krebs cycle', difficulty: 3 });
    });
  });

  describe('lifecycle status indicators', () => {
    it('shows the submitting indicator when jobState=submitting', () => {
      const { element } = setupHarness({ status: 'submitting' });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_submitting',
      );
    });

    it('shows the parsing indicator when jobState=polling + job.status=parsing', () => {
      const { element } = setupHarness({
        status: 'polling',
        job: buildJob('parsing'),
      });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_parsing',
      );
    });

    it('shows the generating indicator when jobState=polling + job.status=generating', () => {
      const { element } = setupHarness({
        status: 'polling',
        job: buildJob('generating'),
      });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_generating',
      );
    });

    it('shows the ready indicator when jobState=ready', () => {
      const { element } = setupHarness({
        status: 'ready',
        job: buildJob('ready_for_review'),
      });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_ready',
      );
    });

    it('shows the error message when jobState=error', () => {
      const { element } = setupHarness({
        status: 'error',
        error: 'aplus.atom_authoring.ai_assist.error_upstream',
      });
      const indicator = element.querySelector('[data-testid="ai-assist-error"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.error_upstream',
      );
    });

    it('does NOT show a status indicator when jobState=idle', () => {
      const { element } = setupHarness({ status: 'idle' });
      expect(element.querySelector('[data-testid="ai-assist-status"]')).toBeFalsy();
      expect(element.querySelector('[data-testid="ai-assist-error"]')).toBeFalsy();
    });
  });

  describe('Generate disable rules (mid-flight)', () => {
    it('Generate is disabled while jobState=submitting (even with prompt)', () => {
      const { fixture, element } = setupHarness({ status: 'submitting' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Krebs cycle';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('Generate is disabled while jobState=polling', () => {
      const { fixture, element } = setupHarness({
        status: 'polling',
        job: buildJob('generating'),
      });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Krebs cycle';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('Generate re-enables when jobState transitions back to idle', () => {
      const { fixture, element } = setupHarness({ status: 'submitting' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Krebs cycle';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      fixture.componentRef.setInput('jobState', { status: 'idle' });
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(false);
    });
  });

  describe('mana balance hint', () => {
    it('renders the per-call cost hint (10 mana for ai_draft)', () => {
      const { fixture, element } = setupHarness({ status: 'idle' });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const hint = element.querySelector('[data-testid="ai-assist-cost-hint"]');
      expect(hint?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.cost_hint',
      );
    });

    it('shows mana balance when provided', () => {
      const { fixture, element } = setupHarness({ status: 'idle' }, 75);
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const hint = element.querySelector('[data-testid="ai-assist-cost-hint"]');
      expect(hint?.textContent).toContain('75');
    });

    it('mana balance label is omitted when balance is null', () => {
      const { fixture, element } = setupHarness({ status: 'idle' }, null);
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const hint = element.querySelector(
        '[data-testid="ai-assist-mana-balance"]',
      );
      expect(hint).toBeFalsy();
    });
  });

  describe('uncovered branch arms', () => {
    it('shows the submitted indicator when jobState=submitted (inFlight + statusKey submitted arm)', () => {
      const { element } = setupHarness({
        status: 'submitted',
        job: buildJob('pending'),
      });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_submitted',
      );
    });

    it('Generate is disabled while jobState=submitted (inFlight submitted arm via canGenerate)', () => {
      const { fixture, element } = setupHarness({
        status: 'submitted',
        job: buildJob('pending'),
      });
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      ) as HTMLTextAreaElement;
      prompt.value = 'Krebs cycle';
      prompt.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const cta = element.querySelector(
        '[data-testid="ai-assist-generate"]',
      ) as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
    });

    it('falls back to the generic polling status when job.status is neither parsing nor generating', () => {
      const { element } = setupHarness({
        status: 'polling',
        job: buildJob('pending'),
      });
      const indicator = element.querySelector('[data-testid="ai-assist-status"]');
      expect(indicator?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.status_polling',
      );
    });

    it('onDifficultyChange ignores an out-of-range value (above 5) — keeps the prior difficulty', () => {
      const { fixture } = setupHarness({ status: 'idle' });
      const cmp = fixture.componentInstance;
      cmp.onDifficultyChange({
        target: { value: '7' },
      } as unknown as Event);
      expect(cmp.difficulty()).toBe(3);
    });

    it('onDifficultyChange ignores a below-range value (zero) — keeps the prior difficulty', () => {
      const { fixture } = setupHarness({ status: 'idle' });
      const cmp = fixture.componentInstance;
      cmp.onDifficultyChange({
        target: { value: '0' },
      } as unknown as Event);
      expect(cmp.difficulty()).toBe(3);
    });

    it('onDifficultyChange ignores a non-numeric value (NaN) — keeps the prior difficulty', () => {
      const { fixture } = setupHarness({ status: 'idle' });
      const cmp = fixture.componentInstance;
      cmp.onDifficultyChange({
        target: { value: 'abc' },
      } as unknown as Event);
      expect(cmp.difficulty()).toBe(3);
    });

    it('onDifficultyChange accepts an in-range value (updates the difficulty signal)', () => {
      const { fixture } = setupHarness({ status: 'idle' });
      const cmp = fixture.componentInstance;
      cmp.onDifficultyChange({
        target: { value: '2' },
      } as unknown as Event);
      expect(cmp.difficulty()).toBe(2);
    });

    it('submit() early-returns without emitting when canGenerate is false (empty prompt)', () => {
      const { fixture } = setupHarness({ status: 'idle' });
      const cmp = fixture.componentInstance;
      const spy = vi.fn();
      cmp.generateRequested.subscribe(spy);
      // prompt is empty by default → canGenerate() is false → guard early-returns
      cmp.submit();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('per-question-type aria label', () => {
    it('uses the MCQ-flavoured aria label when questionType=mcq', () => {
      const { fixture, element } = setupHarness({ status: 'idle' }, 100, 'mcq');
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      );
      expect(prompt?.getAttribute('aria-label')).toContain(
        'aplus.atom_authoring.ai_assist.prompt_aria_mcq',
      );
    });

    it('uses the OE-flavoured aria label when questionType=oe', () => {
      const { fixture, element } = setupHarness({ status: 'idle' }, 100, 'oe');
      (element.querySelector('[data-testid="ai-assist-toggle"]') as HTMLElement).click();
      fixture.detectChanges();
      const prompt = element.querySelector(
        '[data-testid="ai-assist-prompt"]',
      );
      expect(prompt?.getAttribute('aria-label')).toContain(
        'aplus.atom_authoring.ai_assist.prompt_aria_oe',
      );
    });
  });

  describe('stub mode (inline panel superseded by the AI Assist crew modal)', () => {
    it('grays out + disables the toggle when stub=true', () => {
      const fixture = TestBed.createComponent(AiAssistPanelComponent);
      fixture.componentRef.setInput('questionType', 'mcq');
      fixture.componentRef.setInput('jobState', { status: 'idle' });
      fixture.componentRef.setInput('manaBalance', 100);
      fixture.componentRef.setInput('stub', true);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      const toggle = element.querySelector(
        '[data-testid="ai-assist-toggle"]',
      ) as HTMLButtonElement;
      expect(toggle.disabled).toBe(true);
      expect(element.querySelector('.ai-assist-panel--stub')).toBeTruthy();

      // The disabled toggle cannot expand the body → generate is unreachable.
      toggle.click();
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="ai-assist-body"]')).toBeNull();
    });

    it('defaults to interactive (stub=false) so batch authoring is unaffected', () => {
      const { element } = setupHarness({ status: 'idle' });
      const toggle = element.querySelector(
        '[data-testid="ai-assist-toggle"]',
      ) as HTMLButtonElement;
      expect(toggle.disabled).toBe(false);
      expect(element.querySelector('.ai-assist-panel--stub')).toBeNull();
    });
  });
});
