import { afterEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { FamiliarAnswerableWidgetComponent } from './familiar-answerable-widget.component';
import { TranslateService } from '../../../core/services/translate.service';
import type { AnswerableItem } from '../../../core/familiar/familiar-growth.model';

/**
 * CHO-2016 quiz_me / socratic_drill "answerable-pipe" reply widget. Mirrors
 * the BE contract (familiar_skill_invoke_answerable.go): a framing narration
 * PLUS an items[] channel of atom REFERENCES ONLY — no stem/options, no
 * server-graded submit here. The learner answers for real credit through the
 * EXISTING atom-play flow (`/a/atoms/{atomId}/play`); this widget's self-check
 * is a local, ungraded recall affordance only.
 */
function item(over: Partial<AnswerableItem> = {}): AnswerableItem {
  return {
    atomId: '01970000-a11a-7000-8000-0000000000a1',
    title: 'Long division remainder',
    topic: 'arithmetic',
    difficulty: 2,
    reason: 'weak_spot',
    ...over,
  };
}

function setup(reply: string, items: readonly AnswerableItem[]) {
  TestBed.configureTestingModule({
    imports: [FamiliarAnswerableWidgetComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(FamiliarAnswerableWidgetComponent);
  fixture.componentRef.setInput('reply', reply);
  fixture.componentRef.setInput('items', items);
  fixture.detectChanges();
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('FamiliarAnswerableWidgetComponent', () => {
  let httpMock: HttpTestingController;

  afterEach(() => httpMock?.verify());

  it('renders the Familiar framing narration', () => {
    const s = setup('Let’s warm up your shakiest spots.', []);
    httpMock = s.httpMock;
    expect(s.el.textContent ?? '').toContain(
      'Let’s warm up your shakiest spots.',
    );
  });

  it('renders a retrieval-practice notice that never implies goal progress', () => {
    const s = setup('framing', []);
    httpMock = s.httpMock;
    const notice = s.el.querySelector(
      '[data-testid="familiar-answerable-notice"]',
    );
    expect(notice).not.toBeNull();
    // Raw i18n key asserted per the dev raw-key contract (ADR-206 era).
    expect(notice!.textContent).toContain('familiar_loadout.answerable_notice');
  });

  it('renders an honest empty-state hint when items is empty, no item list', () => {
    const s = setup('nothing to quiz yet', []);
    httpMock = s.httpMock;
    const empty = s.el.querySelector(
      '[data-testid="familiar-answerable-empty"]',
    );
    expect(empty).not.toBeNull();
    expect(
      s.el.querySelector('[data-testid="familiar-answerable-items"]'),
    ).toBeNull();
  });

  it('renders one practice card per item with title/topic/difficulty/reason', () => {
    const items = [
      item({
        atomId: 'a-1',
        title: 'Long division remainder',
        topic: 'arithmetic',
        difficulty: 2,
        reason: 'weak_spot',
      }),
      item({
        atomId: 'a-2',
        title: 'Carrying digits',
        topic: 'arithmetic',
        difficulty: 1,
        reason: 'due_for_review',
      }),
    ];
    const s = setup('framing', items);
    httpMock = s.httpMock;

    expect(
      s.el.querySelectorAll('[data-testid^="familiar-answerable-item-"]')
        .length,
    ).toBe(2);

    const first = s.el.querySelector(
      '[data-testid="familiar-answerable-item-a-1"]',
    );
    expect(first).not.toBeNull();
    expect(first!.textContent).toContain('Long division remainder');
    expect(first!.textContent).toContain('arithmetic');
    expect(first!.textContent).toContain('2');
    expect(first!.textContent).toContain(
      'familiar_loadout.answerable_reason_weak_spot',
    );

    const second = s.el.querySelector(
      '[data-testid="familiar-answerable-item-a-2"]',
    );
    expect(second!.textContent).toContain(
      'familiar_loadout.answerable_reason_due_for_review',
    );
  });

  it('links the practice CTA to the existing atom-play route (no new submit path)', () => {
    const s = setup('framing', [item({ atomId: 'atom-xyz' })]);
    httpMock = s.httpMock;
    const link = s.el.querySelector(
      '[data-testid="familiar-answerable-practice-atom-xyz"]',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/a/atoms/atom-xyz/play');
  });

  it('self-check got-it/still-learning is a LOCAL toggle only — no HTTP fires', () => {
    const s = setup('framing', [item({ atomId: 'atom-xyz' })]);
    httpMock = s.httpMock;
    const gotIt = s.el.querySelector(
      '[data-testid="familiar-answerable-gotit-atom-xyz"]',
    ) as HTMLButtonElement;
    const stillLearning = s.el.querySelector(
      '[data-testid="familiar-answerable-stilllearning-atom-xyz"]',
    ) as HTMLButtonElement;
    expect(gotIt).not.toBeNull();
    expect(stillLearning).not.toBeNull();
    expect(gotIt.getAttribute('aria-pressed')).toBe('false');
    expect(stillLearning.getAttribute('aria-pressed')).toBe('false');

    gotIt.click();
    s.fixture.detectChanges();
    expect(gotIt.getAttribute('aria-pressed')).toBe('true');
    expect(stillLearning.getAttribute('aria-pressed')).toBe('false');

    stillLearning.click();
    s.fixture.detectChanges();
    expect(gotIt.getAttribute('aria-pressed')).toBe('false');
    expect(stillLearning.getAttribute('aria-pressed')).toBe('true');

    // Re-clicking the same verdict undoes the self-check (toggle off).
    stillLearning.click();
    s.fixture.detectChanges();
    expect(stillLearning.getAttribute('aria-pressed')).toBe('false');

    // No HTTP request was ever made — self-check never touches the network.
    httpMock.verify();
  });

  it('keeps each item independent self-check state', () => {
    const items = [item({ atomId: 'a-1' }), item({ atomId: 'a-2' })];
    const s = setup('framing', items);
    httpMock = s.httpMock;

    (
      s.el.querySelector(
        '[data-testid="familiar-answerable-gotit-a-1"]',
      ) as HTMLButtonElement
    ).click();
    s.fixture.detectChanges();

    expect(
      s.el
        .querySelector('[data-testid="familiar-answerable-gotit-a-1"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      s.el
        .querySelector('[data-testid="familiar-answerable-gotit-a-2"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
