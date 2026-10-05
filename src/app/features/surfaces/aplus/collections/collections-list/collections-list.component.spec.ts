/**
 * CollectionsListComponent spec — WS-6b collections list.
 *
 * Tests cover:
 * - Root section renders with data-testid
 * - Loading panel (aria-busy + role=status) rendered on loading
 * - Contract-gap banner for gateway_not_wired error
 * - Generic error banner (role=alert) + retry CTA fires service.loadList()
 * - Empty state renders with create CTA (no grid)
 * - Success state: grid renders cards with title, visibility badge, atom count
 * - Navigation links point to /a/study/collections/{id} + /a/study/collections/new
 * - Accessibility: h1 present, buttons/links have accessible names
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Signal, WritableSignal, computed, signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { TranslateService } from '../../../../../core/services/translate.service';
import { CollectionsListComponent } from './collections-list.component';
import { CollectionsService } from '../collections.service';
import type { Collection, CollectionListState } from '../collections.model';

// ── Fixtures ───────────────────────────────────────────────────────────────────

const COL_ID_1 = '30000000-0000-7000-8000-000000000001';
const COL_ID_2 = '30000000-0000-7000-8000-000000000002';

function buildCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    collection_id: COL_ID_1,
    tenant_id: '10000000-0000-7000-8000-000000000001',
    owner_gcid: '20000000-0000-7000-8000-000000000002',
    title: 'OSI Model Study Guide',
    description: 'Atoms covering the 7 OSI layers.',
    visibility: 'private',
    created_at: '2026-05-26T10:00:00.000Z',
    updated_at: '2026-05-26T10:00:00.000Z',
    atoms: [
      { collection_id: COL_ID_1, atom_id: 'atom-1', position: 0, added_at: '2026-05-26T10:00:00Z' },
    ],
    ...overrides,
  };
}

// ── Stub service ───────────────────────────────────────────────────────────────

class StubCollectionsService {
  readonly _listState: WritableSignal<CollectionListState> = signal<CollectionListState>({
    status: 'loading',
  });
  readonly listState: Signal<CollectionListState> = this._listState.asReadonly();
  readonly collections = computed<readonly Collection[]>(() => {
    const s = this._listState();
    return s.status === 'success' ? s.items : [];
  });

  loadListCalls = 0;
  loadList(): void {
    this.loadListCalls++;
  }

  // Unused methods — stub for completeness
  loadDetail = (_id: string) => undefined;
  detailState = signal({ status: 'loading' as const }).asReadonly();
  detailCollection = computed(() => null);
  editState = signal({ status: 'idle' as const }).asReadonly();
  atomOpState = signal({ status: 'idle' as const }).asReadonly();
  create = () => { throw new Error('not called'); };
  update = () => { throw new Error('not called'); };
  delete = () => { throw new Error('not called'); };
  addAtom = () => { throw new Error('not called'); };
  removeAtom = () => { throw new Error('not called'); };
  resetEditState = () => undefined;
}

// ── Setup ──────────────────────────────────────────────────────────────────────

function setup(): {
  fixture: ComponentFixture<CollectionsListComponent>;
  component: CollectionsListComponent;
  element: HTMLElement;
  service: StubCollectionsService;
} {
  const service = new StubCollectionsService();
  TestBed.configureTestingModule({
    imports: [CollectionsListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      TranslateService,
      { provide: CollectionsService, useValue: service },
    ],
  });
  const fixture = TestBed.createComponent(CollectionsListComponent);
  fixture.detectChanges();
  return {
    fixture,
    component: fixture.componentInstance,
    element: fixture.nativeElement as HTMLElement,
    service,
  };
}

/**
 * Seed the audience copy over the HTTP testing backend so the badge renders the
 * human word rather than the raw i18n key. Without this, `instant()` misses and
 * dev/test mode echoes the key back — so a badge assertion would pass against a
 * key that resolves to nothing in production. Mirrors the real en.json copy.
 */
async function seedAudienceTranslations(): Promise<void> {
  const translate = TestBed.inject(TranslateService);
  const httpMock = TestBed.inject(HttpTestingController);
  const loaded = translate.loadTranslations('en');
  httpMock.expectOne('/assets/i18n/en.json').flush({
    aplus: {
      collections: {
        visibility_private: 'Private',
        visibility_friends: 'Friends',
        visibility_tenant: 'Organisation',
        visibility_badge_aria: 'Audience: {{audience}}',
        // Verbatim from en.json. The error banner renders an i18n KEY through
        // the translate pipe, and `instant()` echoes the key back on a miss —
        // so without seeding this, an error-copy assertion would pass against
        // a key that resolves to nothing, which is exactly the defect the
        // banner assertion exists to catch.
        error_upstream:
          'Something went wrong on our side. Please try again in a moment.',
      },
    },
  });
  await loaded;
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CollectionsListComponent (WS-6b)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  // ── init ──────────────────────────────────────────────────────────────────

  describe('init', () => {
    it('creates and renders the root section', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="collections-list"]')).toBeTruthy();
    });

    it('renders the shared Courses sub-nav strip (CHO-2318, re-pointed C2 slice 3)', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="courses-sub-nav"]')).toBeTruthy();
    });

    it('calls service.loadList() on init', () => {
      const { service } = setup();
      expect(service.loadListCalls).toBeGreaterThan(0);
    });

    it('renders a single h1', () => {
      const { element } = setup();
      expect(element.querySelectorAll('h1').length).toBe(1);
    });
  });

  // ── loading ───────────────────────────────────────────────────────────────

  describe('loading branch', () => {
    it('renders loading panel with aria-busy and role=status', () => {
      const { element } = setup();
      const panel = element.querySelector('[data-testid="collections-list-loading"]');
      expect(panel).toBeTruthy();
      expect(panel?.getAttribute('aria-busy')).toBe('true');
      expect(panel?.getAttribute('role')).toBe('status');
    });

    it('does NOT render the grid while loading', () => {
      const { element } = setup();
      expect(element.querySelector('[data-testid="collections-list-grid"]')).toBeNull();
    });
  });

  // ── error: contract gap ──────────────────────────────────────────────────

  describe('error branch — contract gap (WS-6b-BE-A1)', () => {
    it('renders contract-gap banner for error_gateway_not_wired', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.collections.error_gateway_not_wired',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-list-contract-gap"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('does NOT render generic error panel for gateway_not_wired', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.collections.error_gateway_not_wired',
      });
      fixture.detectChanges();
      expect(element.querySelector('[data-testid="collections-list-error"]')).toBeNull();
    });
  });

  // ── error: generic ────────────────────────────────────────────────────────

  describe('error branch — generic upstream error', () => {
    it('renders error banner with role=alert for upstream errors', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      fixture.detectChanges();
      const banner = element.querySelector('[data-testid="collections-list-error"]');
      expect(banner).toBeTruthy();
      expect(banner?.getAttribute('role')).toBe('alert');
    });

    it('shows a TRANSLATED error message in the banner, never the raw key', async () => {
      // This spec used to be named "shows the error key in the banner" and
      // asserted the learner literally saw `aplus.collections.error_upstream`.
      // It certified the defect as the feature: state.error carries an i18n
      // KEY, and the template rendered `{{ errorKey() }}` with no translate
      // pipe, so all 10 collections error keys reached users raw.
      const { service, fixture, element } = setup();
      await seedAudienceTranslations();
      service._listState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      fixture.detectChanges();
      const msg = element.querySelector('[data-testid="collections-list-error-msg"]');
      const text = msg?.textContent?.trim();
      expect(text).toBe(
        'Something went wrong on our side. Please try again in a moment.',
      );
      // Belt-and-braces: assert the key itself never reaches the DOM. Paired
      // with the positive assertion above, so it cannot pass vacuously.
      expect(text).not.toContain('aplus.collections');
    });

    it('retry CTA re-fires service.loadList()', () => {
      const { service, fixture, element } = setup();
      service._listState.set({
        status: 'error',
        error: 'aplus.collections.error_upstream',
      });
      fixture.detectChanges();
      const before = service.loadListCalls;
      (element.querySelector('[data-testid="collections-list-retry"]') as HTMLButtonElement).click();
      expect(service.loadListCalls).toBe(before + 1);
    });
  });

  // ── empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    function setupEmpty() {
      const ctx = setup();
      ctx.service._listState.set({ status: 'success', items: [], total: 0 });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the empty state when success with no items', () => {
      const { element } = setupEmpty();
      expect(element.querySelector('[data-testid="collections-list-empty"]')).toBeTruthy();
    });

    it('does NOT render the grid when empty', () => {
      const { element } = setupEmpty();
      expect(element.querySelector('[data-testid="collections-list-grid"]')).toBeNull();
    });

    it('renders the create CTA in empty state', () => {
      const { element } = setupEmpty();
      const cta = element.querySelector('[data-testid="collections-list-empty-create-btn"]');
      expect(cta).toBeTruthy();
    });
  });

  // ── success: grid rendering ────────────────────────────────────────────────

  describe('success branch — grid', () => {
    function setupSuccess(items: Collection[]) {
      const ctx = setup();
      ctx.service._listState.set({ status: 'success', items, total: items.length });
      ctx.fixture.detectChanges();
      return ctx;
    }

    it('renders the grid with one card per collection', () => {
      const { element } = setupSuccess([buildCollection()]);
      const grid = element.querySelector('[data-testid="collections-list-grid"]');
      expect(grid).toBeTruthy();
      const cards = grid?.querySelectorAll('li');
      expect(cards?.length).toBe(1);
    });

    it('renders multiple cards for multiple collections', () => {
      const { element } = setupSuccess([
        buildCollection({ collection_id: COL_ID_1 }),
        buildCollection({ collection_id: COL_ID_2 }),
      ]);
      const cards = element.querySelectorAll('[data-testid^="collections-list-card-"]');
      expect(cards.length).toBe(2);
    });

    it('renders the collection title', () => {
      const { element } = setupSuccess([buildCollection({ title: 'OSI Model Study Guide' })]);
      const title = element.querySelector(`[data-testid="collections-list-title-${COL_ID_1}"]`);
      expect(title?.textContent?.trim()).toBe('OSI Model Study Guide');
    });

    // ADR-233 D7 — the audience vocabulary is `private | friends | tenant`.
    // `PUBLIC` is retired: RLS capped collections at the tenant, so it never was
    // public. A tenant-shared collection must NOT render as a padlock.
    it('renders the private visibility badge with a lock icon', async () => {
      const { element, fixture } = setupSuccess([buildCollection({ visibility: 'private' })]);
      await seedAudienceTranslations();
      fixture.detectChanges();
      const badge = element.querySelector(`[data-testid="collections-list-visibility-${COL_ID_1}"]`);
      expect(badge?.textContent).toContain('Private');
      // classList, not className — Angular's [class] binding reorders the tokens.
      expect(badge?.querySelector('i')?.classList.contains('fa-lock')).toBe(true);
    });

    it('renders the friends visibility badge with a user-group icon', async () => {
      const { element, fixture } = setupSuccess([buildCollection({ visibility: 'friends' })]);
      await seedAudienceTranslations();
      fixture.detectChanges();
      const badge = element.querySelector(`[data-testid="collections-list-visibility-${COL_ID_1}"]`);
      expect(badge?.textContent).toContain('Friends');
      expect(badge?.querySelector('i')?.classList.contains('fa-user-group')).toBe(true);
    });

    it('renders the tenant visibility badge with a building icon — never a padlock', async () => {
      const { element, fixture } = setupSuccess([buildCollection({ visibility: 'tenant' })]);
      await seedAudienceTranslations();
      fixture.detectChanges();
      const badge = element.querySelector(`[data-testid="collections-list-visibility-${COL_ID_1}"]`);
      expect(badge?.textContent).toContain('Organisation');
      expect(badge?.querySelector('i')?.classList.contains('fa-building')).toBe(true);
      // The bug this replaces: a tenant-shared collection rendered as a padlock.
      expect(badge?.querySelector('i')?.classList.contains('fa-lock')).toBe(false);
    });

    it('labels the badge for screen readers with the resolved audience', async () => {
      const { element, fixture } = setupSuccess([buildCollection({ visibility: 'tenant' })]);
      await seedAudienceTranslations();
      fixture.detectChanges();
      const badge = element.querySelector(`[data-testid="collections-list-visibility-${COL_ID_1}"]`);
      expect(badge?.getAttribute('aria-label')).toBe('Audience: Organisation');
    });

    it('renders atom count from atoms array', () => {
      const { element } = setupSuccess([
        buildCollection({
          atoms: [
            { collection_id: COL_ID_1, atom_id: 'a-1', position: 0, added_at: '2026-05-26T10:00:00Z' },
            { collection_id: COL_ID_1, atom_id: 'a-2', position: 1, added_at: '2026-05-26T10:01:00Z' },
          ],
        }),
      ]);
      const badge = element.querySelector(`[data-testid="collections-list-atom-count-${COL_ID_1}"]`);
      expect(badge?.textContent).toContain('2');
    });

    it('renders atom count as 0 when atoms field absent', () => {
      const { element } = setupSuccess([buildCollection({ atoms: undefined })]);
      const badge = element.querySelector(`[data-testid="collections-list-atom-count-${COL_ID_1}"]`);
      expect(badge?.textContent).toContain('0');
    });

    it('renders the Study hub sub-nav (CHO-2217: this page is the Collections tab)', () => {
      const { element } = setupSuccess([buildCollection()]);
      expect(element.querySelector('[data-testid="study-sub-nav"]')).not.toBeNull();
    });

    it('card link navigates to /a/study/collections/{id}', () => {
      const { element } = setupSuccess([buildCollection({ collection_id: COL_ID_1 })]);
      const link = element.querySelector(`[data-testid="collections-list-card-${COL_ID_1}"] a`) as HTMLAnchorElement;
      expect(link?.getAttribute('href')).toContain(COL_ID_1);
    });

    it('header create button navigates to /a/study/collections/new', () => {
      const { element } = setupSuccess([]);
      const btn = element.querySelector('[data-testid="collections-list-create-btn"]') as HTMLAnchorElement;
      expect(btn?.getAttribute('href')).toContain('/a/study/collections/new');
    });

    it('renders description when present', () => {
      const { element } = setupSuccess([buildCollection({ description: 'My desc' })]);
      const desc = element.querySelector(`[data-testid="collections-list-desc-${COL_ID_1}"]`);
      expect(desc?.textContent?.trim()).toBe('My desc');
    });

    it('does NOT render description element when absent', () => {
      const { element } = setupSuccess([buildCollection({ description: undefined })]);
      expect(element.querySelector(`[data-testid="collections-list-desc-${COL_ID_1}"]`)).toBeNull();
    });
  });

  // ── accessibility ──────────────────────────────────────────────────────────

  describe('accessibility', () => {
    it('header create button has aria-label', () => {
      const { element } = setup();
      const btn = element.querySelector('[data-testid="collections-list-create-btn"]');
      expect(btn?.getAttribute('aria-label')).toBeTruthy();
    });

    it('grid has aria-label in success state', () => {
      const { service, fixture, element } = setup();
      service._listState.set({ status: 'success', items: [buildCollection()], total: 1 });
      fixture.detectChanges();
      const grid = element.querySelector('[data-testid="collections-list-grid"]');
      expect(grid?.getAttribute('aria-label')).toBeTruthy();
    });
  });
});
