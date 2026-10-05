import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TranslateService } from '../../../../../core/services/translate.service';
import { ConfirmDialogService } from '../../../../../shared/components/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../../shared/components/toast/toast.service';

import { CplusFeedComponent } from './cplus-feed.component';
import type { SharedAtomFeedEntry } from '../../models/cplus-shared-atoms.model';

const CARD_WITH_CAPTION: SharedAtomFeedEntry = {
  share_entry_id: '019700aa-0000-7000-8000-000000000001',
  author_gcid: 'gcid-019700aa-abc',
  author_display_name: 'Phyllis Tan',
  atom_id: '019700bb-0000-7000-8000-0000000000ff',
  atom_revision_id: 'rev-001',
  atom_stem_preview: 'Bayesian inference — priors and posteriors',
  question_type: 'multiple_choice',
  caption: 'Priors finally clicked!',
  license_terms: 'cc_by_sa',
  reaction_count: 12,
  created_at: '2026-06-19T10:00:00Z',
};

const CARD_NO_NAME: SharedAtomFeedEntry = {
  ...CARD_WITH_CAPTION,
  share_entry_id: '019700aa-0000-7000-8000-000000000002',
  author_display_name: '',
  caption: undefined,
  license_terms: 'free',
};

describe('CplusFeedComponent', () => {
  let fixture: ComponentFixture<CplusFeedComponent>;
  let component: CplusFeedComponent;
  let element: HTMLElement;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CplusFeedComponent],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
        TranslateService,
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CplusFeedComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock
      .match((r) => r.url.includes('/v1/me/bookmarks'))
      .forEach((req) => req.flush({ bookmarks: [] }));
    httpMock.verify();
  });

  async function flushFeed(cards: readonly SharedAtomFeedEntry[], nextCursor = ''): Promise<void> {
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/feed/shared-atoms'));
    req.flush({ cards, ...(nextCursor ? { next_cursor: nextCursor } : {}) });
    // Flush the bookmarks GET that ngOnInit fires.
    const bmReq = httpMock.expectOne((r) => r.url.includes('/v1/me/bookmarks'));
    bmReq.flush({ bookmarks: [] });
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('shows loading state on init', () => {
    fixture.detectChanges();
    expect(component.state().status).toBe('loading');
    const status = element.querySelector('.cplus-feed__status');
    expect(status?.textContent).toContain('cplus.feed.loading');
    httpMock.expectOne((r) => r.url.endsWith('/v1/feed/shared-atoms')).flush({ cards: [] });
  });

  it('renders cards on success', async () => {
    await flushFeed([CARD_WITH_CAPTION]);
    expect(component.state().status).toBe('success');
    const articles = element.querySelectorAll('chora-cplus-card');
    expect(articles.length).toBe(1);
  });

  it('renders caption when present', async () => {
    await flushFeed([CARD_WITH_CAPTION]);
    const caption = element.querySelector('.cplus-feed-card__caption');
    expect(caption?.textContent).toContain('Priors finally clicked!');
  });

  it('hides caption when absent', async () => {
    await flushFeed([CARD_NO_NAME]);
    const caption = element.querySelector('.cplus-feed-card__caption');
    expect(caption).toBeNull();
  });

  it('uses author_display_name when present', async () => {
    await flushFeed([CARD_WITH_CAPTION]);
    const author = element.querySelector('.cplus-feed-card__author-name');
    expect(author?.textContent).toContain('Phyllis Tan');
  });

  it('falls back to GCID short handle when display_name is empty', async () => {
    await flushFeed([CARD_NO_NAME]);
    const author = element.querySelector('.cplus-feed-card__author-name');
    expect(author?.textContent).toContain('gcid-019700a');
    expect(author?.textContent).not.toContain('Phyllis');
  });

  it('shows empty state when no cards', async () => {
    await flushFeed([]);
    const emptyState = element.querySelector('chora-cplus-empty-state');
    expect(emptyState).not.toBeNull();
  });

  it('shows infinite scroll sentinel when next_cursor is non-empty', async () => {
    await flushFeed([CARD_WITH_CAPTION], 'cursor-page-2');
    const sentinel = element.querySelector('.cplus-feed__sentinel');
    expect(sentinel).not.toBeNull();
  });

  it('shows error message on failure', async () => {
    fixture.detectChanges();
    const req = httpMock.expectOne((r) => r.url.endsWith('/v1/feed/shared-atoms'));
    req.flush({}, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();
    const err = element.querySelector('.cplus-feed__status--error');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('cplus.feed.');
  });

  it('renders license badge', async () => {
    await flushFeed([CARD_WITH_CAPTION]);
    const badges = element.querySelectorAll('.cplus-feed-card__badge');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    const licenseBadge = element.querySelector('[data-license="cc_by_sa"]');
    expect(licenseBadge).not.toBeNull();
  });

  it('renders royalty badge when royalty_rate present', async () => {
    await flushFeed([
      {
        ...CARD_WITH_CAPTION,
        license_terms: 'royalty_pct',
        royalty_rate: { kind: 'pct', value: 15 },
      },
    ]);
    const royaltyBadge = element.querySelector('.cplus-feed-card__badge--accent');
    expect(royaltyBadge?.textContent).toContain('15%');
  });

  it('has 0 axe critical/serious violations', async () => {
    await flushFeed([CARD_WITH_CAPTION]);
    const axe = (await import('axe-core')).default;
    const results = await axe.run(element);
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(critical.map((v) => `${v.id} [${v.impact}] x${v.nodes.length}`)).toEqual([]);
  });

  describe('filtering + sorting', () => {
    const MCQ_CARD: SharedAtomFeedEntry = {
      ...CARD_WITH_CAPTION,
      share_entry_id: '019700aa-0000-7000-8000-0000000000ee',
      question_type: 'mcq',
      reaction_count: 3,
    };
    const OE_CARD: SharedAtomFeedEntry = {
      ...CARD_WITH_CAPTION,
      share_entry_id: '019700aa-0000-7000-8000-0000000000ef',
      question_type: 'oe',
      reaction_count: 9,
    };

    it('filters cards by question type', async () => {
      await flushFeed([MCQ_CARD, OE_CARD]);
      component.onFilterChange({ target: { value: 'mcq' } } as unknown as Event);
      fixture.detectChanges();
      expect(component.cards()).toHaveLength(1);
      expect(component.cards()[0].question_type).toBe('mcq');
      component.onFilterChange({ target: { value: '' } } as unknown as Event);
      fixture.detectChanges();
      expect(component.cards()).toHaveLength(2);
    });

    it('sorts popular mode by reaction_count descending', async () => {
      const low = { ...CARD_WITH_CAPTION, share_entry_id: 's-low', reaction_count: 5 };
      const high = { ...CARD_WITH_CAPTION, share_entry_id: 's-high', reaction_count: 20 };
      const mid = { ...CARD_WITH_CAPTION, share_entry_id: 's-mid', reaction_count: 9 };
      await flushFeed([low, high, mid]);
      component.onSortChange({ target: { value: 'popular' } } as unknown as Event);
      fixture.detectChanges();
      expect(component.cards().map((c) => c.reaction_count)).toEqual([20, 9, 5]);
    });

    it('onScopeChange reloads the feed for the new scope', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      component.onScopeChange('global');
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/v1/feed/shared-atoms') && r.params.get('scope') === 'global',
      );
      req.flush({ cards: [] });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.scope()).toBe('global');
      expect(component.cards()).toHaveLength(0);
    });
  });

  describe('reactions', () => {
    it('react posts the reaction, stops propagation, and updates live counts', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const stop = vi.fn();
      const p = component.react(
        CARD_WITH_CAPTION.share_entry_id,
        'like',
        { stopPropagation: stop } as unknown as Event,
      );
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.includes('/v1/posts/') && r.url.endsWith('/reactions'),
      );
      expect(req.request.body).toEqual({ kind: 'like' });
      req.flush({
        reaction: { reaction_id: 'r1', kind: 'like' },
        reaction_counts: { like: 13 },
      });
      await p;
      expect(stop).toHaveBeenCalledTimes(1);
      expect(component.getReaction(CARD_WITH_CAPTION.share_entry_id)).toBe('like');
      expect(component.reactionCount(CARD_WITH_CAPTION, 'like')).toBe(13);
    });

    it('reactionCount falls back to the card when no live state exists', async () => {
      await flushFeed([]);
      const ghost = {
        ...CARD_WITH_CAPTION,
        share_entry_id: 'ghost-id',
        reaction_counts: { like: 7 },
      };
      expect(component.reactionCount(ghost, 'like')).toBe(7);
      expect(component.reactionCount({ ...ghost, reaction_counts: undefined }, 'like')).toBe(0);
    });
  });

  describe('bookmarks', () => {
    it('toggleBookmark bookmarks then unbookmarks an atom', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const id = CARD_WITH_CAPTION.atom_id;
      expect(component.isBookmarked(id)).toBe(false);
      const p1 = component.toggleBookmark(id, { stopPropagation: vi.fn() } as unknown as Event);
      const req1 = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith(`/v1/atoms/${id}/bookmark`),
      );
      req1.flush(null, { status: 201, statusText: 'Created' });
      await p1;
      expect(component.isBookmarked(id)).toBe(true);
      const p2 = component.toggleBookmark(id, { stopPropagation: vi.fn() } as unknown as Event);
      const req2 = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith(`/v1/atoms/${id}/bookmark`),
      );
      req2.flush(null, { status: 204, statusText: 'No Content' });
      await p2;
      expect(component.isBookmarked(id)).toBe(false);
    });
  });

  describe('revokeShare', () => {
    it('confirms, deletes the share, and removes the card from the feed', async () => {
      await flushFeed([CARD_WITH_CAPTION, CARD_NO_NAME]);
      const confirm = TestBed.inject(ConfirmDialogService);
      const p = component.revokeShare(
        CARD_WITH_CAPTION,
        { stopPropagation: vi.fn() } as unknown as Event,
      );
      confirm._resolve(true);
      // Macrotask drain: lets the NgZone microtask that arms the revoking
      // flag + subscribes the DELETE run before we re-enter + expectOne.
      await new Promise((resolve) => setTimeout(resolve, 0));
      // A second call while this atom is being revoked is ignored.
      await component.revokeShare(CARD_WITH_CAPTION, { stopPropagation: vi.fn() } as unknown as Event);
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.endsWith(`/v1/atoms/${CARD_WITH_CAPTION.atom_id}/share`),
      );
      req.flush(null, { status: 204, statusText: 'No Content' });
      await p;
      fixture.detectChanges();
      expect(component.revoking()).toBeNull();
      expect(component.cards()).toHaveLength(1);
      expect(component.cards()[0].share_entry_id).toBe(CARD_NO_NAME.share_entry_id);
    });

    it('does nothing when the confirm is declined', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const confirm = TestBed.inject(ConfirmDialogService);
      const p = component.revokeShare(
        CARD_WITH_CAPTION,
        { stopPropagation: vi.fn() } as unknown as Event,
      );
      confirm._resolve(false);
      await p;
      fixture.detectChanges();
      expect(component.cards()).toHaveLength(1);
      expect(component.revoking()).toBeNull();
      httpMock.expectNone((r) => r.method === 'DELETE' && r.url.includes('/share'));
    });

    it('resets the revoking flag when the delete fails', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const confirm = TestBed.inject(ConfirmDialogService);
      const p = component.revokeShare(
        CARD_WITH_CAPTION,
        { stopPropagation: vi.fn() } as unknown as Event,
      );
      confirm._resolve(true);
      // Macrotask drain: lets the NgZone microtask that arms the revoking
      // flag + subscribes the DELETE run before we re-enter + expectOne.
      await new Promise((resolve) => setTimeout(resolve, 0));
      const req = httpMock.expectOne(
        (r) =>
          r.method === 'DELETE' &&
          r.url.endsWith(`/v1/atoms/${CARD_WITH_CAPTION.atom_id}/share`),
      );
      req.flush({}, { status: 500, statusText: 'Server Error' });
      await p;
      expect(component.revoking()).toBeNull();
      expect(component.cards()).toHaveLength(1);
    });
  });

  describe('author profile + follow/block actions', () => {
    /** Flush the sequential following → blocked relation reload (limit=20 GETs). */
    async function flushRelationReload(
      following: string[] = [],
      blocked: string[] = [],
    ): Promise<void> {
      for (const type of ['following', 'blocked'] as const) {
        const req = httpMock.expectOne(
          (r) =>
            r.url.endsWith('/v1/connections') &&
            r.params.get('type') === type &&
            r.params.get('limit') === '20',
        );
        req.flush({
          connections: (type === 'following' ? following : blocked).map((gcid) => ({
            gcid,
            created_at: '',
          })),
        });
        // Macrotask drain: lets the NgZone microtask that issues the next
        // connections GET run before we expectOne it.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    it('viewAuthor loads the following + blocked relation sets', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const stop = vi.fn();
      component.viewAuthor('gcid-someone-001', 'Someone', { stopPropagation: stop } as unknown as Event);
      expect(stop).toHaveBeenCalledTimes(1);
      await flushRelationReload(['gcid-followed-01'], ['gcid-blocked-01']);
      await fixture.whenStable();
      expect(component.selectedAuthor()).toEqual({
        gcid: 'gcid-someone-001',
        displayName: 'Someone',
      });
      expect(component.isFollowingAuthor('gcid-followed-01')).toBe(true);
      expect(component.isBlockedAuthor('gcid-blocked-01')).toBe(true);
      expect(component.isFollowingAuthor('gcid-blocked-01')).toBe(false);
    });

    it('closeAuthor clears the selected author', () => {
      component.selectedAuthor.set({ gcid: 'gcid-x', displayName: 'X' });
      component.closeAuthor();
      expect(component.selectedAuthor()).toBeNull();
    });

    it('toggleFollowAuthor follows an author and refreshes the sets', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const p = component.toggleFollowAuthor('gcid-new-01');
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      req.flush(null, { status: 201, statusText: 'Created' });
      await p;
      await flushRelationReload(['gcid-new-01']);
      await fixture.whenStable();
      expect(component.isFollowingAuthor('gcid-new-01')).toBe(true);
      expect(component.actingGcid()).toBeNull();
    });

    it('ignores a second follow while one is already in-flight', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const p1 = component.toggleFollowAuthor('gcid-dupe-01');
      const p2 = component.toggleFollowAuthor('gcid-dupe-01');
      await p2;
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      req.flush(null, { status: 201, statusText: 'Created' });
      await p1;
      await flushRelationReload(['gcid-dupe-01']);
      await fixture.whenStable();
      expect(component.isFollowingAuthor('gcid-dupe-01')).toBe(true);
    });

    it('toggleFollowAuthor unfollows an already-followed author', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const f = component.toggleFollowAuthor('gcid-f1-01');
      const reqF = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      reqF.flush(null, { status: 201, statusText: 'Created' });
      await f;
      await flushRelationReload(['gcid-f1-01']);
      const u = component.toggleFollowAuthor('gcid-f1-01');
      const reqU = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/v1/connections/follows/gcid-f1-01'),
      );
      reqU.flush(null, { status: 204, statusText: 'No Content' });
      await u;
      await flushRelationReload([]);
      await fixture.whenStable();
      expect(component.isFollowingAuthor('gcid-f1-01')).toBe(false);
    });

    it('toasts when a follow fails', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const toast = TestBed.inject(ToastService);
      const p = component.toggleFollowAuthor('gcid-fail-01');
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      req.flush({}, { status: 500, statusText: 'Server Error' });
      await p;
      expect(
        toast.toasts().some((t) => t.message === 'cplus.feed.follow_failed' && t.type === 'error'),
      ).toBe(true);
      expect(component.actingGcid()).toBeNull();
    });

    it('toasts when an unfollow fails', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const toast = TestBed.inject(ToastService);
      const f = component.toggleFollowAuthor('gcid-f2-01');
      const reqF = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/follows'),
      );
      reqF.flush(null, { status: 201, statusText: 'Created' });
      await f;
      await flushRelationReload(['gcid-f2-01']);
      const u = component.toggleFollowAuthor('gcid-f2-01');
      const reqU = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/v1/connections/follows/gcid-f2-01'),
      );
      reqU.flush({}, { status: 500, statusText: 'Server Error' });
      await u;
      expect(
        toast.toasts().some((t) => t.message === 'cplus.feed.unfollow_failed'),
      ).toBe(true);
    });

    it('toggleBlockAuthor blocks + unblocks and mutates the local set', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const b = component.toggleBlockAuthor('gcid-threat-01');
      const reqB = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/blocks'),
      );
      reqB.flush(null, { status: 204, statusText: 'No Content' });
      await b;
      expect(component.isBlockedAuthor('gcid-threat-01')).toBe(true);
      const u = component.toggleBlockAuthor('gcid-threat-01');
      const reqU = httpMock.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/v1/connections/blocks/gcid-threat-01'),
      );
      reqU.flush(null, { status: 204, statusText: 'No Content' });
      await u;
      expect(component.isBlockedAuthor('gcid-threat-01')).toBe(false);
    });

    it('toasts when a block fails', async () => {
      await flushFeed([CARD_WITH_CAPTION]);
      const toast = TestBed.inject(ToastService);
      const p = component.toggleBlockAuthor('gcid-threat-02');
      const req = httpMock.expectOne(
        (r) => r.method === 'POST' && r.url.endsWith('/v1/connections/blocks'),
      );
      req.flush({}, { status: 500, statusText: 'Server Error' });
      await p;
      expect(toast.toasts().some((t) => t.message === 'cplus.feed.block_failed')).toBe(true);
      expect(component.actingGcid()).toBeNull();
    });
  });

  describe('author display helpers', () => {
    it('authorDisplay uses the display name or falls back to shortGcid', () => {
      expect(component.authorDisplay(CARD_WITH_CAPTION)).toBe('Phyllis Tan');
      // shortGcid keeps the first 8 chars of the digit/hex run: 019700aa.
      expect(component.authorDisplay(CARD_NO_NAME)).toBe('gcid-019700aa');
    });

    it('authorInitial: name char → gcid char → ?', () => {
      expect(component.authorInitial(CARD_WITH_CAPTION)).toBe('P');
      expect(component.authorInitial(CARD_NO_NAME)).toBe('0');
      const degenerate = {
        ...CARD_WITH_CAPTION,
        author_display_name: '',
        author_gcid: 'gcid-',
      };
      expect(component.authorInitial(degenerate)).toBe('?');
    });

    it('authorShareCount + authorAtoms (capped at 5)', async () => {
      const many = Array.from({ length: 7 }, (_, i) => ({
        ...CARD_WITH_CAPTION,
        share_entry_id: `share-many-${i}`,
        author_gcid: 'gcid-author-many-01',
      }));
      await flushFeed(many);
      expect(component.authorShareCount('gcid-author-many-01')).toBe(7);
      expect(component.authorAtoms('gcid-author-many-01')).toHaveLength(5);
      expect(component.authorAtoms('gcid-unknown-01')).toHaveLength(0);
    });

    it('shortGcid truncates and preserves degenerate strings', () => {
      expect(component.shortGcid('gcid-019700aa-abc')).toBe('gcid-019700aa');
      expect(component.shortGcid('gcid-')).toBe('gcid-');
    });
  });

  describe('label + badge helpers', () => {
    it('licenseKey maps known licenses and prefixes unknown ones', () => {
      expect(component.licenseKey('free')).toBe('cplus.feed.license_free');
      expect(component.licenseKey('royalty_pct')).toBe('cplus.feed.license_royalty_pct');
      expect(component.licenseKey('custom_x')).toBe('cplus.feed.license_custom_x');
    });

    it('questionTypeKey maps known types and prefixes unknown ones', () => {
      expect(component.questionTypeKey('mcq')).toBe('cplus.feed.question_type_mcq');
      expect(component.questionTypeKey('oe')).toBe('cplus.feed.question_type_oe');
      expect(component.questionTypeKey('hologram')).toBe('cplus.feed.question_type_hologram');
    });

    it('royaltyDisplay formats pct + flat, null without a rate', () => {
      expect(
        component.royaltyDisplay({ ...CARD_WITH_CAPTION, royalty_rate: undefined }),
      ).toBeNull();
      expect(
        component.royaltyDisplay({ ...CARD_WITH_CAPTION, royalty_rate: { kind: 'pct', value: 15 } }),
      ).toBe('15%');
      expect(
        component.royaltyDisplay({ ...CARD_WITH_CAPTION, royalty_rate: { kind: 'fixed', value: 5 } }),
      ).toBe('5');
    });
  });

  describe('infinite scroll', () => {
    const ORIGINAL_IO = globalThis.IntersectionObserver;

    class FakeIntersectionObserver {
      static instances: FakeIntersectionObserver[] = [];
      observed: Element[] = [];
      callback: IntersectionObserverCallback;

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        FakeIntersectionObserver.instances.push(this);
      }

      observe(el: Element): void {
        this.observed.push(el);
      }

      unobserve(): void {}
      disconnect(): void {}
    }

    beforeEach(() => {
      FakeIntersectionObserver.instances = [];
    });

    afterEach(() => {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
        ORIGINAL_IO;
    });

    it('loads more when the sentinel intersects', async () => {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
        FakeIntersectionObserver;
      await flushFeed([CARD_WITH_CAPTION], 'cursor-2');
      // The observer is created after the 100ms setup delay.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const io = FakeIntersectionObserver.instances[0];
      expect(io).toBeTruthy();
      expect(io.observed).toHaveLength(1);
      io.callback(
        [{ isIntersecting: true } as unknown as IntersectionObserverEntry],
        io as unknown as IntersectionObserver,
      );
      const req = httpMock.expectOne(
        (r) => r.url.endsWith('/v1/feed/shared-atoms') && r.params.get('cursor') === 'cursor-2',
      );
      req.flush({ cards: [CARD_NO_NAME] });
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.cards()).toHaveLength(2);
      expect(component.hasMore()).toBe(false);
      expect(component.loadingMore()).toBe(false);
    });

    it('gives up when there is no sentinel element', async () => {
      (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
        FakeIntersectionObserver;
      await flushFeed([]);
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(FakeIntersectionObserver.instances).toHaveLength(0);
    });
  });
});
