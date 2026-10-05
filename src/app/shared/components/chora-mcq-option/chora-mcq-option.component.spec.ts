import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChoraMcqOptionComponent } from './chora-mcq-option.component';

describe('ChoraMcqOptionComponent', () => {
  let fixture: ComponentFixture<ChoraMcqOptionComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraMcqOptionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChoraMcqOptionComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setInputs(inputs: Partial<{
    mode: 'interactive' | 'reveal';
    marker: string;
    text: string;
    selected: boolean;
    correct: boolean;
    explainer: string;
    testId: string;
    disabled: boolean;
    ariaLabel: string;
    stemElementId: string;
    yourAnswerLabel: string;
    correctAnswerLabel: string;
  }>): void {
    if (inputs.mode !== undefined) fixture.componentRef.setInput('mode', inputs.mode);
    if (inputs.marker !== undefined) fixture.componentRef.setInput('marker', inputs.marker);
    if (inputs.text !== undefined) fixture.componentRef.setInput('text', inputs.text);
    if (inputs.selected !== undefined) fixture.componentRef.setInput('selected', inputs.selected);
    if (inputs.correct !== undefined) fixture.componentRef.setInput('correct', inputs.correct);
    if (inputs.explainer !== undefined) fixture.componentRef.setInput('explainer', inputs.explainer);
    if (inputs.testId !== undefined) fixture.componentRef.setInput('testId', inputs.testId);
    if (inputs.disabled !== undefined) fixture.componentRef.setInput('disabled', inputs.disabled);
    if (inputs.ariaLabel !== undefined) fixture.componentRef.setInput('ariaLabel', inputs.ariaLabel);
    if (inputs.stemElementId !== undefined)
      fixture.componentRef.setInput('stemElementId', inputs.stemElementId);
    if (inputs.yourAnswerLabel !== undefined)
      fixture.componentRef.setInput('yourAnswerLabel', inputs.yourAnswerLabel);
    if (inputs.correctAnswerLabel !== undefined)
      fixture.componentRef.setInput('correctAnswerLabel', inputs.correctAnswerLabel);
    fixture.detectChanges();
  }

  // ─── Interactive mode (working canvas) ──────────────────────────────

  describe('interactive mode', () => {
    it('renders a <button> with role="radio"', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'The Sun' });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('role')).toBe('radio');
      expect(btn?.getAttribute('type')).toBe('button');
    });

    it('renders the marker + text', () => {
      setInputs({ mode: 'interactive', marker: 'B', text: 'Proxima Centauri' });
      const marker = host.querySelector('.chora-mcq-option__marker');
      const text = host.querySelector('.chora-mcq-option__text');
      expect(marker?.textContent?.trim()).toBe('B');
      expect(text?.textContent?.trim()).toBe('Proxima Centauri');
    });

    it('reflects selected=true via aria-checked + .is-selected', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: true });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-checked')).toBe('true');
      expect(btn?.classList.contains('is-selected')).toBe(true);
    });

    it('shows a check icon when selected', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: true });
      const check = host.querySelector('.chora-mcq-option__check i');
      expect(check).not.toBeNull();
    });

    it('reflects selected=false via aria-checked', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: false });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-checked')).toBe('false');
      expect(btn?.classList.contains('is-selected')).toBe(false);
    });

    it('forwards testId to data-testid attribute on the button', () => {
      setInputs({
        mode: 'interactive',
        marker: 'A',
        text: 'A',
        testId: 'me-assessment-mcq-option-tsq-1-opt-a',
      });
      const btn = host.querySelector(
        '[data-testid="me-assessment-mcq-option-tsq-1-opt-a"]',
      );
      expect(btn).not.toBeNull();
      expect(btn?.tagName).toBe('BUTTON');
    });

    it('emits pick event when clicked', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      const btn = host.querySelector('button.chora-mcq-option') as HTMLButtonElement;
      btn.click();
      expect(fired).toBe(1);
    });

    it('does not emit pick when disabled', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', disabled: true });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      const btn = host.querySelector('button.chora-mcq-option') as HTMLButtonElement;
      btn.click();
      expect(fired).toBe(0);
    });

    it('uses provided ariaLabel when set', () => {
      setInputs({
        mode: 'interactive',
        marker: 'A',
        text: 'The Sun',
        ariaLabel: 'Option A, The Sun',
      });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-label')).toBe('Option A, The Sun');
    });

    it('passes stemElementId via aria-describedby on the button', () => {
      setInputs({
        mode: 'interactive',
        marker: 'A',
        text: 'The Sun',
        stemElementId: 'me-assessment-stem-tsq-1',
      });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-describedby')).toBe(
        'me-assessment-stem-tsq-1',
      );
    });

    it('omits aria-describedby when stemElementId is not provided', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'The Sun' });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.hasAttribute('aria-describedby')).toBe(false);
    });
  });

  // ─── Reveal mode (result page) ──────────────────────────────────────

  describe('reveal mode', () => {
    it('renders a non-interactive <div> (no button)', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A' });
      expect(host.querySelector('button')).toBeNull();
      expect(host.querySelector('div.chora-mcq-option')).not.toBeNull();
    });

    it('renders the marker + text', () => {
      setInputs({ mode: 'reveal', marker: 'C', text: 'Saturn' });
      expect(host.querySelector('.chora-mcq-option__marker')?.textContent?.trim()).toBe('C');
      expect(host.querySelector('.chora-mcq-option__text')?.textContent?.trim()).toBe('Saturn');
    });

    it('sets data-is-correct="true" when correct=true and renders the correct icon', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const card = host.querySelector('.chora-mcq-option');
      expect(card?.getAttribute('data-is-correct')).toBe('true');
      expect(host.querySelector('.chora-mcq-option__correct')).not.toBeNull();
    });

    it('sets data-is-correct="false" when correct=false and omits the correct icon', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: false });
      const card = host.querySelector('.chora-mcq-option');
      expect(card?.getAttribute('data-is-correct')).toBe('false');
      expect(host.querySelector('.chora-mcq-option__correct')).toBeNull();
    });

    it('renders explainer when provided', () => {
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'A',
        correct: false,
        explainer: 'Distractor — Proxima is the nearest after the Sun.',
      });
      const exp = host.querySelector('.chora-mcq-option__explainer');
      expect(exp?.textContent?.trim()).toBe(
        'Distractor — Proxima is the nearest after the Sun.',
      );
    });

    it('omits explainer when not provided', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: false });
      expect(host.querySelector('.chora-mcq-option__explainer')).toBeNull();
    });

    it('forwards testId to data-testid on the host', () => {
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'A',
        correct: true,
        testId: 'me-result-option-opt-a',
      });
      const el = host.querySelector('[data-testid="me-result-option-opt-a"]');
      expect(el).not.toBeNull();
      expect(el?.tagName).toBe('DIV');
    });

    it('does not emit pick on click in reveal mode', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      const card = host.querySelector('.chora-mcq-option') as HTMLElement;
      card.click();
      expect(fired).toBe(0);
    });
  });

  // ─── Interactive mode — added coverage (attrs + branches) ───────────

  describe('interactive mode — added coverage', () => {
    it('reflects selected=true via aria-pressed', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: true });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-pressed')).toBe('true');
    });

    it('reflects selected=false via aria-pressed (default)', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.getAttribute('aria-pressed')).toBe('false');
    });

    it('omits the check icon when not selected', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: false });
      const check = host.querySelector('.chora-mcq-option__check i');
      expect(check).toBeNull();
    });

    it('carries an empty (no) check-icon container when not selected', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      const checkSpan = host.querySelector('.chora-mcq-option__check');
      expect(checkSpan).not.toBeNull();
      expect(checkSpan?.querySelector('i')).toBeNull();
    });

    it('reflects disabled=true on the button element', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', disabled: true });
      const btn = host.querySelector('button.chora-mcq-option') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('is not disabled by default', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      const btn = host.querySelector('button.chora-mcq-option') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('omits aria-label when ariaLabel is not provided', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.hasAttribute('aria-label')).toBe(false);
    });

    it('omits data-testid when testId is not provided', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      const btn = host.querySelector('button.chora-mcq-option');
      expect(btn?.hasAttribute('data-testid')).toBe(false);
    });

    it('marks the marker + check spans aria-hidden', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', selected: true });
      const marker = host.querySelector('.chora-mcq-option__marker');
      const check = host.querySelector('.chora-mcq-option__check');
      expect(marker?.getAttribute('aria-hidden')).toBe('true');
      expect(check?.getAttribute('aria-hidden')).toBe('true');
    });

    it('emits exactly once per click and again on a second click', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      const btn = host.querySelector('button.chora-mcq-option') as HTMLButtonElement;
      btn.click();
      btn.click();
      expect(fired).toBe(2);
    });

    it('onPick() called directly emits when enabled', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      fixture.componentInstance.onPick();
      expect(fired).toBe(1);
    });

    it('onPick() called directly is a no-op when disabled', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A', disabled: true });
      let fired = 0;
      fixture.componentInstance.pick.subscribe(() => fired++);
      fixture.componentInstance.onPick();
      expect(fired).toBe(0);
    });
  });

  // ─── Reveal mode — added coverage (attrs + branches) ────────────────

  describe('reveal mode — added coverage', () => {
    it('adds .is-correct class when correct=true', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.classList.contains('is-correct')).toBe(true);
    });

    it('omits .is-correct class when correct=false', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: false });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.classList.contains('is-correct')).toBe(false);
    });

    it('treats undefined correct as not-correct (data-is-correct="false", no icon, no .is-correct)', () => {
      // correct() defaults to undefined — exercises the `=== true` falsy branch.
      setInputs({ mode: 'reveal', marker: 'A', text: 'A' });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.getAttribute('data-is-correct')).toBe('false');
      expect(card?.classList.contains('is-correct')).toBe(false);
      expect(host.querySelector('.chora-mcq-option__correct')).toBeNull();
    });

    it('uses provided ariaLabel on the reveal card', () => {
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'The Sun',
        correct: true,
        ariaLabel: 'Correct answer: A, The Sun',
      });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.getAttribute('aria-label')).toBe('Correct answer: A, The Sun');
    });

    it('omits aria-label on the reveal card when not provided', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.hasAttribute('aria-label')).toBe(false);
    });

    it('omits data-testid on the reveal card when not provided', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.hasAttribute('data-testid')).toBe(false);
    });

    it('renders explainer alongside a correct option', () => {
      setInputs({
        mode: 'reveal',
        marker: 'B',
        text: 'Proxima Centauri',
        correct: true,
        explainer: 'Nearest star to the Sun.',
      });
      expect(host.querySelector('.chora-mcq-option__correct')).not.toBeNull();
      expect(host.querySelector('.chora-mcq-option__explainer')?.textContent?.trim()).toBe(
        'Nearest star to the Sun.',
      );
    });

    it('marks the reveal marker + correct icon aria-hidden', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const marker = host.querySelector('.chora-mcq-option__marker');
      const icon = host.querySelector('.chora-mcq-option__correct');
      expect(marker?.getAttribute('aria-hidden')).toBe('true');
      expect(icon?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ─── Reveal mode — chosen-answer indicator (FE result-reveal fix) ────

  describe('reveal mode — chosen-answer indicator', () => {
    it('sets data-selected="true" when the learner picked this option', () => {
      setInputs({ mode: 'reveal', marker: 'B', text: 'B', selected: true, correct: false });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.getAttribute('data-selected')).toBe('true');
    });

    it('defaults data-selected="false" when not picked', () => {
      setInputs({ mode: 'reveal', marker: 'A', text: 'A', correct: true });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.getAttribute('data-selected')).toBe('false');
    });

    it('renders the wrong icon + .is-wrong when the learner picked an incorrect option', () => {
      setInputs({ mode: 'reveal', marker: 'B', text: 'B', selected: true, correct: false });
      const card = host.querySelector('div.chora-mcq-option');
      expect(card?.classList.contains('is-wrong')).toBe(true);
      expect(host.querySelector('.chora-mcq-option__wrong')).not.toBeNull();
      // a wrong pick is never the correct answer — no green check
      expect(host.querySelector('.chora-mcq-option__correct')).toBeNull();
    });

    it('does NOT render the wrong icon when an unselected wrong option is revealed', () => {
      setInputs({ mode: 'reveal', marker: 'C', text: 'C', selected: false, correct: false });
      expect(host.querySelector('.chora-mcq-option__wrong')).toBeNull();
      expect(host.querySelector('div.chora-mcq-option')?.classList.contains('is-wrong')).toBe(false);
    });

    it('renders the "your answer" badge when picked (correct pick)', () => {
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'A',
        selected: true,
        correct: true,
        yourAnswerLabel: 'Your answer',
      });
      const badge = host.querySelector('.chora-mcq-option__badge--your');
      expect(badge).not.toBeNull();
      expect(badge?.textContent?.trim()).toContain('Your answer');
      expect(badge?.getAttribute('data-correct')).toBe('true');
      // a chosen-correct option still carries the green correct icon
      expect(host.querySelector('.chora-mcq-option__correct')).not.toBeNull();
    });

    it('renders the "your answer" badge marked wrong when picked an incorrect option', () => {
      setInputs({
        mode: 'reveal',
        marker: 'B',
        text: 'B',
        selected: true,
        correct: false,
        yourAnswerLabel: 'Your answer',
      });
      const badge = host.querySelector('.chora-mcq-option__badge--your');
      expect(badge).not.toBeNull();
      expect(badge?.getAttribute('data-correct')).toBe('false');
    });

    it('renders the "correct answer" badge on the correct option the learner did NOT pick', () => {
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'A',
        selected: false,
        correct: true,
        correctAnswerLabel: 'Correct answer',
      });
      const badge = host.querySelector('.chora-mcq-option__badge--answer');
      expect(badge).not.toBeNull();
      expect(badge?.textContent?.trim()).toContain('Correct answer');
      // it was NOT picked → no "your answer" badge here
      expect(host.querySelector('.chora-mcq-option__badge--your')).toBeNull();
    });

    it('suppresses the "correct answer" badge when the learner picked the correct option', () => {
      // chosen-correct shows "your answer" (green) only — not a redundant
      // "correct answer" badge.
      setInputs({
        mode: 'reveal',
        marker: 'A',
        text: 'A',
        selected: true,
        correct: true,
        yourAnswerLabel: 'Your answer',
        correctAnswerLabel: 'Correct answer',
      });
      expect(host.querySelector('.chora-mcq-option__badge--your')).not.toBeNull();
      expect(host.querySelector('.chora-mcq-option__badge--answer')).toBeNull();
    });

    it('shows no badges on a plain unselected wrong distractor', () => {
      setInputs({ mode: 'reveal', marker: 'D', text: 'D', selected: false, correct: false });
      expect(host.querySelector('.chora-mcq-option__badge')).toBeNull();
    });
  });

  // ─── Mode switching ─────────────────────────────────────────────────

  describe('mode switching', () => {
    it('swaps from interactive button to reveal div when mode changes', () => {
      setInputs({ mode: 'interactive', marker: 'A', text: 'A' });
      expect(host.querySelector('button.chora-mcq-option')).not.toBeNull();

      fixture.componentRef.setInput('mode', 'reveal');
      fixture.detectChanges();

      expect(host.querySelector('button.chora-mcq-option')).toBeNull();
      expect(host.querySelector('div.chora-mcq-option')).not.toBeNull();
    });
  });
});
