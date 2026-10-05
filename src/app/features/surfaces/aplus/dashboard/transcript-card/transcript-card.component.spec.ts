/**
 * TranscriptCardComponent spec — CHO-2237 (dashboard integration).
 *
 * The `transcript` wrapper on the A+ dashboard hub: the glance half of
 * finishing CHO-2211 S6 (the top-level Transcript sidebar entry is retired;
 * the Learn sub-nav tab stays the full hub).
 *
 * Drives the real HTTP boundary rather than mocking MeTranscriptService (the
 * StudyListsCard precedent): the null-score → em-dash rule and the
 * error-can-never-read-as-empty rule are wire-shape behaviours.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { TranscriptCardComponent } from './transcript-card.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import type {
  TranscriptEntryWire,
  TranscriptListResponse,
} from '../../me-transcript/me-transcript.model';

const TRANSCRIPT_URL = '/me/transcript';

function buildEntry(overrides: Partial<TranscriptEntryWire> = {}): TranscriptEntryWire {
  return {
    entry_id: '019f0000-0000-7000-8000-000000000001',
    gcid: '019f0000-0000-7000-8000-00000000aaaa',
    kind: 'assessment',
    source_ref: '019f0000-0000-7000-8000-00000000bbbb',
    title: 'Fractions checkpoint',
    score_earned: 8,
    score_possible: 10,
    score_percent: 80,
    passed: true,
    course_id: null,
    occurred_at: new Date(Date.now() - 60_000).toISOString(),
    ...overrides,
  };
}

function setup(): {
  fixture: ComponentFixture<TranscriptCardComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [TranscriptCardComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: TranslateService,
        useValue: {
          instant: (k: string) => k,
          translate: (k: string) => k,
          get: (k: string) => k,
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(TranscriptCardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, httpMock };
}

function flush(
  httpMock: HttpTestingController,
  fixture: ComponentFixture<TranscriptCardComponent>,
  body: TranscriptListResponse,
): void {
  httpMock.expectOne((r) => r.url.endsWith(TRANSCRIPT_URL)).flush(body);
  fixture.detectChanges();
}

describe('TranscriptCardComponent', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('shows the loading arm while the transcript GET is in flight', () => {
    // No flush yet — the request is open.
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-loading"]'),
    ).not.toBeNull();
    ctx.httpMock.expectOne((r) => r.url.endsWith(TRANSCRIPT_URL)).flush({ items: [] });
  });

  it('renders a graded assessment row with score, pass tick and title', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [buildEntry()] });
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-list"]'),
    ).not.toBeNull();
    expect(ctx.element.textContent).toContain('Fractions checkpoint');
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-score"]')?.textContent,
    ).toContain('80%');
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-passed"]'),
    ).not.toBeNull();
  });

  it('renders an em-dash for a null score (certification) — NEVER 0%', () => {
    flush(ctx.httpMock, ctx.fixture, {
      items: [
        buildEntry({
          kind: 'certification',
          title: 'Algebra I certificate',
          score_earned: null,
          score_possible: null,
          score_percent: null,
          passed: null,
        }),
      ],
    });
    const score = ctx.element.querySelector('[data-testid="transcript-card-score"]');
    expect(score?.textContent?.trim()).toBe('—');
    expect(ctx.element.textContent).not.toContain('0%');
    // No pass tick on a null `passed`.
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-passed"]'),
    ).toBeNull();
  });

  it('shows no pass tick when passed is explicitly false', () => {
    flush(ctx.httpMock, ctx.fixture, {
      items: [buildEntry({ passed: false, score_percent: 35 })],
    });
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-passed"]'),
    ).toBeNull();
  });

  it('caps the glance at 3 rows and shows the overflow line', () => {
    const items = Array.from({ length: 5 }, (_, i) =>
      buildEntry({
        entry_id: `019f0000-0000-7000-8000-00000000000${i}`,
        title: `Outcome ${i}`,
      }),
    );
    flush(ctx.httpMock, ctx.fixture, { items });
    expect(
      ctx.element.querySelectorAll('[data-testid^="transcript-card-row-"]'),
    ).toHaveLength(3);
    const more = ctx.element.querySelector('[data-testid="transcript-card-more"]');
    expect(more).not.toBeNull();
    // 2 more than the card shows; the _other plural key carries the count.
    expect(more?.textContent).toContain('aplus.dashboard.transcript_more_other');
  });

  it('empty state renders ONLY on a successful zero-row fetch, with guidance', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [] });
    const empty = ctx.element.querySelector('[data-testid="transcript-card-empty"]');
    expect(empty).not.toBeNull();
    expect(empty?.querySelector('a')?.getAttribute('href')).toBe('/a/me/assessments');
  });

  it('a failed fetch renders the ERROR arm — never the empty state', () => {
    ctx.httpMock
      .expectOne((r) => r.url.endsWith(TRANSCRIPT_URL))
      .flush({ code: 'UPSTREAM_UNAVAILABLE' }, { status: 502, statusText: 'Bad Gateway' });
    ctx.fixture.detectChanges();
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-error"]'),
    ).not.toBeNull();
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-empty"]'),
    ).toBeNull();
  });

  it('retry re-fetches after an error', () => {
    ctx.httpMock
      .expectOne((r) => r.url.endsWith(TRANSCRIPT_URL))
      .flush({ code: 'X' }, { status: 500, statusText: 'ISE' });
    ctx.fixture.detectChanges();

    const retry = ctx.element.querySelector<HTMLButtonElement>(
      '[data-testid="transcript-card-retry"]',
    );
    expect(retry).not.toBeNull();
    retry?.click();
    ctx.fixture.detectChanges();

    flush(ctx.httpMock, ctx.fixture, { items: [buildEntry()] });
    expect(
      ctx.element.querySelector('[data-testid="transcript-card-list"]'),
    ).not.toBeNull();
  });

  it('links See all to the full transcript hub', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [] });
    expect(
      ctx.element
        .querySelector('[data-testid="transcript-card-see-all"]')
        ?.getAttribute('href'),
    ).toBe('/a/me/transcript');
  });
});
