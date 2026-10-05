import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChoraQuestionReviewComponent } from './chora-question-review.component';
import {
  toQuestionReview,
  type QuestionReview,
} from './chora-question-review.model';
import { TranslateService } from '../../../core/services/translate.service';

class StubTranslateService {
  instant(k: string): string {
    return k;
  }
  get(k: string): string {
    return k;
  }
  stream(k: string): string {
    return k;
  }
}

const MCQ_REVIEW: QuestionReview = {
  question_type: 'mcq',
  options: [
    {
      option_id: 'opt_1',
      label: 'The right one',
      is_correct: true,
      explainer: 'Because the text says so.',
    },
    {
      option_id: 'opt_2',
      label: 'A distractor',
      is_correct: false,
      explainer: 'Wrong because of X.',
    },
  ],
  model_answer: null,
  rubric: [],
  question_image_url: null,
  answer_image_url: null,
};

const OE_REVIEW: QuestionReview = {
  question_type: 'oe',
  options: [],
  model_answer: 'A strong essay covers A, B and C.',
  rubric: [
    { title: 'Clarity', description: 'Is it readable?', weight: 50 },
    { title: 'Depth', description: null, weight: 50 },
  ],
  question_image_url: 'https://img/q.png',
  answer_image_url: 'https://img/a.png',
};

describe('ChoraQuestionReviewComponent', () => {
  let fixture: ComponentFixture<ChoraQuestionReviewComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChoraQuestionReviewComponent],
      providers: [{ provide: TranslateService, useClass: StubTranslateService }],
    }).compileComponents();
    fixture = TestBed.createComponent(ChoraQuestionReviewComponent);
    host = fixture.nativeElement as HTMLElement;
  });

  function setReview(r: QuestionReview, testIdPrefix = 'qr'): void {
    fixture.componentRef.setInput('review', r);
    fixture.componentRef.setInput('testIdPrefix', testIdPrefix);
    fixture.detectChanges();
  }

  describe('MCQ', () => {
    it('renders every option as a reveal mcq-option', () => {
      setReview(MCQ_REVIEW);
      const opts = host.querySelectorAll('chora-mcq-option');
      expect(opts.length).toBe(2);
    });

    it('marks the correct option as correct in the reveal', () => {
      setReview(MCQ_REVIEW);
      const correct = host.querySelector(
        '[data-testid="qr-option-opt_1"]',
      );
      const wrong = host.querySelector('[data-testid="qr-option-opt_2"]');
      expect(correct?.getAttribute('data-is-correct')).toBe('true');
      expect(wrong?.getAttribute('data-is-correct')).toBe('false');
    });

    it('renders the per-option grounding / explainer', () => {
      setReview(MCQ_REVIEW);
      expect(host.textContent).toContain('Because the text says so.');
      expect(host.textContent).toContain('Wrong because of X.');
    });

    it('does not render the OE model-answer block for an MCQ', () => {
      setReview(MCQ_REVIEW);
      expect(
        host.querySelector('.chora-question-review__model-answer'),
      ).toBeNull();
    });
  });

  describe('OE', () => {
    it('renders the model answer + rubric, not mcq options', () => {
      setReview(OE_REVIEW);
      expect(host.querySelectorAll('chora-mcq-option').length).toBe(0);
      expect(host.textContent).toContain('A strong essay covers A, B and C.');
      expect(host.textContent).toContain('Clarity');
      expect(host.textContent).toContain('Depth');
    });

    it('renders question + answer illustrations when present', () => {
      setReview(OE_REVIEW);
      const imgs = host.querySelectorAll('.chora-question-review img');
      expect(imgs.length).toBe(2);
    });
  });

  describe('toQuestionReview parser', () => {
    it('extracts is_correct + explainer from the author MCQ projection', () => {
      const review = toQuestionReview({
        question: {
          prompt: 'Why does SWE remain critical?',
          mcq: {
            image_url: 'https://q.png',
            answer_image_url: null,
            options: [
              {
                option_id: 'opt_1',
                label: 'Right',
                is_correct: true,
                explainer: 'yes',
              },
              { option_id: 'opt_2', label: 'Wrong', is_correct: false },
            ],
          },
        },
      });
      expect(review.question_type).toBe('mcq');
      expect(review.prompt).toBe('Why does SWE remain critical?');
      expect(review.options.length).toBe(2);
      expect(review.options[0]).toMatchObject({
        is_correct: true,
        explainer: 'yes',
        label: 'Right',
      });
      expect(review.options[1].is_correct).toBe(false);
      expect(review.options[1].explainer).toBeNull();
      expect(review.question_image_url).toBe('https://q.png');
    });

    it('extracts model answer + rubric for an OE projection', () => {
      const review = toQuestionReview({
        question: {
          oe: {
            model_answer: 'Sample',
            rubric: [{ title: 'Clarity', weight: 100 }],
          },
        },
      });
      expect(review.question_type).toBe('oe');
      expect(review.model_answer).toBe('Sample');
      expect(review.rubric[0]).toMatchObject({ title: 'Clarity', weight: 100 });
    });

    it('parses the live OE rubric shape ({ criteria } with description + weight_percent)', () => {
      // The AUTHOR projection ships oe.rubric as { criteria: [...] } with
      // `description` + `weight_percent` — NOT a flat [{title,weight}] array.
      // The old parser called .map on the object and threw, nuking the whole
      // OE review (empty prompt + missing model answer on the monitor).
      const review = toQuestionReview({
        question: {
          type: 'oe',
          prompt: 'Explain the three Sprint Planning topics.',
          oe: {
            model_answer: 'Topic One… Topic Two… Topic Three…',
            rubric: {
              criteria: [
                {
                  criterion_id: 'c1',
                  description: 'Topic One Identification',
                  weight_percent: 33,
                },
                {
                  criterion_id: 'c2',
                  description: 'Topic Two Identification',
                  weight_percent: 34,
                },
              ],
            },
            image_url: 'https://stem.png',
            answer_image_url: 'https://ans.png',
          },
        },
      });
      expect(review.question_type).toBe('oe');
      expect(review.prompt).toBe('Explain the three Sprint Planning topics.');
      expect(review.model_answer).toContain('Topic One');
      expect(review.rubric.length).toBe(2);
      expect(review.rubric[0]).toMatchObject({
        title: 'Topic One Identification',
        weight: 33,
      });
      expect(review.question_image_url).toBe('https://stem.png');
      expect(review.answer_image_url).toBe('https://ans.png');
    });

    it('defaults to an empty mcq review on a malformed payload', () => {
      const review = toQuestionReview({});
      expect(review.question_type).toBe('mcq');
      expect(review.options).toEqual([]);
      expect(review.model_answer).toBeNull();
    });
  });
});
