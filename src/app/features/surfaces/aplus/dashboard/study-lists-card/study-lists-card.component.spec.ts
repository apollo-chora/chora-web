/**
 * StudyListsCardComponent spec — CHO-2217 (dashboard integration).
 *
 * The `study` wrapper on the A+ dashboard hub. Study lists were reachable only
 * from a top-level "Study" sidebar entry, which made them a silo rather than
 * part of Learning. This card puts them on the dashboard beside Continue
 * learning — the two are the same aggregate (LearningPath) split by provenance.
 *
 * Drives the real HTTP boundary rather than mocking StudyService, because the
 * DISCRIMINATOR is the thing under test: `source_type === 'collection'` is a
 * POSITIVE filter (ADR-233 D2), and the negative form `!== 'course'` would
 * sweep every legacy ad_hoc path in as a study list.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
} from '@angular/common/http/testing';

import { StudyListsCardComponent } from './study-lists-card.component';
import { TranslateService } from '../../../../../core/services/translate.service';
import type {
  MeLearningPath,
  MeLearningPathListResponse,
} from '../../study/study.model';

const PATHS_URL = '/api/v1/me/learning-paths';

function buildPath(overrides: Partial<MeLearningPath> = {}): MeLearningPath {
  return {
    path_id: '019f6b6c-0123-77f2-9eec-e883f66b55f0',
    source_type: 'collection',
    source_id: '019f6b6c-aaaa-77f2-9eec-e883f66b55f0',
    title: 'Spaced repetition, the good bits',
    atom_ids: ['a1', 'a2', 'a3'],
    current_index: 0,
    total_atoms: 3,
    progress_percent: 0,
    completed: false,
    ...overrides,
  };
}

function setup(): {
  fixture: ComponentFixture<StudyListsCardComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [StudyListsCardComponent],
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
  const fixture = TestBed.createComponent(StudyListsCardComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, httpMock };
}

function flush(
  httpMock: HttpTestingController,
  fixture: ComponentFixture<StudyListsCardComponent>,
  body: MeLearningPathListResponse,
): void {
  httpMock.expectOne((r) => r.url.endsWith(PATHS_URL)).flush(body);
  fixture.detectChanges();
}

describe('StudyListsCardComponent', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  afterEach(() => {
    ctx.httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('renders a collection-sourced study list', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [buildPath()] });
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-list"]'),
    ).not.toBeNull();
    expect(ctx.element.textContent).toContain('Spaced repetition, the good bits');
  });

  it('EXCLUDES a course-sourced path — that belongs to Continue learning', () => {
    flush(ctx.httpMock, ctx.fixture, {
      items: [buildPath({ source_type: 'course', title: 'A real course' })],
    });
    expect(ctx.element.textContent).not.toContain('A real course');
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-empty"]'),
    ).not.toBeNull();
  });

  it('EXCLUDES an ad_hoc path — the positive discriminator, not !== course', () => {
    // The whole point of ADR-233 D2. `!== 'course'` would admit this row.
    flush(ctx.httpMock, ctx.fixture, {
      items: [buildPath({ source_type: 'ad_hoc', title: 'Legacy ad hoc path' })],
    });
    expect(ctx.element.textContent).not.toContain('Legacy ad hoc path');
  });

  it('EXCLUDES a path with an ABSENT source_type (pre-migration row)', () => {
    flush(ctx.httpMock, ctx.fixture, {
      items: [buildPath({ source_type: undefined, title: 'No provenance' })],
    });
    expect(ctx.element.textContent).not.toContain('No provenance');
  });

  it('renders the honest empty state for a learner with no study lists', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [] });
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-empty"]'),
    ).not.toBeNull();
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-error"]'),
    ).toBeNull();
  });

  it('renders an ERROR arm distinct from empty when the fetch fails', () => {
    // A failed fetch must never read as "you have no study lists".
    ctx.httpMock
      .expectOne((r) => r.url.endsWith(PATHS_URL))
      .flush({ error: { code: 'BOOM' } }, { status: 500, statusText: 'err' });
    ctx.fixture.detectChanges();
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-error"]'),
    ).not.toBeNull();
    expect(
      ctx.element.querySelector('[data-testid="study-lists-card-empty"]'),
    ).toBeNull();
  });

  it('NEVER renders progress, a cursor or a Completed badge (ADR-233 D3)', () => {
    // progress_percent / current_index / completed are INERT on a spaced path:
    // Advance() refuses, so they are frozen at 0/0/false forever. Rendering one
    // would tell a weeks-deep learner they are at 0%.
    flush(ctx.httpMock, ctx.fixture, {
      items: [buildPath({ progress_percent: 0, current_index: 0 })],
    });
    expect(ctx.element.querySelector('progress')).toBeNull();
    expect(ctx.element.querySelector('[role="progressbar"]')).toBeNull();
    expect(ctx.element.textContent).not.toMatch(/0\s*%/);
  });

  it('links each list to its source collection and to the Daily Dose', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [buildPath()] });
    const hrefs = [...ctx.element.querySelectorAll('a')].map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('/a/study/collections/019f6b6c-aaaa-77f2-9eec-e883f66b55f0');
    expect(hrefs).toContain('/a/daily-dose');
  });

  it('offers a See-all link into the Study hub', () => {
    flush(ctx.httpMock, ctx.fixture, { items: [buildPath()] });
    const seeAll = ctx.element.querySelector(
      '[data-testid="study-lists-card-see-all"]',
    );
    expect(seeAll).not.toBeNull();
    expect(seeAll?.getAttribute('href')).toBe('/a/study');
  });

  it('caps the card at 3 lists and says how many more there are', () => {
    // The dashboard is a glance surface; the full list lives at /a/study.
    const items = Array.from({ length: 5 }, (_, i) =>
      buildPath({ path_id: `p${i}`, title: `List ${i}` }),
    );
    flush(ctx.httpMock, ctx.fixture, { items });
    const rows = ctx.element.querySelectorAll(
      '[data-testid^="study-lists-card-row-"]',
    );
    expect(rows.length).toBe(3);
    expect(ctx.element.textContent).toContain('aplus.dashboard.study_more');
  });
});
