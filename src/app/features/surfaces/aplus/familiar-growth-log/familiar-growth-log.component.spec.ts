import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { FamiliarGrowthLogComponent } from './familiar-growth-log.component';
import { TranslateService } from '../../../../core/services/translate.service';

/**
 * Per the 2026-05-16 no-stubs / no-mock-fallback directive,
 * FamiliarGrowthService.getGrowthEvents is fail-loud. Tests flush the
 * `/growth-events` GET with a canonical envelope so the timeline
 * renders. The fixture keeps the prior mock shape (one hatch event with
 * stageBefore=0 → stageAfter=1, empty nextPageToken).
 */
const GROWTH_EVENTS_PAGE = {
  data: {
    events: [
      {
        eventId: 'gev-1',
        familiarId: 'eira-001',
        source: 'hatch',
        sourceEventId: 'src-1',
        expDelta: 25,
        expCumulativeAfter: 25,
        stageBefore: 0,
        stageAfter: 1,
        dailyCapHit: false,
        occurredAt: '2026-05-13T00:00:00Z',
      },
    ],
    nextPageToken: '',
  },
};

function flushEvents(httpMock: HttpTestingController): void {
  for (const r of httpMock.match((r) => r.url.includes('/growth-events'))) {
    r.flush(GROWTH_EVENTS_PAGE);
  }
}

/**
 * Multi-row page with a daily-cap-hit event + a non-empty
 * nextPageToken so the load-more button renders.
 */
const GROWTH_EVENTS_PAGE_WITH_NEXT = {
  data: {
    events: [
      {
        eventId: 'gev-cap',
        familiarId: 'eira-001',
        source: 'atom.completed',
        sourceEventId: 'src-cap',
        expDelta: 12,
        expCumulativeAfter: 137,
        stageBefore: 2,
        stageAfter: 2,
        dailyCapHit: true,
        occurredAt: '2026-05-14T09:00:00Z',
      },
    ],
    nextPageToken: 'page-2-token',
  },
};

/** Second page returned by loadMore(); no further pages. */
const GROWTH_EVENTS_PAGE_2 = {
  data: {
    events: [
      {
        eventId: 'gev-2',
        familiarId: 'eira-001',
        source: 'duel.won',
        sourceEventId: 'src-2',
        expDelta: 40,
        expCumulativeAfter: 177,
        stageBefore: 2,
        stageAfter: 3,
        dailyCapHit: false,
        occurredAt: '2026-05-15T10:00:00Z',
      },
    ],
    nextPageToken: '',
  },
};

const EMPTY_EVENTS_PAGE = {
  data: { events: [], nextPageToken: '' },
};

function flushFirst(
  httpMock: HttpTestingController,
  payload: unknown,
): void {
  const reqs = httpMock.match((r) => r.url.includes('/growth-events'));
  for (const r of reqs) r.flush(payload as Record<string, unknown>);
}

function setup(familiarId = 'eira-001') {
  TestBed.configureTestingModule({
    imports: [FamiliarGrowthLogComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({ familiarId })),
          snapshot: { paramMap: convertToParamMap({ familiarId }) },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(FamiliarGrowthLogComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, el: fixture.nativeElement as HTMLElement, httpMock };
}

describe('FamiliarGrowthLogComponent', () => {
  let httpMock: HttpTestingController;
  beforeEach(() => TestBed.resetTestingModule());
  afterEach(() => httpMock?.verify());

  it('renders the hatch event from the fixture', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-growth-log-events"]'),
    ).not.toBeNull();
    expect(
      s.el.querySelector('[data-testid="aplus-growth-event-gev-1"]'),
    ).not.toBeNull();
  });

  it('exposes a back link to the profile', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    const link = s.el.querySelector('[data-testid="aplus-growth-log-back"]');
    expect(link?.getAttribute('href')).toBe('/a/companion/eira-001');
  });

  it('shows stage-up pill when stageAfter > stageBefore', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    // Fixture event has stageBefore=0, stageAfter=1.
    expect(s.el.textContent ?? '').toContain('0 → 1');
  });

  it('hides load-more when no next page', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    // Fixture returns nextPageToken: '' so load-more should be hidden.
    expect(
      s.el.querySelector('[data-testid="aplus-growth-log-load-more"]'),
    ).toBeNull();
  });

  it('renders the heading shell and back link target', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-familiar-growth-log"]'),
    ).not.toBeNull();
    // Translate pipe returns the raw i18n key in tests.
    expect(s.el.textContent ?? '').toContain('aplus.familiar_growth_log.heading');
  });

  it('renders the EXP delta and cumulative total for the event', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    const text = s.el.textContent ?? '';
    expect(text).toContain('+25 EXP');
    // expCumulativeAfter = 25 rendered next to the "total" key.
    expect(text).toContain('aplus.familiar_growth_log.total');
    expect(text).toContain('25');
  });

  // CHO-2144: the LIVE BFF wire uses the chora-consumption handler spelling
  // (exp_total_after / growth_event_id / awarded_at, camelised by the gateway).
  // Before the service coalesce, the "Cumulative:" number rendered blank.
  it('renders the cumulative number from the real BFF wire spelling', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, {
      data: {
        events: [
          {
            growthEventId: 'gev-live',
            source: 'atom.completed',
            expDelta: 15,
            expTotalAfter: 806,
            dailyCapHit: false,
            triggeredStageUp: false,
            awardedAt: '2026-07-11T00:00:00Z',
          },
        ],
        nextPageToken: '',
      },
    });
    s.fixture.detectChanges();
    const text = s.el.textContent ?? '';
    expect(text).toContain('+15 EXP');
    expect(text).toContain('806'); // the cumulative number renders (not blank)
    // eventId maps from growthEventId → the row's data-testid resolves.
    expect(
      s.el.querySelector('[data-testid="aplus-growth-event-gev-live"]'),
    ).not.toBeNull();
  });

  it('renders the empty state when there are no events', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, EMPTY_EVENTS_PAGE);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-growth-log-events"]'),
    ).toBeNull();
    expect(s.el.querySelector('.growth-log__empty')).not.toBeNull();
    expect(s.el.textContent ?? '').toContain('aplus.familiar_growth_log.empty');
  });

  it('shows the daily-cap pill and no stage-up pill for a capped event', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, GROWTH_EVENTS_PAGE_WITH_NEXT);
    s.fixture.detectChanges();
    expect(s.el.querySelector('.growth-event__capped-pill')).not.toBeNull();
    expect(s.el.textContent ?? '').toContain(
      'aplus.familiar_growth_log.daily_cap_hit',
    );
    // stageBefore === stageAfter (2 → 2) so no stage-up pill.
    expect(s.el.querySelector('.growth-event__stage-pill')).toBeNull();
  });

  it('shows the load-more button when the first page has a next token', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, GROWTH_EVENTS_PAGE_WITH_NEXT);
    s.fixture.detectChanges();
    expect(
      s.el.querySelector('[data-testid="aplus-growth-log-load-more"]'),
    ).not.toBeNull();
  });

  it('loadMore() fetches the next page and accumulates events', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, GROWTH_EVENTS_PAGE_WITH_NEXT);
    s.fixture.detectChanges();

    const btn = s.el.querySelector(
      '[data-testid="aplus-growth-log-load-more"]',
    ) as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    s.fixture.detectChanges();

    // The loadMore() call propagates the first page's token as ?pageToken.
    const more = httpMock.match((r) => r.url.includes('pageToken=page-2-token'));
    expect(more.length).toBe(1);
    more[0].flush(GROWTH_EVENTS_PAGE_2);
    s.fixture.detectChanges();

    // Both pages now rendered (firstPage + accumulated).
    expect(
      s.el.querySelector('[data-testid="aplus-growth-event-gev-cap"]'),
    ).not.toBeNull();
    expect(
      s.el.querySelector('[data-testid="aplus-growth-event-gev-2"]'),
    ).not.toBeNull();
    // loadMore() set nextPageToken to '' (page-2 had no further pages) and
    // cleared the loadingMore flag.
    expect(s.fixture.componentInstance.nextPageToken()).toBe('');
    expect(s.fixture.componentInstance.loadingMore()).toBe(false);
    // CHARACTERIZATION: hasNextPage() also reads firstPage().nextPageToken,
    // which the toSignal still holds as 'page-2-token' (it never refetches),
    // so the load-more button remains visible even after the last page.
    expect(
      s.el.querySelector('[data-testid="aplus-growth-log-load-more"]'),
    ).not.toBeNull();
  });

  it('loadMore() error path clears the loadingMore flag', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, GROWTH_EVENTS_PAGE_WITH_NEXT);
    s.fixture.detectChanges();

    const cmp = s.fixture.componentInstance;
    cmp.loadMore();
    expect(cmp.loadingMore()).toBe(true);

    const more = httpMock.match((r) => r.url.includes('pageToken=page-2-token'));
    expect(more.length).toBe(1);
    more[0].flush(
      { error: { code: 'boom', message: 'kaboom' } },
      { status: 500, statusText: 'Server Error' },
    );
    s.fixture.detectChanges();

    // Error branch resets loadingMore; no new events accumulated.
    expect(cmp.loadingMore()).toBe(false);
    expect(
      s.el.querySelector('[data-testid="aplus-growth-event-gev-2"]'),
    ).toBeNull();
  });

  it('loadMore() is a no-op when already loading (guard short-circuits)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushFirst(httpMock, GROWTH_EVENTS_PAGE_WITH_NEXT);
    s.fixture.detectChanges();

    const cmp = s.fixture.componentInstance;
    cmp.loadMore(); // first call fires the request, sets loadingMore=true
    cmp.loadMore(); // second call must short-circuit (no second request)

    const more = httpMock.match((r) => r.url.includes('pageToken=page-2-token'));
    expect(more.length).toBe(1);
    more[0].flush(GROWTH_EVENTS_PAGE_2);
  });

  it('loadMore() is a no-op when there is no next page (guard short-circuits)', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock); // first page has nextPageToken: ''
    s.fixture.detectChanges();

    const cmp = s.fixture.componentInstance;
    expect(cmp.hasNextPage()).toBe(false);
    cmp.loadMore();
    // No additional growth-events request fired.
    expect(
      httpMock.match((r) => r.url.includes('pageToken=')).length,
    ).toBe(0);
    expect(cmp.loadingMore()).toBe(false);
  });

  it('sourceLabel() namespaces and dot-escapes the source key', () => {
    const s = setup();
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    const cmp = s.fixture.componentInstance;
    expect(cmp.sourceLabel('hatch')).toBe(
      'aplus.familiar_growth_log.source_hatch',
    );
    expect(cmp.sourceLabel('atom.completed')).toBe(
      'aplus.familiar_growth_log.source_atom_completed',
    );
    expect(cmp.sourceLabel('a.b.c')).toBe(
      'aplus.familiar_growth_log.source_a_b_c',
    );
  });

  it('exposes the resolved familiarId from the route', () => {
    const s = setup('luma-099');
    httpMock = s.httpMock;
    s.fixture.detectChanges();
    flushEvents(httpMock);
    s.fixture.detectChanges();
    expect(s.fixture.componentInstance.familiarId()).toBe('luma-099');
  });
});
