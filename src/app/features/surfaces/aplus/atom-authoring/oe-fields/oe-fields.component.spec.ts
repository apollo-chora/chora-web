import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { OeFieldsComponent } from './oe-fields.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import type { OpenEndedContent } from '../atom-authoring.model';

class StubTranslateService {
  instant(key: string): string {
    return key;
  }
}

/**
 * OeFieldsComponent (Phase F) — editable Open-Ended form. The HITL
 * edit surface for OE content: stem + model_answer + optional rubric
 * criteria + optional min/max response chars + optional grader_tier.
 *
 * Inputs:
 *   initialContent — OpenEndedContent (required)
 *   readonly       — boolean (default false)
 *
 * Outputs:
 *   contentChanged — OpenEndedContent (emits on every edit)
 *   validityChanged — boolean (transitions only)
 *
 * Validity (drives publish CTA):
 *   - prompt non-empty trimmed
 *   - model_answer non-empty trimmed
 *   - if min/max chars both set: min ≤ max
 *
 * Rubric criteria are 0..N optional rows (Add/Remove buttons). Each
 * criterion has label / weight / description. New criterion_id minted
 * via crypto.randomUUID() — stable for the criterion's lifetime so
 * BE PATCH targets correctly.
 */

function buildContent(overrides: Partial<OpenEndedContent> = {}): OpenEndedContent {
  const base: OpenEndedContent = {
    kind: 'manual',
    type: 'oe',
    prompt: 'Explain story points.',
    oe_payload: {
      model_answer: 'Story points capture complexity + risk + effort.',
      rubric: [
        // Single criterion → weight must be 1.0 so rubricWeightsValid (the
        // sum==1.0 gate added with bug #2-A, 2026-06-03) treats the default
        // fixture as valid. A 0.4 sole weight left the form invalid on init,
        // breaking the validityChanged tests.
        { criterion_id: 'c1', title: 'Captures complexity', weight: 1.0 },
      ],
      min_response_chars: 50,
      max_response_chars: 500,
      grader_tier: 'T1',
    },
  };
  return { ...base, ...overrides };
}

function setup(
  initial: OpenEndedContent,
  readonly = false,
  existingQuestionId: string | null = null,
  modelAnswerInFlight = false,
): { fixture: ComponentFixture<OeFieldsComponent>; element: HTMLElement } {
  const fixture = TestBed.createComponent(OeFieldsComponent);
  fixture.componentRef.setInput('initialContent', initial);
  fixture.componentRef.setInput('readonly', readonly);
  fixture.componentRef.setInput('existingQuestionId', existingQuestionId);
  fixture.componentRef.setInput('modelAnswerInFlight', modelAnswerInFlight);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('OeFieldsComponent (Phase F — editable Open-Ended form)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OeFieldsComponent],
      providers: [
        provideHttpClient(),
        { provide: TranslateService, useClass: StubTranslateService },
      ],
    }).compileComponents();
  });

  describe('initial render', () => {
    it('renders the prompt in the stem textarea', () => {
      const { element } = setup(buildContent());
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      expect(stem.value).toBe('Explain story points.');
    });

    it('renders the model_answer in its textarea', () => {
      const { element } = setup(buildContent());
      const ma = element.querySelector(
        '[data-testid="oe-fields-model-answer"]',
      ) as HTMLTextAreaElement;
      expect(ma.value).toContain('Story points capture');
    });

    it('renders the min/max response chars when set', () => {
      const { element } = setup(buildContent());
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      const maxInput = element.querySelector(
        '[data-testid="oe-fields-max-chars"]',
      ) as HTMLInputElement;
      expect(minInput.value).toBe('50');
      expect(maxInput.value).toBe('500');
    });

    it('renders grader_tier in the select', () => {
      const { element } = setup(buildContent());
      const sel = element.querySelector(
        '[data-testid="oe-fields-grader-tier"]',
      ) as HTMLSelectElement;
      // Fixture seeds `grader_tier: 'T1'`. Tier enum tightened 2026-05-16
      // to T1 | T2 (per atom-authoring.model.ts OePayload — was the
      // legacy `rubric | llm_assisted | manual` triplet, BE now rejects
      // those values).
      expect(sel.value).toBe('T1');
    });

    it('renders one row per rubric criterion', () => {
      const { element } = setup(buildContent());
      const rows = element.querySelectorAll(
        '[data-testid^="oe-fields-rubric-row-"]',
      );
      expect(rows.length).toBe(1);
    });

    it('renders zero rubric rows when initialContent has no criteria', () => {
      const { element } = setup(
        buildContent({
          oe_payload: { model_answer: 'X' },
        }),
      );
      const rows = element.querySelectorAll(
        '[data-testid^="oe-fields-rubric-row-"]',
      );
      expect(rows.length).toBe(0);
    });

    it('renders empty min/max + null grader_tier gracefully', () => {
      const { element } = setup(
        buildContent({
          oe_payload: { model_answer: 'X' },
        }),
      );
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      const maxInput = element.querySelector(
        '[data-testid="oe-fields-max-chars"]',
      ) as HTMLInputElement;
      expect(minInput.value).toBe('');
      expect(maxInput.value).toBe('');
    });
  });

  describe('add / remove rubric criterion', () => {
    it('Add Criterion button adds a new row', () => {
      const { fixture, element } = setup(buildContent());
      (
        element.querySelector(
          '[data-testid="oe-fields-add-criterion"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const rows = element.querySelectorAll(
        '[data-testid^="oe-fields-rubric-row-"]',
      );
      expect(rows.length).toBe(2);
    });

    it('Remove Criterion button removes the row', () => {
      const { fixture, element } = setup(buildContent());
      (
        element.querySelector(
          '[data-testid="oe-fields-remove-criterion-0"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const rows = element.querySelectorAll(
        '[data-testid^="oe-fields-rubric-row-"]',
      );
      expect(rows.length).toBe(0);
    });
  });

  describe('contentChanged emission', () => {
    it('emits when the prompt textarea is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = 'New stem';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.prompt).toBe('New stem');
    });

    it('emits when the model_answer is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const ma = element.querySelector(
        '[data-testid="oe-fields-model-answer"]',
      ) as HTMLTextAreaElement;
      ma.value = 'Updated model answer';
      ma.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.model_answer).toBe('Updated model answer');
    });

    it('emits when min/max chars are edited (number coercion)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      minInput.value = '100';
      minInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.min_response_chars).toBe(100);
    });

    it('clearing min/max chars sets the field to null', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      minInput.value = '';
      minInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.min_response_chars).toBeNull();
    });

    it('emits when grader_tier select changes', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const sel = element.querySelector(
        '[data-testid="oe-fields-grader-tier"]',
      ) as HTMLSelectElement;
      // Tier enum tightened 2026-05-16 to T1 | T2 (BE rejects legacy
      // rubric | llm_assisted | manual values). Flipping fixture T1 → T2.
      sel.value = 'T2';
      sel.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.grader_tier).toBe('T2');
    });

    it('emits with empty rubric after Remove (now 0 entries)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      (
        element.querySelector(
          '[data-testid="oe-fields-remove-criterion-0"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.rubric?.length ?? 0).toBe(0);
    });

    it('emits when a rubric criterion label is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const input = element.querySelector(
        '[data-testid="oe-fields-rubric-label-0"]',
      ) as HTMLInputElement;
      input.value = 'New criterion label';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.rubric![0].title).toBe('New criterion label');
    });

    it('emits when a rubric criterion weight is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const input = element.querySelector(
        '[data-testid="oe-fields-rubric-weight-0"]',
      ) as HTMLInputElement;
      input.value = '0.6';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.rubric![0].weight).toBe(0.6);
    });
  });

  describe('validityChanged emission', () => {
    it('emits true on init when content is valid (default fixture)', () => {
      const fixture = TestBed.createComponent(OeFieldsComponent);
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      fixture.componentRef.setInput('initialContent', buildContent());
      fixture.componentRef.setInput('readonly', false);
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(true);
    });

    it('emits false when prompt is cleared', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = '';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });

    it('emits false when model_answer is cleared', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      const ma = element.querySelector(
        '[data-testid="oe-fields-model-answer"]',
      ) as HTMLTextAreaElement;
      ma.value = '';
      ma.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });

    it('emits false when min > max chars', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      // Set min > max
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      minInput.value = '600';
      minInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });
  });

  describe('readonly lock', () => {
    it('readonly=true disables prompt + model_answer textareas', () => {
      const { element } = setup(buildContent(), true);
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      const ma = element.querySelector(
        '[data-testid="oe-fields-model-answer"]',
      ) as HTMLTextAreaElement;
      expect(stem.disabled).toBe(true);
      expect(ma.disabled).toBe(true);
    });

    it('readonly=true disables min/max char inputs', () => {
      const { element } = setup(buildContent(), true);
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      const maxInput = element.querySelector(
        '[data-testid="oe-fields-max-chars"]',
      ) as HTMLInputElement;
      expect(minInput.disabled).toBe(true);
      expect(maxInput.disabled).toBe(true);
    });

    it('readonly=true disables grader_tier select', () => {
      const { element } = setup(buildContent(), true);
      const sel = element.querySelector(
        '[data-testid="oe-fields-grader-tier"]',
      ) as HTMLSelectElement;
      expect(sel.disabled).toBe(true);
    });

    it('readonly=true disables Add Criterion button', () => {
      const { element } = setup(buildContent(), true);
      const btn = element.querySelector(
        '[data-testid="oe-fields-add-criterion"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('readonly=true disables ALL Remove Criterion buttons', () => {
      const { element } = setup(buildContent(), true);
      const btns = element.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="oe-fields-remove-criterion-"]',
      );
      btns.forEach((b) => expect(b.disabled).toBe(true));
    });
  });

  describe('Phase I.2 — model-answer AI trigger (RE-ENABLED 2026-06-28, CHO-1658)', () => {
    // The AI "generate model answer" button was repointed off the dead
    // us-central1 Agent Engine onto the live GKE qgen crew (intent=
    // model_answer_fill). It is gated on the question being saved
    // (existingQuestionId non-null) and emits modelAnswerRequested for the
    // parent to POST .../ai-model-answer-jobs.
    it('renders the model-answer AI button', () => {
      const { element } = setup(buildContent());
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      );
      expect(btn).toBeTruthy();
    });

    it('button is disabled when existingQuestionId=null', () => {
      const { element } = setup(buildContent(), false, null);
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('button is enabled when existingQuestionId is set', () => {
      const { element } = setup(buildContent(), false, 'q-123');
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('button is disabled while modelAnswerInFlight=true', () => {
      const { element } = setup(buildContent(), false, 'q-123', true);
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('button is disabled when readonly=true even with questionId set', () => {
      const { element } = setup(buildContent(), true, 'q-123');
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('shows the "Save first" hint when existingQuestionId=null', () => {
      const { element } = setup(buildContent(), false, null);
      const hint = element.querySelector(
        '[data-testid="oe-fields-model-answer-hint"]',
      );
      expect(hint).toBeTruthy();
    });

    it('does NOT show the hint when existingQuestionId is set', () => {
      const { element } = setup(buildContent(), false, 'q-123');
      const hint = element.querySelector(
        '[data-testid="oe-fields-model-answer-hint"]',
      );
      expect(hint).toBeFalsy();
    });

    it('uses the Generate label when model_answer is empty', () => {
      const blank = buildContent({
        oe_payload: {
          model_answer: '',
          rubric: [],
          min_response_chars: null,
          max_response_chars: null,
          grader_tier: null,
        },
      });
      const { element } = setup(blank, false, 'q-123');
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      );
      expect(btn?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.model_answer_generate',
      );
    });

    it('uses the Regenerate label when model_answer is already populated', () => {
      const { element } = setup(buildContent(), false, 'q-123');
      const btn = element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      );
      expect(btn?.textContent).toContain(
        'aplus.atom_authoring.ai_assist.model_answer_regenerate',
      );
    });

    it('emits modelAnswerRequested with regenerate=false when answer is empty', () => {
      const blank = buildContent({
        oe_payload: {
          model_answer: '',
          rubric: [],
          min_response_chars: null,
          max_response_chars: null,
          grader_tier: null,
        },
      });
      const { fixture, element } = setup(blank, false, 'q-123');
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      (element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith({ regenerate: false });
    });

    it('emits modelAnswerRequested with regenerate=true when answer is populated', () => {
      const { fixture, element } = setup(buildContent(), false, 'q-123');
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      (element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement).click();
      expect(spy).toHaveBeenCalledWith({ regenerate: true });
    });

    it('does NOT emit when the button is disabled (no questionId)', () => {
      const { fixture, element } = setup(buildContent(), false, null);
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      (element.querySelector(
        '[data-testid="oe-fields-model-answer-ai"]',
      ) as HTMLButtonElement).click();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('W8 image-gen — display-only image slots', () => {
    it('renders the question/stem image when image_url present on initialContent', () => {
      const { element } = setup(
        buildContent({ image_url: 'https://cdn.test/stem.png' }),
      );
      const img = element.querySelector(
        '[data-testid="oe-fields-image-img"]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      // jsdom resolves [src] to an absolute URL.
      expect(img!.getAttribute('src')).toBe('https://cdn.test/stem.png');
    });

    it('renders NO question image when image_url absent', () => {
      const { element } = setup(buildContent());
      expect(
        element.querySelector('[data-testid="oe-fields-image-img"]'),
      ).toBeNull();
    });

    it('renders the model-answer image when answer_image_url present', () => {
      const { element } = setup(
        buildContent({ answer_image_url: 'https://cdn.test/answer.png' }),
      );
      const img = element.querySelector(
        '[data-testid="oe-fields-answer-image-img"]',
      ) as HTMLImageElement | null;
      expect(img).not.toBeNull();
      expect(img!.getAttribute('src')).toBe('https://cdn.test/answer.png');
    });

    it('renders NO model-answer image when answer_image_url absent', () => {
      const { element } = setup(buildContent());
      expect(
        element.querySelector('[data-testid="oe-fields-answer-image-img"]'),
      ).toBeNull();
    });

    it('imageUrl / answerImageUrl computed reflect the input', () => {
      const { fixture } = setup(
        buildContent({
          image_url: 'https://cdn.test/q.png',
          answer_image_url: 'https://cdn.test/a.png',
        }),
      );
      expect(fixture.componentInstance.imageUrl()).toBe('https://cdn.test/q.png');
      expect(fixture.componentInstance.answerImageUrl()).toBe(
        'https://cdn.test/a.png',
      );
    });

    it('carries image_url + answer_image_url through on contentChanged emit', () => {
      const { fixture, element } = setup(
        buildContent({
          image_url: 'https://cdn.test/q.png',
          answer_image_url: 'https://cdn.test/a.png',
        }),
      );
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = 'Edited stem keeps images';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.image_url).toBe('https://cdn.test/q.png');
      expect(last.answer_image_url).toBe('https://cdn.test/a.png');
    });

    it('omits image keys on emit when the input carries no images', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      stem.value = 'No images here';
      stem.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect('image_url' in last).toBe(false);
      expect('answer_image_url' in last).toBe(false);
    });
  });

  describe('rubric weight sum + validity gate (bug #2-A)', () => {
    function twoCriteria(w0: number, w1: number): OpenEndedContent {
      return buildContent({
        oe_payload: {
          model_answer: 'MA',
          rubric: [
            { criterion_id: 'a', title: 'A', weight: w0 },
            { criterion_id: 'b', title: 'B', weight: w1 },
          ],
        },
      });
    }

    it('rubricWeightSum / rubricWeightPercent reflect the criterion weights', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.4));
      expect(fixture.componentInstance.rubricWeightSum()).toBeCloseTo(0.7);
      expect(fixture.componentInstance.rubricWeightPercent()).toBe(70);
    });

    it('rubricWeightsValid is true (vacuous) when there are no criteria', () => {
      const { fixture } = setup(
        buildContent({ oe_payload: { model_answer: 'X' } }),
      );
      expect(fixture.componentInstance.rubricWeightsValid()).toBe(true);
    });

    it('rubricWeightsValid is false when weights do not sum to 1.0', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.4));
      expect(fixture.componentInstance.rubricWeightsValid()).toBe(false);
    });

    it('rubricWeightsValid is true when weights sum to exactly 1.0', () => {
      const { fixture } = setup(twoCriteria(0.5, 0.5));
      expect(fixture.componentInstance.rubricWeightsValid()).toBe(true);
    });

    it('renders the weight-sum error + normalize button when sum != 100%', () => {
      const { element } = setup(twoCriteria(0.3, 0.4));
      const err = element.querySelector(
        '[data-testid="oe-fields-rubric-weight-error"]',
      );
      expect(err).not.toBeNull();
      expect(err!.textContent).toContain('70%');
      expect(
        element.querySelector('[data-testid="oe-fields-normalize-weights"]'),
      ).not.toBeNull();
    });

    it('hides the weight-sum error when weights sum to 100%', () => {
      const { element } = setup(twoCriteria(0.5, 0.5));
      expect(
        element.querySelector('[data-testid="oe-fields-rubric-weight-error"]'),
      ).toBeNull();
    });

    it('isValid is false when rubric weights are off (gate blocks publish)', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.4));
      expect(fixture.componentInstance.isValid()).toBe(false);
    });

    it('validityChanged emits false on init when rubric weights are off', () => {
      const fixture = TestBed.createComponent(OeFieldsComponent);
      const spy = vi.fn();
      fixture.componentInstance.validityChanged.subscribe(spy);
      fixture.componentRef.setInput('initialContent', twoCriteria(0.3, 0.4));
      fixture.componentRef.setInput('readonly', false);
      fixture.detectChanges();
      expect(spy.mock.calls[spy.mock.calls.length - 1][0]).toBe(false);
    });
  });

  describe('normalizeRubricWeights', () => {
    function twoCriteria(w0: number, w1: number): OpenEndedContent {
      return buildContent({
        oe_payload: {
          model_answer: 'MA',
          rubric: [
            { criterion_id: 'a', title: 'A', weight: w0 },
            { criterion_id: 'b', title: 'B', weight: w1 },
          ],
        },
      });
    }

    it('scales weights to sum to 1.0 preserving proportions', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.6));
      fixture.componentInstance.normalizeRubricWeights();
      const sum = fixture.componentInstance.rubricWeightSum();
      expect(sum).toBeCloseTo(1.0, 2);
      const crit = fixture.componentInstance.rubricCriteria();
      // 0.3 / 0.9 = 0.333, 0.6 / 0.9 = 0.667.
      expect(crit[0].weight).toBeCloseTo(0.333, 2);
      expect(crit[1].weight).toBeCloseTo(0.667, 2);
    });

    it('flips rubricWeightsValid true after normalize', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.6));
      expect(fixture.componentInstance.rubricWeightsValid()).toBe(false);
      fixture.componentInstance.normalizeRubricWeights();
      expect(fixture.componentInstance.rubricWeightsValid()).toBe(true);
    });

    it('clicking the Normalize button normalizes the weights', () => {
      const { fixture, element } = setup(twoCriteria(0.3, 0.6));
      (
        element.querySelector(
          '[data-testid="oe-fields-normalize-weights"]',
        ) as HTMLButtonElement
      ).click();
      fixture.detectChanges();
      expect(fixture.componentInstance.rubricWeightSum()).toBeCloseTo(1.0, 2);
    });

    it('is a no-op when the weight sum is 0', () => {
      const { fixture } = setup(twoCriteria(0, 0));
      fixture.componentInstance.normalizeRubricWeights();
      const crit = fixture.componentInstance.rubricCriteria();
      expect(crit[0].weight).toBe(0);
      expect(crit[1].weight).toBe(0);
    });

    it('is a no-op when readonly', () => {
      const { fixture } = setup(twoCriteria(0.3, 0.6), true);
      fixture.componentInstance.normalizeRubricWeights();
      // Weights unchanged because canEdit() is false.
      const crit = fixture.componentInstance.rubricCriteria();
      expect(crit[0].weight).toBe(0.3);
      expect(crit[1].weight).toBe(0.6);
    });
  });

  describe('rubric criterion description input', () => {
    it('emits with updated description when the description field is edited', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const input = element.querySelector(
        '[data-testid="oe-fields-rubric-description-0"]',
      ) as HTMLInputElement;
      input.value = 'Covers edge cases';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.rubric![0].description).toBe('Covers edge cases');
    });

    it('renders an existing criterion description in the field', () => {
      const { element } = setup(
        buildContent({
          oe_payload: {
            model_answer: 'MA',
            rubric: [
              {
                criterion_id: 'c1',
                title: 'T',
                weight: 1.0,
                description: 'Existing desc',
              },
            ],
          },
        }),
      );
      const input = element.querySelector(
        '[data-testid="oe-fields-rubric-description-0"]',
      ) as HTMLInputElement;
      expect(input.value).toBe('Existing desc');
    });
  });

  describe('onCriterionWeightInput edge cases', () => {
    it('ignores a non-finite weight value (no mutation)', () => {
      const { fixture } = setup(buildContent());
      const before = fixture.componentInstance.rubricCriteria()[0].weight;
      fixture.componentInstance.onCriterionWeightInput(0, 'not-a-number');
      const after = fixture.componentInstance.rubricCriteria()[0].weight;
      expect(after).toBe(before);
    });
  });

  describe('onGraderTierChange', () => {
    it('resets grader_tier to null when "" is selected', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      const sel = element.querySelector(
        '[data-testid="oe-fields-grader-tier"]',
      ) as HTMLSelectElement;
      sel.value = '';
      sel.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.grader_tier).toBeNull();
    });

    it('ignores an unknown tier value (keeps prior value)', () => {
      const { fixture } = setup(buildContent());
      fixture.componentInstance.onGraderTierChange('T9');
      expect(fixture.componentInstance.graderTier()).toBe('T1');
    });
  });

  describe('add / remove no-op when readonly', () => {
    it('addCriterion is a no-op when readonly', () => {
      const { fixture } = setup(buildContent(), true);
      const before = fixture.componentInstance.rubricCriteria().length;
      fixture.componentInstance.addCriterion();
      expect(fixture.componentInstance.rubricCriteria().length).toBe(before);
    });

    it('removeCriterion is a no-op when readonly', () => {
      const { fixture } = setup(buildContent(), true);
      const before = fixture.componentInstance.rubricCriteria().length;
      fixture.componentInstance.removeCriterion(0);
      expect(fixture.componentInstance.rubricCriteria().length).toBe(before);
    });

    it('addCriterion mints a unique criterion_id for the new row', () => {
      const { fixture } = setup(buildContent());
      fixture.componentInstance.addCriterion();
      const crit = fixture.componentInstance.rubricCriteria();
      expect(crit.length).toBe(2);
      expect(crit[1].criterion_id).toBeTruthy();
      expect(crit[1].criterion_id).not.toBe(crit[0].criterion_id);
      expect(crit[1].title).toBe('');
      expect(crit[1].weight).toBe(0);
    });
  });

  describe('dormant model-answer wiring (template button removed, methods retained)', () => {
    it('canRequestModelAnswer true only with an existingQuestionId, editable, not in-flight', () => {
      const { fixture } = setup(buildContent(), false, 'q-1', false);
      expect(fixture.componentInstance.canRequestModelAnswer()).toBe(true);
    });

    it('canRequestModelAnswer false when no existingQuestionId', () => {
      const { fixture } = setup(buildContent(), false, null, false);
      expect(fixture.componentInstance.canRequestModelAnswer()).toBe(false);
    });

    it('canRequestModelAnswer false when readonly', () => {
      const { fixture } = setup(buildContent(), true, 'q-1', false);
      expect(fixture.componentInstance.canRequestModelAnswer()).toBe(false);
    });

    it('canRequestModelAnswer false when a model-answer call is in flight', () => {
      const { fixture } = setup(buildContent(), false, 'q-1', true);
      expect(fixture.componentInstance.canRequestModelAnswer()).toBe(false);
    });

    it('modelAnswerCtaKey is the regenerate key when a model_answer exists', () => {
      const { fixture } = setup(buildContent(), false, 'q-1');
      expect(fixture.componentInstance.modelAnswerCtaKey()).toBe(
        'aplus.atom_authoring.ai_assist.model_answer_regenerate',
      );
    });

    it('modelAnswerCtaKey is the generate key when model_answer is empty', () => {
      const { fixture } = setup(
        buildContent({ oe_payload: { model_answer: '' } }),
        false,
        'q-1',
      );
      expect(fixture.componentInstance.modelAnswerCtaKey()).toBe(
        'aplus.atom_authoring.ai_assist.model_answer_generate',
      );
    });

    it('requestModelAnswer emits regenerate=true when a model_answer is present', () => {
      const { fixture } = setup(buildContent(), false, 'q-1');
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      fixture.componentInstance.requestModelAnswer();
      expect(spy).toHaveBeenCalledWith({ regenerate: true });
    });

    it('requestModelAnswer emits regenerate=false when model_answer is empty', () => {
      const { fixture } = setup(
        buildContent({ oe_payload: { model_answer: '' } }),
        false,
        'q-1',
      );
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      fixture.componentInstance.requestModelAnswer();
      expect(spy).toHaveBeenCalledWith({ regenerate: false });
    });

    it('requestModelAnswer does NOT emit when it cannot request (no question id)', () => {
      const { fixture } = setup(buildContent(), false, null);
      const spy = vi.fn();
      fixture.componentInstance.modelAnswerRequested.subscribe(spy);
      fixture.componentInstance.requestModelAnswer();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('trackByCriterionId + canEdit', () => {
    it('trackByCriterionId returns the criterion_id', () => {
      const { fixture } = setup(buildContent());
      const c = fixture.componentInstance.rubricCriteria()[0];
      expect(fixture.componentInstance.trackByCriterionId(0, c)).toBe(
        c.criterion_id,
      );
    });

    it('canEdit is true when not readonly, false when readonly', () => {
      const editable = setup(buildContent(), false);
      expect(editable.fixture.componentInstance.canEdit()).toBe(true);
      const locked = setup(buildContent(), true);
      expect(locked.fixture.componentInstance.canEdit()).toBe(false);
    });
  });

  describe('identity-change reseed', () => {
    it('reseeds the form when initialContent identity changes', () => {
      const { fixture, element } = setup(buildContent());
      const next = buildContent({
        prompt: 'A fresh question',
        oe_payload: {
          model_answer: 'Fresh model answer',
          rubric: [{ criterion_id: 'z', title: 'Z', weight: 1.0 }],
          min_response_chars: 10,
          max_response_chars: 20,
          grader_tier: 'T2',
        },
      });
      fixture.componentRef.setInput('initialContent', next);
      fixture.detectChanges();
      const stem = element.querySelector(
        '[data-testid="oe-fields-prompt"]',
      ) as HTMLTextAreaElement;
      expect(stem.value).toBe('A fresh question');
      expect(fixture.componentInstance.modelAnswer()).toBe('Fresh model answer');
      expect(fixture.componentInstance.graderTier()).toBe('T2');
    });
  });

  // ── Uncovered-arm augmentation ───────────────────────────────────────
  // Targets the conditional arms not exercised by the suite above:
  // parseIntOrNull non-finite guard, rubricWeightSum non-finite ternary,
  // newCriterionId crypto-absent fallback, onGraderTierChange T1 arm, and
  // the isValid min/max short-circuit when only one bound is set.

  describe('parseIntOrNull — non-finite + truncation arms', () => {
    it('a non-numeric (non-empty) min-chars value resolves to null (NaN guard)', () => {
      const { fixture, element } = setup(buildContent());
      const spy = vi.fn();
      fixture.componentInstance.contentChanged.subscribe(spy);
      // 'abc' trims non-empty so it passes the empty-string guard, then
      // Number('abc') === NaN trips the !Number.isFinite branch → null.
      const minInput = element.querySelector(
        '[data-testid="oe-fields-min-chars"]',
      ) as HTMLInputElement;
      minInput.value = 'abc';
      minInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(fixture.componentInstance.minResponseChars()).toBeNull();
      const last = spy.mock.calls[spy.mock.calls.length - 1][0] as OpenEndedContent;
      expect(last.oe_payload.min_response_chars).toBeNull();
    });

    it('truncates a fractional max-chars value to an integer', () => {
      const { fixture } = setup(buildContent());
      fixture.componentInstance.onMaxCharsInput('123.9');
      expect(fixture.componentInstance.maxResponseChars()).toBe(123);
    });
  });

  describe('rubricWeightSum — non-finite weight ternary false arm', () => {
    it('treats a non-finite (NaN) criterion weight as 0 in the sum', () => {
      const { fixture } = setup(
        buildContent({
          oe_payload: {
            model_answer: 'MA',
            rubric: [
              { criterion_id: 'a', title: 'A', weight: 0.5 },
              // NaN weight: Number.isFinite(NaN) === false → contributes 0.
              { criterion_id: 'b', title: 'B', weight: Number.NaN },
            ],
          },
        }),
      );
      expect(fixture.componentInstance.rubricWeightSum()).toBeCloseTo(0.5);
      expect(fixture.componentInstance.rubricWeightPercent()).toBe(50);
    });
  });

  describe('newCriterionId — crypto.randomUUID-absent fallback', () => {
    it('mints a crit-prefixed id when crypto.randomUUID is unavailable', () => {
      const original = crypto.randomUUID;
      // Force the typeof-function guard to be false so the fallback branch
      // (`crit-${Date.now()}-${random}`) runs.
      (crypto as unknown as { randomUUID: unknown }).randomUUID = undefined;
      try {
        const { fixture } = setup(buildContent());
        fixture.componentInstance.addCriterion();
        const crit = fixture.componentInstance.rubricCriteria();
        expect(crit.length).toBe(2);
        expect(crit[1].criterion_id).toMatch(/^crit-\d+-/);
      } finally {
        (crypto as unknown as { randomUUID: unknown }).randomUUID = original;
      }
    });
  });

  describe('onGraderTierChange — T1 arm', () => {
    it('sets grader_tier back to T1 explicitly', () => {
      const { fixture } = setup(buildContent());
      // Move off the seeded T1 first so the assertion is meaningful, then
      // drive the `value === 'T1'` true arm of the OR.
      fixture.componentInstance.onGraderTierChange('');
      expect(fixture.componentInstance.graderTier()).toBeNull();
      fixture.componentInstance.onGraderTierChange('T1');
      expect(fixture.componentInstance.graderTier()).toBe('T1');
    });
  });

  describe('isValid — min/max short-circuit when only one bound is set', () => {
    it('stays valid when min is set but max is null (skips the min>max check)', () => {
      const { fixture } = setup(
        buildContent({
          oe_payload: {
            model_answer: 'MA',
            // No rubric → rubricWeightsValid vacuously true.
            min_response_chars: 9999,
            max_response_chars: null,
          },
        }),
      );
      // min != null but max == null → the `&& max != null` short-circuits
      // false, so the min>max guard never fires → still valid.
      expect(fixture.componentInstance.isValid()).toBe(true);
    });
  });
});
