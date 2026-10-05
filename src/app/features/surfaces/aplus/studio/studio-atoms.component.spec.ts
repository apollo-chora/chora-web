/**
 * StudioAtomsComponent spec — CHO-2215 / CHO-2216.
 *
 * `/a/studio/atoms` — the author's atom inventory. This is the list that used
 * to hang off the compose canvas's footer, capped at 20, unsearchable, and
 * swallowing its own load errors. Here it gets the search, filters, real paging
 * and honest failure the API already supported all along.
 *
 * Drives the real HTTP boundary (provideHttpClientTesting) rather than mocking
 * the service, because the outbound query string IS the thing under test: the
 * canvas's list sent `page_size`/`page_token`, which the BE never reads.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  provideHttpClientTesting,
  HttpTestingController,
  TestRequest,
} from '@angular/common/http/testing';

import { StudioAtomsComponent } from './studio-atoms.component';
import { TranslateService } from '../../../../core/services/translate.service';
import type {
  QuestionSearchResponse,
  QuestionSearchResult,
} from '../atom-question-picker/atom-question-picker.model';
import {
  AUTHORABLE_QUESTION_TYPES,
  DEFAULT_SORT,
} from '../atom-question-picker/atom-question-picker.model';

const ATOM_ID = '01985e7f-1234-7abc-8def-000000000a01';
const SEARCH_URL = '/api/atoms/questions/search';

function buildResult(overrides: Partial<QuestionSearchResult> = {}): QuestionSearchResult {
  return {
    id: ATOM_ID,
    title: 'SOLID, the Open-Closed Principle',
    stem: 'Which statement best describes the Open-Closed Principle?',
    question_type: 'mcq',
    tenant_id: '11111111-1111-7111-8111-111111111111',
    author_gcid: '00000000-0000-7000-8000-000000001999',
    created_at: '2026-05-15T08:12:33Z',
    updated_at: '2026-05-15T09:02:11Z',
    ...overrides,
  };
}

/** The envelope the live handler writes: {items, page, per, total}. No cursor. */
function buildResponse(overrides: Partial<QuestionSearchResponse> = {}): QuestionSearchResponse {
  return { items: [buildResult()], page: 1, per: 20, total: 1, ...overrides };
}

function setup(): {
  fixture: ComponentFixture<StudioAtomsComponent>;
  element: HTMLElement;
  httpMock: HttpTestingController;
} {
  TestBed.configureTestingModule({
    imports: [StudioAtomsComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      TranslateService,
    ],
  });
  const fixture = TestBed.createComponent(StudioAtomsComponent);
  const httpMock = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, httpMock };
}

describe('StudioAtomsComponent', () => {
  let fixture: ComponentFixture<StudioAtomsComponent>;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  const expectSearch = (): TestRequest =>
    httpMock.expectOne((r) => r.url.endsWith(SEARCH_URL));

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.resetTestingModule();
    ({ fixture, element, httpMock } = setup());
  });

  afterEach(() => {
    vi.useRealTimers();
    httpMock.verify();
  });

  describe('initial load', () => {
    it('renders the title, purpose line and a New learning atom action', () => {
      expectSearch().flush(buildResponse());
      fixture.detectChanges();

      expect(element.querySelectorAll('h1').length).toBe(1);
      expect(element.querySelector('[data-testid="studio-atoms-subtitle"]')).not.toBeNull();
      const cta = element.querySelector<HTMLAnchorElement>('[data-testid="studio-atoms-new"]');
      expect(cta?.tagName).toBe('A');
      expect(cta?.getAttribute('href')).toBe('/a/studio/atoms/new');
    });

    it('asks the server for the caller OWN atoms, newest first', () => {
      const req = expectSearch();
      // source=mine is a server-side filter the API already supports; the list
      // must not fetch everything and narrow client-side.
      expect(req.request.params.get('source')).toBe('mine');
      expect(req.request.params.get('sort')).toBe('created_at:desc');
      req.flush(buildResponse());
    });

    it('sends `per`, NOT the `page_size` the BE ignores', () => {
      const req = expectSearch();
      expect(req.request.params.get('per')).toBe('20');
      expect(req.request.params.get('page_size')).toBeNull();
      expect(req.request.params.get('page_token')).toBeNull();
      req.flush(buildResponse());
    });

    it('renders one card per atom', () => {
      expectSearch().flush(
        buildResponse({
          items: [buildResult(), buildResult({ id: 'atom-2', title: 'Second atom' })],
          total: 2,
        }),
      );
      fixture.detectChanges();
      expect(
        element.querySelectorAll('[data-testid^="studio-atom-card-"]').length,
      ).toBe(2);
    });

    it('links each card to its editor', () => {
      expectSearch().flush(buildResponse());
      fixture.detectChanges();
      const link = element.querySelector<HTMLAnchorElement>(
        `[data-testid="studio-atom-link-${ATOM_ID}"]`,
      );
      expect(link?.tagName).toBe('A');
      expect(link?.getAttribute('href')).toBe(`/a/atoms/${ATOM_ID}/edit`);
    });
  });

  // The whole reason this surface exists: the canvas footer swallowed its load
  // error (`error: () => this.myAtomsLoading.set(false)`) and rendered a failed
  // fetch as "you have no atoms" — the worst possible lie to tell an author.
  describe('fail-loud on load error', () => {
    it('renders a loud error with a retry, NOT an empty state', () => {
      expectSearch().flush(
        { error: { code: 'INTERNAL', message: 'oops' } },
        { status: 500, statusText: 'Internal Server Error' },
      );
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="studio-atoms-error"]');
      expect(err, 'a failed fetch must surface as an error').not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(
        element.querySelector('[data-testid="studio-atoms-empty"]'),
        'a failed fetch must NEVER render as "no atoms"',
      ).toBeNull();
      expect(element.querySelector('[data-testid="studio-atoms-retry"]')).not.toBeNull();
    });

    it('retry re-issues the search', () => {
      expectSearch().flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="studio-atoms-retry"]')!.click();
      expectSearch().flush(buildResponse());
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="studio-atoms-error"]')).toBeNull();
      expect(element.querySelectorAll('[data-testid^="studio-atom-card-"]').length).toBe(1);
    });

    it('distinguishes a genuinely empty inventory from a failure', () => {
      expectSearch().flush(buildResponse({ items: [], total: 0 }));
      fixture.detectChanges();

      expect(element.querySelector('[data-testid="studio-atoms-empty"]')).not.toBeNull();
      expect(element.querySelector('[data-testid="studio-atoms-error"]')).toBeNull();
    });
  });

  describe('free-text search', () => {
    it('debounces then sends the needle as `q`', () => {
      expectSearch().flush(buildResponse());

      const input = element.querySelector<HTMLInputElement>(
        '[data-testid="studio-atoms-search"]',
      )!;
      input.value = 'photosynthesis';
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.get('q')).toBe('photosynthesis');
      req.flush(buildResponse());
    });

    it('does not fire a request per keystroke', () => {
      expectSearch().flush(buildResponse());

      const input = element.querySelector<HTMLInputElement>(
        '[data-testid="studio-atoms-search"]',
      )!;
      for (const v of ['p', 'ph', 'pho']) {
        input.value = v;
        input.dispatchEvent(new Event('input'));
        vi.advanceTimersByTime(50);
      }
      // Inside the debounce window nothing has gone out yet.
      httpMock.expectNone((r) => r.url.endsWith(SEARCH_URL));

      vi.advanceTimersByTime(350);
      const req = expectSearch();
      expect(req.request.params.get('q')).toBe('pho');
      req.flush(buildResponse());
    });
  });

  describe('state filter', () => {
    it('sends the chosen lifecycle state', () => {
      expectSearch().flush(buildResponse());

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-state"]',
      )!;
      select.value = 'PUBLISHED';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.getAll('state')).toEqual(['PUBLISHED']);
      req.flush(buildResponse());
    });
  });

  // CHO-2216 AC: "search by title, filter by type/status, or sort by updated,
  // and the applied criteria are visible in the UI". Type and sort were the two
  // halves that never landed: question_type was hardcoded ['mcq','oe'] and sort
  // was pinned to created_at:desc with no controls. The BE has supported both
  // all along (live-probed: updated_at:asc|desc + title:asc reorder; an unknown
  // field 400s), so these were surface gaps, not API limits.
  describe('type filter', () => {
    it('defaults to the AUTHORABLE set — never lists an unopenable reserved_* row', () => {
      const req = expectSearch();
      expect(req.request.params.getAll('question_type')).toEqual([
        ...AUTHORABLE_QUESTION_TYPES,
      ]);
      req.flush(buildResponse());
    });

    it('narrows to a single chosen type', () => {
      expectSearch().flush(buildResponse());

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-type"]',
      )!;
      select.value = 'mcq';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.getAll('question_type')).toEqual(['mcq']);
      req.flush(buildResponse());
    });

    it('"any type" restores the authorable narrowing, not an unbounded query', () => {
      expectSearch().flush(buildResponse());
      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-type"]',
      )!;
      select.value = 'mcq';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);
      expectSearch().flush(buildResponse());

      select.value = '';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.getAll('question_type')).toEqual([
        ...AUTHORABLE_QUESTION_TYPES,
      ]);
      req.flush(buildResponse());
    });
  });

  describe('sort control', () => {
    it('sends the default sort on first load', () => {
      const req = expectSearch();
      expect(req.request.params.get('sort')).toBe(DEFAULT_SORT);
      req.flush(buildResponse());
    });

    it('sends updated_at:desc — the sort the AC actually names', () => {
      expectSearch().flush(buildResponse());

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-sort"]',
      )!;
      select.value = 'updated_at:desc';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.get('sort')).toBe('updated_at:desc');
      req.flush(buildResponse());
    });

    it('rejects a sort value outside SORT_OPTIONS (would 400 at the boundary)', () => {
      expectSearch().flush(buildResponse());

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-sort"]',
      )!;
      // A tampered/stale option must not reach the wire as an unknown field.
      select.value = 'bogus_field:desc';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      httpMock.expectNone((r) => r.url.endsWith(SEARCH_URL));
      expect(fixture.componentInstance.sort()).toBe(DEFAULT_SORT);
    });

    it('shows the timestamp the sort ACTUALLY orders by', () => {
      // Sorting by "Recently updated" while rendering created_at makes a
      // correctly-sorted list look random: the visible numbers are not the ones
      // being ordered. Caught on the deployed page (rows read 8m / 10h / 12m /
      // 14m under updated_at:desc). The row must show the key in force.
      const row = buildResult({
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-06-30T00:00:00Z',
      });
      expectSearch().flush(buildResponse({ items: [row] }));
      fixture.detectChanges();
      expect(fixture.componentInstance.rowTimestamp(row)).toBe(row.created_at);

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-sort"]',
      )!;
      select.value = 'updated_at:desc';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);
      expectSearch().flush(buildResponse({ items: [row] }));
      fixture.detectChanges();
      expect(fixture.componentInstance.rowTimestamp(row)).toBe(row.updated_at);
    });

    it('resets to page 1 — a sort change invalidates the current page', () => {
      expectSearch().flush(buildResponse({ total: 47, page: 1, per: 20 }));
      fixture.detectChanges(); // the pager only renders once total says there IS a page 2
      element
        .querySelector<HTMLButtonElement>('[data-testid="studio-atoms-next"]')!
        .click();
      expectSearch().flush(buildResponse({ total: 47, page: 2, per: 20 }));
      fixture.detectChanges();

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-sort"]',
      )!;
      select.value = 'title:asc';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.get('page')).toBeNull(); // page 1 is implicit
      req.flush(buildResponse());
    });
  });

  // The pagination fix, proven end to end. `page_size=20` coincided with the
  // BE's own default per=20, so page 1 always looked right while every control
  // beyond it was inert.
  describe('pagination', () => {
    it('surfaces the server total', () => {
      expectSearch().flush(buildResponse({ total: 47 }));
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="studio-atoms-total"]')?.textContent,
      ).toContain('47');
    });

    it('offers Next while a further page exists (page*per < total)', () => {
      expectSearch().flush(buildResponse({ page: 1, per: 20, total: 47 }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="studio-atoms-next"]')).not.toBeNull();
    });

    it('Next requests page 2 and REPLACES the rows', () => {
      expectSearch().flush(
        buildResponse({ items: [buildResult({ id: 'a-1' })], page: 1, per: 20, total: 47 }),
      );
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="studio-atoms-next"]')!.click();
      const second = expectSearch();
      expect(second.request.params.get('page')).toBe('2');
      second.flush(
        buildResponse({ items: [buildResult({ id: 'a-2' })], page: 2, per: 20, total: 47 }),
      );
      fixture.detectChanges();

      // A paged inventory replaces its page; it does not accumulate like the
      // picker's Load-more.
      const cards = element.querySelectorAll('[data-testid^="studio-atom-card-"]');
      expect(cards.length).toBe(1);
      expect(element.querySelector('[data-testid="studio-atom-card-a-2"]')).not.toBeNull();
    });

    it('hides Next on the last page', () => {
      expectSearch().flush(buildResponse({ page: 3, per: 20, total: 47 }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="studio-atoms-next"]')).toBeNull();
    });

    it('hides Previous on page 1 and offers it beyond', () => {
      expectSearch().flush(buildResponse({ page: 1, per: 20, total: 47 }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="studio-atoms-prev"]')).toBeNull();

      element.querySelector<HTMLButtonElement>('[data-testid="studio-atoms-next"]')!.click();
      expectSearch().flush(buildResponse({ page: 2, per: 20, total: 47 }));
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="studio-atoms-prev"]')).not.toBeNull();
    });

    it('a page size of 50 actually asks for 50', () => {
      expectSearch().flush(buildResponse());

      const select = element.querySelector<HTMLSelectElement>(
        '[data-testid="studio-atoms-per"]',
      )!;
      select.value = '50';
      select.dispatchEvent(new Event('change'));
      vi.advanceTimersByTime(350);

      const req = expectSearch();
      expect(req.request.params.get('per')).toBe('50');
      req.flush(buildResponse({ per: 50 }));
    });

    it('returns to page 1 when the query changes', () => {
      expectSearch().flush(buildResponse({ page: 1, per: 20, total: 47 }));
      fixture.detectChanges();

      element.querySelector<HTMLButtonElement>('[data-testid="studio-atoms-next"]')!.click();
      expectSearch().flush(buildResponse({ page: 2, per: 20, total: 47 }));
      fixture.detectChanges();

      const input = element.querySelector<HTMLInputElement>(
        '[data-testid="studio-atoms-search"]',
      )!;
      input.value = 'kinetics';
      input.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(350);

      // Staying on page 2 for a brand-new needle would strand the author on an
      // empty page of a result set that has a page 1.
      const req = expectSearch();
      expect(req.request.params.get('page')).toBeNull();
      req.flush(buildResponse());
    });
  });

  describe('sub-nav', () => {
    it('mounts the Studio sub-nav', () => {
      expectSearch().flush(buildResponse());
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="studio-sub-nav"]')).not.toBeNull();
    });
  });

  // The footer list this replaces carried a per-row Share. Dropping it would
  // have silently deleted the ONLY way to share an atom authored in an earlier
  // session: the edit page's Share button is gated on
  // `publishState().status === 'success'`, so it appears only right after you
  // publish, never on a re-opened atom. The capability moves here with the list.
  describe('share an already-authored atom', () => {
    const openShare = (): void => {
      expectSearch().flush(buildResponse());
      fixture.detectChanges();
      element
        .querySelector<HTMLButtonElement>(`[data-testid="studio-atom-share-${ATOM_ID}"]`)!
        .click();
      fixture.detectChanges();
    };

    it('offers a Share action per row', () => {
      expectSearch().flush(buildResponse());
      fixture.detectChanges();
      expect(
        element.querySelector(`[data-testid="studio-atom-share-${ATOM_ID}"]`),
      ).not.toBeNull();
    });

    it('POSTs the share with the chosen licence + caption and an Idempotency-Key', () => {
      openShare();

      const caption = element.querySelector<HTMLInputElement>(
        '[data-testid="studio-atoms-share-caption"]',
      )!;
      caption.value = 'A favourite of mine';
      caption.dispatchEvent(new Event('input'));

      element
        .querySelector<HTMLButtonElement>('[data-testid="studio-atoms-share-submit"]')!
        .click();

      const req = httpMock.expectOne((r) =>
        r.url.endsWith(`/v1/atoms/${ATOM_ID}/share`),
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        license_terms: 'cc_by_sa',
        caption: 'A favourite of mine',
      });
      // Contract §7.1 step 5 — the endpoint requires it.
      expect(req.request.headers.get('Idempotency-Key')).toBeTruthy();
      req.flush({
        share_entry_id: 's-1',
        author_display_name: 'Dale',
        created_at: '2026-07-16T00:00:00Z',
      });
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="studio-atoms-share-success"]'),
      ).not.toBeNull();
    });

    it('omits an empty caption rather than sending a blank string', () => {
      openShare();
      element
        .querySelector<HTMLButtonElement>('[data-testid="studio-atoms-share-submit"]')!
        .click();
      const req = httpMock.expectOne((r) => r.url.endsWith(`/v1/atoms/${ATOM_ID}/share`));
      expect(req.request.body).toEqual({ license_terms: 'cc_by_sa' });
      req.flush({ share_entry_id: 's', author_display_name: 'D', created_at: 'x' });
    });

    it('surfaces a 412 as the specific "not published yet" reason', () => {
      openShare();
      element
        .querySelector<HTMLButtonElement>('[data-testid="studio-atoms-share-submit"]')!
        .click();
      httpMock
        .expectOne((r) => r.url.endsWith(`/v1/atoms/${ATOM_ID}/share`))
        .flush(null, { status: 412, statusText: 'Precondition Failed' });
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="studio-atoms-share-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      // A draft cannot be shared; saying so beats a generic failure.
      expect(err?.textContent).toContain('aplus.studio_atoms.share.error_not_published');
    });

    it('keeps the inventory rows intact when a share fails', () => {
      openShare();
      element
        .querySelector<HTMLButtonElement>('[data-testid="studio-atoms-share-submit"]')!
        .click();
      httpMock
        .expectOne((r) => r.url.endsWith(`/v1/atoms/${ATOM_ID}/share`))
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      // A failed share is not a failed LIST; the rows must not vanish.
      expect(
        element.querySelectorAll('[data-testid^="studio-atom-card-"]').length,
      ).toBe(1);
      expect(element.querySelector('[data-testid="studio-atoms-error"]')).toBeNull();
    });
  });

  describe('reuse audience — the author-consent control (ADR-229 WS-5)', () => {
    const PATCH_URL = `/api/atoms/${ATOM_ID}/reuse-visibility`;

    const chip = (): HTMLButtonElement | null =>
      element.querySelector<HTMLButtonElement>(
        `[data-testid="studio-atom-audience-${ATOM_ID}"]`,
      );

    const openAudience = (row = buildResult()): void => {
      expectSearch().flush(buildResponse({ items: [row] }));
      fixture.detectChanges();
      chip()!.click();
      fixture.detectChanges();
    };

    const pick = (audience: string): void => {
      element
        .querySelector<HTMLInputElement>(
          `[data-testid="studio-atoms-audience-option-${audience}"]`,
        )!
        .click();
      fixture.detectChanges();
    };

    const apply = (): HTMLButtonElement =>
      element.querySelector<HTMLButtonElement>(
        '[data-testid="studio-atoms-audience-apply"]',
      )!;

    it('renders an audience chip per card, reading PRIVATE when the row omits the field', () => {
      // ADR-229 D1: the column default is 'private' and the picker projection
      // COALESCEs it, but a missing field must still never render a blank chip.
      expectSearch().flush(buildResponse());
      fixture.detectChanges();
      expect(chip()).not.toBeNull();
      expect(chip()!.getAttribute('data-audience')).toBe('private');
      expect(chip()!.textContent).toContain(
        'aplus.studio_atoms.audience.value_private',
      );
    });

    it('reads the row audience on the chip', () => {
      expectSearch().flush(
        buildResponse({ items: [buildResult({ reuse_visibility: 'tenant' })] }),
      );
      fixture.detectChanges();
      expect(chip()!.getAttribute('data-audience')).toBe('tenant');
      expect(chip()!.textContent).toContain(
        'aplus.studio_atoms.audience.value_tenant',
      );
    });

    it('opens a panel offering the three audiences with the persisted one selected', () => {
      openAudience(buildResult({ reuse_visibility: 'tenant' }));
      expect(
        element.querySelector('[data-testid="studio-atoms-audience-panel"]'),
      ).not.toBeNull();
      for (const a of ['private', 'friends', 'tenant']) {
        expect(
          element.querySelector(`[data-testid="studio-atoms-audience-option-${a}"]`),
        ).not.toBeNull();
      }
      expect(
        element.querySelector<HTMLInputElement>(
          '[data-testid="studio-atoms-audience-option-tenant"]',
        )!.checked,
      ).toBe(true);
    });

    it('keeps a same-value apply off the wire — Apply is disabled until the selection changes', () => {
      openAudience(buildResult({ reuse_visibility: 'tenant' }));
      expect(apply().disabled).toBe(true);
      pick('private');
      expect(apply().disabled).toBe(false);
    });

    it('PATCHes the chosen audience and updates the chip from the server echo', () => {
      openAudience();
      pick('tenant');
      apply().click();

      const req = httpMock.expectOne((r) => r.url.endsWith(PATCH_URL));
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ reuse_visibility: 'tenant' });
      req.flush({ atom_id: ATOM_ID, reuse_visibility: 'tenant' });
      fixture.detectChanges();

      // The chip IS the confirmation: the panel closes, the audience reads back.
      expect(
        element.querySelector('[data-testid="studio-atoms-audience-panel"]'),
      ).toBeNull();
      expect(chip()!.getAttribute('data-audience')).toBe('tenant');
    });

    it('states the frozen-copy consequence before a narrowing, and only then (A1.3)', () => {
      openAudience(buildResult({ reuse_visibility: 'tenant' }));
      pick('private');
      const note = element.querySelector(
        '[data-testid="studio-atoms-audience-narrow-note"]',
      );
      expect(note).not.toBeNull();
      expect(note!.textContent).toContain('aplus.studio_atoms.audience.narrow_note');

      // Widening carries no warning: there is nothing to strand.
      pick('tenant');
      expect(
        element.querySelector('[data-testid="studio-atoms-audience-narrow-note"]'),
      ).toBeNull();
    });

    it('disables Apply while the PATCH is in flight', () => {
      openAudience();
      pick('tenant');
      apply().click();
      fixture.detectChanges();
      expect(apply().disabled).toBe(true);
      httpMock
        .expectOne((r) => r.url.endsWith(PATCH_URL))
        .flush({ atom_id: ATOM_ID, reuse_visibility: 'tenant' });
    });

    it('keeps the chip on the persisted audience and reports a panel-scoped failure', () => {
      openAudience();
      pick('tenant');
      apply().click();
      httpMock
        .expectOne((r) => r.url.endsWith(PATCH_URL))
        .flush(null, { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();

      const err = element.querySelector('[data-testid="studio-atoms-audience-error"]');
      expect(err).not.toBeNull();
      expect(err?.getAttribute('role')).toBe('alert');
      expect(err?.textContent).toContain(
        'aplus.studio_atoms.audience.error_upstream',
      );
      // The audience the chip shows is the one that is persisted, not the ask.
      expect(chip()!.getAttribute('data-audience')).toBe('private');
      // A failed audience change is not a failed list.
      expect(
        element.querySelectorAll('[data-testid^="studio-atom-card-"]').length,
      ).toBe(1);
    });

    it('names the frozen-edition refusal — an orphan can never be re-widened (A1.2)', () => {
      openAudience();
      pick('tenant');
      apply().click();
      httpMock
        .expectOne((r) => r.url.endsWith(PATCH_URL))
        .flush(
          // The creation error envelope is flat: {code, message}.
          { code: 'CREATION_ATOM_ORPHANED_FROZEN', message: 'orphan editions are frozen' },
          { status: 409, statusText: 'Conflict' },
        );
      fixture.detectChanges();
      expect(
        element.querySelector('[data-testid="studio-atoms-audience-error"]')
          ?.textContent,
      ).toContain('aplus.studio_atoms.audience.error_frozen');
    });
  });
});
