import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { McqFieldsComponent } from './mcq-fields.component';
import type { McqContent } from '../atom-authoring.model';

/**
 * McqFieldsComponent (Phase E) — editable MCQ form. The HITL edit
 * surface for MCQ content: stem + 2–6 options (default 4) +
 * single-correct radio + mandatory per-option explainer.
 *
 * Inputs:
 *   initialContent — McqContent (required) — seed on init; the
 *                    component thereafter owns the local draft state.
 *                    Re-seeded on identity change (e.g. parent loads
 *                    a fresh AI candidate).
 *   readonly       — boolean (default false) — locks all inputs +
 *                    Add/Remove buttons. Used post-publish where the
 *                    question_type is immutable per BE contract; the
 *                    parent decides exactly when to flip this on.
 *
 * Outputs:
 *   contentChanged — McqContent (emits on every edit; parent collects)
 *   validityChanged — boolean (emits on transitions only — debounced
 *                    to publish-ready vs not)
 *
 * Locked decisions (resume doc §4):
 *   - 2 ≤ options ≤ 6 (default 4 when initialContent has fewer)
 *   - single-correct in v1 (radio group, not checkboxes)
 *   - per-option explainer MANDATORY (publish blocks if empty)
 *   - type-immutable post-publish — but that's the parent's call
 *     (parent toggles readonly), not enforced here.
 *
 * Add/Remove option IDs use `crypto.randomUUID()` for stability —
 * each option's option_id persists across the option's lifetime in
 * the form so PATCH targets the right option server-side.
 */

function buildContent(overrides: Partial<McqContent> = {}): McqContent {
  const base: McqContent = {
    kind: 'manual',
    type: 'mcq',
    prompt: 'Which is a Scrum role?',
    mcq_payload: {
      options: [
        { option_id: 'opt_1', label: 'Product Owner', is_correct: true, explainer: 'PO owns backlog' },
        { option_id: 'opt_2', label: 'Project Manager', is_correct: false, explainer: 'Not a Scrum role' },
        { option_id: 'opt_3', label: 'Resource Manager', is_correct: false, explainer: 'Not a Scrum role' },
        { option_id: 'opt_4', label: 'Account Manager', is_correct: false, explainer: 'Not a Scrum role' },
      ],
    },
  };
  return { ...base, ...overrides };
}

function setup(
  initial: McqContent,
  readonly = false,
): { fixture: ComponentFixture<McqFieldsComponent>; element: HTMLElement } {
  const fixture = TestBed.createComponent(McqFieldsComponent);
  fixture.componentRef.setInput('initialContent', initial);
  fixture.componentRef.setInput('readonly', readonly);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('McqFieldsComponent (Phase E — editable MCQ form)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [McqFieldsComponent],
      providers: [provideHttpClient()],
    }).compileComponents();
  });

  describe('initial render', () => {
    it('renders one row per option in initialContent (4 default)', () => {
      const { element } = setup(buildContent());
      const rows = element.querySelectorAll('[data-testid^="mcq-fields-option-row-"]');
      expect(rows.length).toBe(4);
    });

    it('renders 2 rows when initialContent has 2 options', () => {
      const c = buildContent({
        mcq_payload: {
          options: [
            { option_id: 'opt_a', label: 'True', is_correct: true, explainer: 'Correct' },
            { option_id: 'opt_b', label: 'False', is_correct: false, explainer: 'Wrong' },
          ],
        },
      });
      const { element } = setup(c);
      expect(
        element.querySelectorAll('[data-testid^="mcq-fields-option-row-"]').length,
      ).toBe(2);
    });

    it('renders 6 rows when initialContent has 6 options', () => {
      const opts = Array.from({ length: 6 }).map((_, i) => ({
        option_id: `opt_${i}`,
        label: `Option ${i + 1}`,
        is_correct: i === 0,
        explainer: `Explainer ${i + 1}`,
      }));
      const { element } = setup(buildContent({ mcq_payload: { options: opts } }));
      expect(
        element.querySelectorAll('[data-testid^="mcq-fields-option-row-"]').length,
      ).toBe(6);
    });

    it('renders the prompt in the stem textarea', () => {
      const { element } = setup(buildContent());
      const stem = element.querySelector(
        '[data-testid="mcq-fields-prompt"]',
      ) as HTMLTextAreaElement;
      expect(stem.value).toBe('Which is a Scrum role?');
    });

    it('renders each option label in its input', () => {
      const { element } = setup(buildContent());
      const labelInputs = element.querySelectorAll<HTMLInputElement>(
        '[data-testid^="mcq-fields-option-label-"]',
      );
      expect(labelInputs[0].value).toBe('Product Owner');
      expect(labelInputs[2].value).toBe('Resource Manager');
    });

    it('renders each option explainer in its textarea', () => {
      const { element } = setup(buildContent());
      const explInputs = element.querySelectorAll<HTMLTextAreaElement>(
        '[data-testid^="mcq-fields-option-explainer-"]',
      );
      expect(explInputs[0].value).toBe('PO owns backlog');
    });

    it('renders correct-marker radio with the right option checked', () => {
      const { element } = setup(buildContent());
      const radios = element.querySelectorAll<HTMLInputElement>(
        '[data-testid^="mcq-fields-option-correct-"]',
      );
      expect(radios[0].checked).toBe(true);
      expect(radios[1].checked).toBe(false);
      expect(radios[2].checked).toBe(false);
      expect(radios[3].checked).toBe(false);
    });
  });

  describe('add / remove option', () => {
    it('Add Option button adds a new row (4 → 5)', () => {
      const { fixture, element } = setup(buildContent());
      (
        element.querySelector('[data-testid="mcq-fields-add-option"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid^="mcq-fields-option-row-"]').length,
      ).toBe(5);
    });

    it('Add Option button disabled at 6 options', () => {
      const opts = Array.from({ length: 6 }).map((_, i) => ({
        option_id: `opt_${i}`,
        label: `Option ${i + 1}`,
        is_correct: i === 0,
        explainer: 'x',
      }));
      const { element } = setup(buildContent({ mcq_payload: { options: opts } }));
      const btn = element.querySelector(
        '[data-testid="mcq-fields-add-option"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('Remove Option button removes the row (4 → 3)', () => {
      const { fixture, element } = setup(buildContent());
      (
        element.querySelector(
          '[data-testid="mcq-fields-remove-option-0"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid^="mcq-fields-option-row-"]').length,
      ).toBe(3);
    });

    it('Remove Option buttons disabled at 2 options (floor)', () => {
      const c = buildContent({
        mcq_payload: {
          options: [
            { option_id: 'opt_a', label: 'True', is_correct: true, explainer: 'x' },
            { option_id: 'opt_b', label: 'False', is_correct: false, explainer: 'x' },
          ],
        },
      });
      const { element } = setup(c);
      const btns = element.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="mcq-fields-remove-option-"]',
      );
      btns.forEach((btn) => expect(btn.disabled).toBe(true));
    });
  });

  describe('contentChanged emission', () => {
    it('emits when the prompt textarea is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="mcq-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = 'Updated stem';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy).toHaveBeenCalled();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.prompt).toBe('Updated stem');
    });

    it('emits when an option label is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const input = element.querySelector(
        '[data-testid="mcq-fields-option-label-0"]',
      ) as HTMLInputElement;
      input.value = 'Scrum Master';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.mcq_payload.options[0].label).toBe('Scrum Master');
    });

    it('emits when an option explainer is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const ta = element.querySelector(
        '[data-testid="mcq-fields-option-explainer-1"]',
      ) as HTMLTextAreaElement;
      ta.value = 'New explainer text';
      ta.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.mcq_payload.options[1].explainer).toBe('New explainer text');
    });

    it('emits with single-correct semantics when correct radio is changed', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      (
        element.querySelector('[data-testid="mcq-fields-option-correct-2"]') as HTMLInputElement
      ).click();
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.mcq_payload.options.map((o) => o.is_correct)).toEqual([
        false,
        false,
        true,
        false,
      ]);
    });

    it('emits after Add Option (now 5 entries, last is blank)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      (
        element.querySelector('[data-testid="mcq-fields-add-option"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.mcq_payload.options.length).toBe(5);
      expect(last.mcq_payload.options[4].label).toBe('');
      expect(last.mcq_payload.options[4].is_correct).toBe(false);
      expect(last.mcq_payload.options[4].explainer).toBe('');
    });

    it('emits after Remove Option (now 3 entries)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      (
        element.querySelector('[data-testid="mcq-fields-remove-option-3"]') as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as McqContent;
      expect(last.mcq_payload.options.length).toBe(3);
    });
  });

  describe('validityChanged emission (publish gate)', () => {
    it('emits true on init when content is valid (default 4-option fixture)', () => {
      const fixture = TestBed.createComponent(McqFieldsComponent);
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      fixture.componentRef.setInput('initialContent', buildContent());
      fixture.componentRef.setInput('readonly', false);
      fixture.detectChanges();
      // Last emission should be true (valid).
      expect(spy).toHaveBeenCalled();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(true);
    });

    it('emits false when prompt is cleared', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="mcq-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = '';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });

    it('emits false when any explainer is cleared (publish-blocking)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      const ta = element.querySelector(
        '[data-testid="mcq-fields-option-explainer-2"]',
      ) as HTMLTextAreaElement;
      ta.value = '';
      ta.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });

    it('emits false when no option is marked correct', () => {
      const c = buildContent({
        mcq_payload: {
          options: buildContent().mcq_payload.options.map((o) => ({ ...o, is_correct: false })),
        },
      });
      const fixture = TestBed.createComponent(McqFieldsComponent);
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      fixture.componentRef.setInput('initialContent', c);
      fixture.componentRef.setInput('readonly', false);
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });
  });

  describe('readonly lock', () => {
    it('readonly=true disables the stem textarea', () => {
      const { element } = setup(buildContent(), true);
      const stem = element.querySelector(
        '[data-testid="mcq-fields-prompt"]',
      ) as HTMLTextAreaElement;
      expect(stem.disabled).toBe(true);
    });

    it('readonly=true disables ALL option label inputs', () => {
      const { element } = setup(buildContent(), true);
      const inputs = element.querySelectorAll<HTMLInputElement>(
        '[data-testid^="mcq-fields-option-label-"]',
      );
      inputs.forEach((i) => expect(i.disabled).toBe(true));
    });

    it('readonly=true disables ALL option explainer textareas', () => {
      const { element } = setup(buildContent(), true);
      const tas = element.querySelectorAll<HTMLTextAreaElement>(
        '[data-testid^="mcq-fields-option-explainer-"]',
      );
      tas.forEach((t) => expect(t.disabled).toBe(true));
    });

    it('readonly=true disables ALL correct-marker radios', () => {
      const { element } = setup(buildContent(), true);
      const radios = element.querySelectorAll<HTMLInputElement>(
        '[data-testid^="mcq-fields-option-correct-"]',
      );
      radios.forEach((r) => expect(r.disabled).toBe(true));
    });

    it('readonly=true disables Add Option button', () => {
      const { element } = setup(buildContent(), true);
      const btn = element.querySelector(
        '[data-testid="mcq-fields-add-option"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('readonly=true disables ALL Remove Option buttons', () => {
      const { element } = setup(buildContent(), true);
      const btns = element.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="mcq-fields-remove-option-"]',
      );
      btns.forEach((b) => expect(b.disabled).toBe(true));
    });
  });
});
